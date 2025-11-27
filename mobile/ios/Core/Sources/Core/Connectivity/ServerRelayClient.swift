import Foundation
import Combine
import OSLog
import Security

/// WebSocket client for connecting to server relay endpoint for device-to-device communication
public class ServerRelayClient: NSObject, ObservableObject {
    private let logger = Logger(subsystem: "PlanToCode", category: "ServerRelayClient")

    // MARK: - Published Properties
    @Published public private(set) var connectionState: ConnectionState = .disconnected
    @Published public private(set) var isConnected: Bool = false
    @Published public private(set) var lastError: ServerRelayError?

    public var allowInternalReconnect: Bool = false
    public var isConnecting: Bool {
        return connectionState == .connecting
    }

    public var hasSessionCredentials: Bool {
        return sessionId != nil
    }

    private func publishOnMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
    }

    // MARK: - Private Properties
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession
    public let serverURL: URL
    private var jwtToken: String?
    private let deviceId: String

    // Resume token state management
    @Published private var sessionId: String?
    public private(set) var resumeToken: String?

    // RPC and event handling
    private var pendingRPCCalls: [String: RpcResponseSubject] = [:]
    private var rpcMetrics: [String: RpcMetrics] = [:]
    private let rpcQueue = DispatchQueue(label: "rpc-queue")
    private let rpcQueueKey = DispatchSpecificKey<Bool>()
    private var eventPublisher = PassthroughSubject<RelayEvent, Never>()
    private var registrationPromise: ((Result<Void, ServerRelayError>) -> Void)?

    // Message queuing
    private struct QueuedMessage {
        let data: Data
        let isHeartbeat: Bool
    }
    private var pendingMessageQueue: [QueuedMessage] = []
    private let maxPendingMessages = 200

    // Connection monitoring
    private var lastMessageReceivedAt: Date = Date()
    private var watchdogTimer: Timer?

    // RPC metrics tracking
    private struct RpcMetrics {
        let method: String
        let targetDeviceId: String
        let startTime: Date
        let requestSize: Int
    }

    /// Public accessor for the events publisher
    public var eventsPublisher: AnyPublisher<RelayEvent, Never> {
        eventPublisher
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    // Binary terminal bytes publisher
    public struct TerminalBytesEvent {
        public let data: Data
        public let timestamp: Date
        public let sessionId: String?

        public init(data: Data, timestamp: Date, sessionId: String? = nil) {
            self.data = data
            self.timestamp = timestamp
            self.sessionId = sessionId
        }
    }
    private let terminalBytesSubject = PassthroughSubject<TerminalBytesEvent, Never>()
    public var terminalBytes: AnyPublisher<TerminalBytesEvent, Never> {
        terminalBytesSubject
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    // Connection management
    private var heartbeatTimer: Timer?
    private var reconnectionTimer: Timer?
    private var registrationTimer: Timer?
    private var isReconnecting = false
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 0  // 0 = unlimited reconnection attempts

    private var currentBinaryBind: (sessionId: String, producerDeviceId: String)?
    private var cancellables = Set<AnyCancellable>()
    private var isDisconnecting = false

    // Single owner for internal reconnect subscription; prevents accumulating reconnect sinks.
    private var reconnectionCancellable: AnyCancellable?

    // MARK: - Public Interface

    /// Stream of incoming events from the relay
    public var events: AnyPublisher<RelayEvent, Never> {
        eventPublisher
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    // MARK: - Initialization

    public init(serverURL: URL, deviceId: String, sessionDelegate: URLSessionDelegate? = nil) {
        self.serverURL = serverURL
        self.deviceId = deviceId

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = true

        let delegate = sessionDelegate ?? CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.urlSession = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)

        super.init()

        // Mark the rpcQueue so we can detect if we're already on it
        rpcQueue.setSpecific(key: rpcQueueKey, value: true)

        setupApplicationLifecycleObservers()

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-token-refreshed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { [weak self] in
                guard let self = self else { return }
                if let token = await AuthService.shared.getValidAccessToken() {
                    self.jwtToken = token
                }
            }
        }
    }

    deinit {
        disconnect()
        cancellables.removeAll()
    }

    // MARK: - Connection Management

    /// Wait for connection with credentials to be established, with timeout
    public func waitForConnection(timeout: TimeInterval) async throws {
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var cancellable: AnyCancellable?
            var timeoutTimer: Timer?

            let cleanup = {
                cancellable?.cancel()
                timeoutTimer?.invalidate()
            }

            // Check if already ready (optimization)
            if case .connected = connectionState, hasSessionCredentials {
                cleanup()
                continuation.resume(returning: ())
                return
            }

            // Start timeout timer
            timeoutTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { _ in
                cleanup()
                continuation.resume(throwing: ConnectionError.timeout)
            }

            // Observe BOTH connectionState AND sessionId (for credentials)
            // CombineLatest ensures we react to changes in either publisher
            let statePublisher = $connectionState
            let credentialsPublisher = $sessionId.map { _ in () }

            cancellable = Publishers.CombineLatest(statePublisher, credentialsPublisher)
                .sink { [weak self] state, _ in
                    guard let self = self else {
                        cleanup()
                        continuation.resume(throwing: ConnectionError.terminal(ServerRelayError.invalidState("Client deallocated")))
                        return
                    }

                    switch state {
                    case .connected where self.hasSessionCredentials:
                        // Connected AND has credentials - ready!
                        cleanup()
                        continuation.resume(returning: ())
                    case .failed(let error):
                        cleanup()
                        continuation.resume(throwing: ConnectionError.terminal(error))
                    case .connected, .disconnected, .connecting, .handshaking, .authenticating, .reconnecting, .closing:
                        // Still waiting (either not connected OR connected but no credentials)
                        break
                    }
                }
        }
    }

    /// Connect to the relay endpoint with JWT authentication
    public func connect(jwtToken: String) -> AnyPublisher<Void, ServerRelayError> {
        self.jwtToken = jwtToken

        return Future<Void, ServerRelayError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState("Client deallocated")))
                return
            }

            // Build WebSocket URL - prefer Config.deviceLinkWebSocketURL for consistency
            let wsURL: URL
            if let configURL = URL(string: Config.serverURL), configURL == self.serverURL {
                // Use Config's device-link WebSocket URL if serverURL matches
                wsURL = Config.deviceLinkWebSocketURL
            } else {
                // Fallback: Build WebSocket URL with proper ws/wss scheme
                var wsURLString = self.serverURL.absoluteString
                if wsURLString.hasPrefix("https://") {
                    wsURLString = wsURLString.replacingOccurrences(of: "https://", with: "wss://")
                } else if wsURLString.hasPrefix("http://") {
                    wsURLString = wsURLString.replacingOccurrences(of: "http://", with: "ws://")
                }

                // Append WebSocket path
                if !wsURLString.hasSuffix("/") {
                    wsURLString += "/"
                }
                wsURLString += "ws/device-link"

                guard let constructedURL = URL(string: wsURLString) else {
                    promise(.failure(.invalidURL))
                    return
                }
                wsURL = constructedURL
            }

            // Log WebSocket connection details for diagnostics
            self.logger.info("Attempting WebSocket connection to host: \(wsURL.host ?? "unknown"), path: \(wsURL.path)")

            var request = URLRequest(url: wsURL)
            // Set headers: Authorization: "Bearer \(jwt)", X-Device-ID: deviceId, X-Token-Binding: deviceId, X-Client-Type: "mobile"
            request.setValue("Bearer \(jwtToken)", forHTTPHeaderField: "Authorization")
            request.setValue(self.deviceId, forHTTPHeaderField: "X-Device-ID")
            request.setValue(self.deviceId, forHTTPHeaderField: "X-Token-Binding")
            request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")

            self.logger.info("Connecting to server relay: \(wsURL)")

            if let existingTask = self.webSocketTask {
                if existingTask.state == .running || existingTask.state == .suspended {
                    existingTask.cancel(with: .goingAway, reason: nil)
                    self.heartbeatTimer?.invalidate()
                    self.heartbeatTimer = nil
                    self.watchdogTimer?.invalidate()
                    self.watchdogTimer = nil
                    self.publishOnMain {
                        self.connectionState = .disconnected
                        self.isConnected = false
                    }
                }
                self.webSocketTask = nil
            }

            self.publishOnMain {
                self.connectionState = .connecting
                self.isConnected = false
            }

            self.webSocketTask = self.urlSession.webSocketTask(with: request)
            self.webSocketTask?.maximumMessageSize = 32 * 1024 * 1024
            self.webSocketTask?.resume()

            // Start receiving messages
            self.startReceivingMessages()

            // Store the promise for completion when registration succeeds
            self.registrationPromise = promise

            // Send device registration immediately
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.sendRegistration()

                // Start registration timeout timer
                DispatchQueue.main.async { [weak self] in
                    self?.registrationTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
                        guard let self = self else { return }
                        if self.registrationPromise != nil {
                            self.logger.error("Registration handshake timeout - no response received")
                            self.publishOnMain {
                                self.connectionState = .failed(ServerRelayError.timeout)
                                self.isConnected = false
                                self.lastError = .timeout
                            }
                            self.disconnect(isUserInitiated: false)
                            self.registrationPromise?(.failure(.timeout))
                            self.registrationPromise = nil
                        }
                    }
                }
            }
        }
        .eraseToAnyPublisher()
    }

    public func clearResumeToken() {
        try? KeychainManager.shared.delete(for: .relayResumeToken(deviceId: self.deviceId))
    }

    public static func clearResumeToken(deviceId: UUID) {
        try? KeychainManager.shared.delete(for: .relayResumeToken(deviceId: deviceId.uuidString))
    }

    /// Disconnect from the relay
    /// - Parameter isUserInitiated: If true, clears all queues and pending RPCs. If false (network drop), keeps state for reconnection.
    public func disconnect(isUserInitiated: Bool = true) {
        if isDisconnecting { return }
        if webSocketTask == nil, connectionState == .disconnected {
            return
        }
        isDisconnecting = true
        defer { isDisconnecting = false }

        logger.info("Disconnecting from server relay (user-initiated: \(isUserInitiated))")

        publishOnMain {
            self.connectionState = .disconnected
            self.isConnected = false
        }
        stopHeartbeat()
        stopWatchdog()

        if isUserInitiated {
            stopReconnection()
        }

        registrationTimer?.invalidate()
        registrationTimer = nil

        if isUserInitiated {
            self.sessionId = nil
            self.resumeToken = nil
        }

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil

        executeSafelyOnRpcQueue {
            let pendingIds = Array(self.pendingRPCCalls.keys)
            let subjects = Array(self.pendingRPCCalls.values)

            for (id, subject) in zip(pendingIds, subjects) {
                subject.send(completion: .failure(.disconnected))
                self.removePendingCall(id: id)
            }
        }

        pendingMessageQueue.removeAll()
    }

    // MARK: - RPC Calls

    private func formatBytes(_ bytes: Int) -> String {
        let units = ["B", "KB", "MB", "GB"]
        var value = Double(bytes)
        var unitIndex = 0

        while value >= 1024 && unitIndex < units.count - 1 {
            value /= 1024
            unitIndex += 1
        }

        if unitIndex == 0 {
            return "\(bytes) B"
        } else {
            return String(format: "%.2f %@", value, units[unitIndex])
        }
    }

    /// Safely executes a block on rpcQueue, avoiding deadlock if already on the queue
    private func executeSafelyOnRpcQueue(_ block: @escaping () -> Void) {
        if DispatchQueue.getSpecific(key: rpcQueueKey) == true {
            // Already on rpcQueue, execute immediately
            block()
        } else {
            // Not on rpcQueue, use sync
            rpcQueue.sync(execute: block)
        }
    }

    // Centralized cleanup for per-RPC state: always use this to remove pendingRPCCalls/rpcMetrics entries.
    private func removePendingCall(id: String) {
        executeSafelyOnRpcQueue {
            self.pendingRPCCalls.removeValue(forKey: id)
            self.rpcMetrics.removeValue(forKey: id)
        }
    }

    /// Invoke an RPC method on a target device
    ///
    /// Expected envelope sent to server:
    /// {
    ///   "type": "relay",
    ///   "payload": {
    ///     "targetDeviceId": "<desktop-uuid>",
    ///     "messageType": "rpc",
    ///     "payload": {
    ///       "method": "<method-name>",
    ///       "params": {...},
    ///       "correlationId": "<correlation-id>"
    ///     }
    ///   }
    /// }
    public func invoke(
        targetDeviceId: String,
        request: RpcRequest,
        timeout: TimeInterval = 30.0
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        return AsyncThrowingStream { continuation in
            // PREFLIGHT VALIDATION

            // 1. Validate targetDeviceId is valid UUID and non-empty
            guard let _ = UUID(uuidString: targetDeviceId),
                  !targetDeviceId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                continuation.finish(throwing: ServerRelayError.invalidState("Invalid or missing targetDeviceId"))
                return
            }

            // 2. Validate request.method is non-empty
            guard !request.method.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                continuation.finish(throwing: ServerRelayError.invalidState("Missing request.method"))
                return
            }

            // 3. Generate id if missing (create new RpcRequest if needed)
            let req: RpcRequest
            if request.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                req = RpcRequest(method: request.method, params: request.params.mapValues { $0.value }, id: UUID().uuidString)
            } else {
                req = request
            }

            // 4. Determine if this is a mutating method and generate idempotency key
            let isMutating: Bool = {
                let lower = req.method.lowercased()
                return lower.hasPrefix("create")
                    || lower.hasPrefix("update")
                    || lower.hasPrefix("delete")
                    || lower.hasPrefix("set")
                    || lower.hasPrefix("sync")
                    || lower.hasPrefix("kill")
                    || lower.hasPrefix("start")
            }()
            let idempotencyKey = isMutating ? UUID().uuidString : nil

            // Create response subject for this call
            let responseSubject = PassthroughSubject<RpcResponse, ServerRelayError>()

            rpcQueue.async {
                self.pendingRPCCalls[req.id] = responseSubject
            }

            // Subscribe to responses and stream them
            let cancellable = responseSubject
                .timeout(.seconds(timeout), scheduler: DispatchQueue.main, options: nil, customError: {
                    self.rpcQueue.async {
                        if let metrics = self.rpcMetrics[req.id] {
                            let shortTargetId = String(metrics.targetDeviceId.prefix(8))
                            self.logger.warning("[RPC] \(metrics.method) -> \(shortTargetId) | Timeout after \(timeout)s")
                        }
                    }
                    return ServerRelayError.timeout
                })
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .finished:
                            continuation.finish()
                        case .failure(let error):
                            self.rpcQueue.async {
                                if let metrics = self.rpcMetrics[req.id] {
                                    let duration = Date().timeIntervalSince(metrics.startTime)
                                    let shortTargetId = String(metrics.targetDeviceId.prefix(8))
                                    let errorDesc = error.localizedDescription

                                    self.logger.error("[RPC] \(metrics.method) -> \(shortTargetId) | Status: Failed | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(metrics.requestSize)) | Error: \(errorDesc)")
                                }
                            }
                            continuation.finish(throwing: error)
                        }

                        self.removePendingCall(id: req.id)
                    },
                    receiveValue: { response in
                        continuation.yield(response)

                        if response.isFinal {
                            continuation.finish()
                        }
                    }
                )

            continuation.onTermination = { _ in
                cancellable.cancel()
                self.removePendingCall(id: req.id)
            }

            var rpcPayload: [String: Any] = [
                "method": req.method,
                "params": req.params.mapValues { $0.jsonValue },
                "correlationId": req.id
            ]
            if let key = idempotencyKey {
                rpcPayload["idempotencyKey"] = key
            }

            var payload: [String: Any] = [
                "targetDeviceId": targetDeviceId,
                "request": rpcPayload
            ]

            // 5. Validate encodability and wait for connection
            Task { [weak self] in
                guard let self = self else {
                    continuation.finish(throwing: ServerRelayError.invalidState("Client deallocated"))
                    return
                }

                let userId = await MainActor.run { AuthService.shared.currentUser?.id }
                payload["userId"] = userId ?? ""

                do {
                    // Wait for connection if not already connected
                    if case .disconnected = self.connectionState {
                        // Not connected, initiate connection if we have a token
                        if let token = self.jwtToken {
                            _ = self.connect(jwtToken: token)
                        }
                    }

                    // Wait for connection to be established
                    // Skip wait for states that already queue messages - they'll be sent when ready
                    switch self.connectionState {
                    case .connected:
                        // Already connected, proceed immediately
                        break
                    case .connecting, .handshaking, .authenticating, .reconnecting:
                        // These states queue messages automatically - use shorter timeout
                        try await self.waitForConnection(timeout: 2.0)
                    case .disconnected, .closing, .failed:
                        // Need full connection - but still reduced timeout
                        try await self.waitForConnection(timeout: 3.0)
                    }

                    let envelope: [String: Any] = [
                        "type": "relay",
                        "payload": payload
                    ]
                    let encodedString: String
                    do {
                        encodedString = try self.encodeForWebSocket(envelope)
                    } catch {
                        self.removePendingCall(id: req.id)
                        continuation.finish(throwing: ServerRelayError.encodingError(error))
                        return
                    }
                    let requestSize = encodedString.utf8.count

                    let metrics = RpcMetrics(
                        method: req.method,
                        targetDeviceId: targetDeviceId,
                        startTime: Date(),
                        requestSize: requestSize
                    )
                    self.rpcQueue.async {
                        self.rpcMetrics[req.id] = metrics
                    }

                    try await self.sendMessage(type: "relay", payload: payload)
                } catch {
                    self.removePendingCall(id: req.id)
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Private Methods

    /// Encodes an Encodable object to a JSON string for WebSocket transmission.
    /// Uses JSONEncoder with default (camelCase) strategy for consistent key naming.
    /// - Parameter object: The Encodable object to encode
    /// - Returns: A JSON string representation
    /// - Throws: ServerRelayError.encodingError if encoding fails
    private func encodeForWebSocket<T: Encodable>(_ object: T) throws -> String {
        let encoder = JSONEncoder()
        // Use default key encoding strategy (camelCase) - no custom strategies
        encoder.dateEncodingStrategy = .iso8601

        do {
            let jsonData = try encoder.encode(object)
            guard let jsonString = String(data: jsonData, encoding: .utf8) else {
                throw ServerRelayError.encodingError(
                    NSError(
                        domain: "ServerRelayClient.Encoding",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to convert JSON data to UTF-8 string"]
                    )
                )
            }
            return jsonString
        } catch {
            throw ServerRelayError.encodingError(error)
        }
    }

    /// Encodes an object to a JSON string for WebSocket transmission.
    /// Sanitizes the object to ensure JSON compatibility and prevents serialization crashes.
    /// - Parameter object: The object to encode
    /// - Returns: A JSON string representation
    /// - Throws: ServerRelayError.encodingError if encoding fails
    private func encodeForWebSocket(_ object: Any) throws -> String {
        // Step 1: Sanitize the object
        let sanitized = JSONSanitizer.sanitize(object)

        // Step 2: Validate JSON compatibility
        guard JSONSanitizer.isValidJSONObject(sanitized) else {
            let keys: [String]
            let types: [String]

            if let dict = sanitized as? [String: Any] {
                keys = Array(dict.keys)
                types = dict.map { key, value in "\(key): \(type(of: value))" }
            } else {
                keys = []
                types = ["root: \(type(of: sanitized))"]
            }

            throw ServerRelayError.encodingError(
                NSError(
                    domain: "ServerRelayClient.Encoding",
                    code: -1,
                    userInfo: [
                        "keys": keys,
                        "types": types
                    ]
                )
            )
        }

        // Step 3: Serialize to JSON data
        let jsonData = try JSONSerialization.data(withJSONObject: sanitized)

        // Step 4: Convert to UTF-8 string
        guard let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw ServerRelayError.encodingError(
                NSError(
                    domain: "ServerRelayClient.Encoding",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to convert JSON data to UTF-8 string"]
                )
            )
        }

        // Step 5: Debug logging (DEBUG mode only)
        #if DEBUG
        // JSON encoding successful - not logging content for security
        #endif

        return jsonString
    }

    // Send registration message on open
    private func sendRegistration() {
        // Check if resume credentials exist in Keychain
        let payload: [String: Any]

        if let resumeMeta = try? KeychainManager.shared.retrieve(
            type: RelaySessionMeta.self,
            for: KeychainManager.KeychainItem.relayResumeToken(deviceId: self.deviceId),
            prompt: nil
        ) {
            // Send register message with resume credentials
            payload = [
                "deviceId": self.deviceId,
                "deviceName": UIDevice.current.name,
                "sessionId": resumeMeta.sessionId,
                "resumeToken": resumeMeta.resumeToken
            ]
            logger.info("Attempting to register with resume credentials, deviceId=\(self.deviceId)")
        } else {
            // Send register message
            payload = [
                "deviceId": self.deviceId,
                "deviceName": UIDevice.current.name
            ]
            logger.info("Registering new session, deviceId=\(self.deviceId)")
        }

        do {
            // Build envelope manually to avoid Encodable conformance issues
            let envelope: [String: Any] = [
                "type": "register",
                "payload": payload
            ]
            let jsonString = try encodeForWebSocket(envelope)

            // Use webSocketTask.send(.string(json)) exclusively (no .data frames)
            webSocketTask?.send(.string(jsonString)) { [weak self] error in
                if let error = error {
                    self?.registrationPromise?(.failure(.networkError(error)))
                    self?.registrationPromise = nil
                } else {
                    // Registration sent successfully, but don't complete promise yet
                    // Wait for "registered" or "resumed" response in message handler
                    self?.logger.info("Registration/resume message sent")
                }
            }
        } catch {
            registrationPromise?(.failure(.encodingError(error)))
            registrationPromise = nil
        }
    }

    public func sendMessage(type: String, payload: [String: Any]?) async throws {
        var envelope: [String: Any] = ["type": type]
        if let payload = payload {
            envelope["payload"] = payload
        }

        let jsonString = try encodeForWebSocket(envelope)
        let messageData = jsonString.data(using: .utf8)!
        let isHeartbeat = (type == "heartbeat")

        switch connectionState {
        case .connected where hasSessionCredentials:
            guard let webSocketTask = webSocketTask else {
                logger.error("sendMessage FAILED: webSocketTask is nil (type=\(type))")
                throw ServerRelayError.notConnected
            }

            do {
                try await webSocketTask.send(.string(jsonString))
            } catch {
                logger.error("WebSocket send failed for type=\(type): \(error)")
                throw error
            }

        case .connecting, .handshaking, .authenticating, .reconnecting:
            if pendingMessageQueue.count >= maxPendingMessages {
                if let idx = pendingMessageQueue.firstIndex(where: { $0.isHeartbeat }) {
                    pendingMessageQueue.remove(at: idx)
                } else {
                    pendingMessageQueue.removeFirst()
                }
            }
            let queuedMessage = QueuedMessage(data: messageData, isHeartbeat: isHeartbeat)
            pendingMessageQueue.append(queuedMessage)

        case .disconnected, .closing, .failed, .connected:
            if pendingMessageQueue.count >= maxPendingMessages {
                if let idx = pendingMessageQueue.firstIndex(where: { $0.isHeartbeat }) {
                    pendingMessageQueue.remove(at: idx)
                } else {
                    pendingMessageQueue.removeFirst()
                }
            }
            let queuedMessage = QueuedMessage(data: messageData, isHeartbeat: isHeartbeat)
            pendingMessageQueue.append(queuedMessage)
        }
    }

    /// Flush all queued messages after connection is established
    private func flushMessageQueue() {
        guard !pendingMessageQueue.isEmpty else { return }

        let messagesToSend = pendingMessageQueue
        pendingMessageQueue.removeAll()

        logger.info("Flushing \(messagesToSend.count) queued messages")

        Task { [weak self] in
            guard let self = self else { return }
            for queuedMsg in messagesToSend {
                if let jsonString = String(data: queuedMsg.data, encoding: .utf8) {
                    do {
                        try await self.webSocketTask?.send(.string(jsonString))
                    } catch {
                        self.logger.error("Failed to send queued message: \(error)")
                    }
                }
            }
        }
    }

    // Relay event publisher for ephemeral cross-device signals
    /// Publish an ephemeral event to all connected devices via relay
    public func sendEvent(eventType: String, data: [String: Any]) async throws {
        let payload: [String: Any] = [
            "eventType": eventType,
            "payload": data
        ]
        try await self.sendMessage(type: "event", payload: payload)
    }

    /// Send control message to bind this mobile device to a desktop producer for binary terminal output
    public func sendBinaryBind(producerDeviceId: String, sessionId: String, includeSnapshot: Bool = true) async throws {
        if case .connected = connectionState, hasSessionCredentials {
            // Already connected with credentials - proceed
        } else {
            do {
                try await waitForConnection(timeout: 5.0)
            } catch {
                logger.error("sendBinaryBind: Connection timeout, cannot bind sessionId=\(sessionId)")
                throw ServerRelayError.timeout
            }
        }

        self.currentBinaryBind = (sessionId, producerDeviceId)
        logger.info("sendBinaryBind: binding to sessionId=\(sessionId), producerDeviceId=\(producerDeviceId.prefix(8)), includeSnapshot=\(includeSnapshot)")

        let payload: [String: Any] = [
            "producerDeviceId": producerDeviceId,
            "sessionId": sessionId,
            "includeSnapshot": includeSnapshot
        ]

        try await self.sendMessage(type: "terminal.binary.bind", payload: payload)
    }

    /// Send control message to unbind binary terminal output
    public func sendBinaryUnbind(sessionId: String? = nil) {
        Task { [weak self] in
            guard let self = self else { return }
            do {
                let payload = sessionId.map { ["sessionId": $0] }
                try await self.sendMessage(type: "terminal.binary.unbind", payload: payload)

                if let current = self.currentBinaryBind, let sid = sessionId {
                    if current.sessionId == sid {
                        self.currentBinaryBind = nil
                    }
                } else {
                    self.currentBinaryBind = nil
                }
            } catch {
                logger.error("Failed to send binary unbind: \(error)")
            }
        }
    }

    private func startReceivingMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                self.handleWebSocketMessage(message)
                // Continue receiving
                self.startReceivingMessages()

            case .failure(let error):
                self.logger.error("WebSocket receive error: \(error)")
                self.handleConnectionError(error)
            }
        }
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            // In receive loop (text-only), route by root["type"]
            handleTextMessage(text)
        case .data(let data):
            // Binary frames are raw terminal output - publish as-is without inspection
            let sessionId = self.currentBinaryBind?.sessionId
            publishOnMain {
                self.terminalBytesSubject.send(
                    TerminalBytesEvent(
                        data: data,
                        timestamp: Date(),
                        sessionId: sessionId
                    )
                )
            }
        @unknown default:
            break
        }
    }

    private func handleTextMessage(_ text: String) {
        // Update watchdog timestamp
        lastMessageReceivedAt = Date()

        guard let data = text.data(using: .utf8) else {
            logger.error("Failed to convert text to data")
            return
        }

        do {
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                logger.error("Invalid message format - not a JSON object")
                return
            }

            // Check for DeviceMessage format (with messageType field) first
            if let messageType = json["messageType"] as? String {
                handleDeviceMessageEvent(json)
                return
            }

            // Check for standard relay message format (with type field)
            guard let messageType = json["type"] as? String else {
                logger.error("Invalid message format - missing both 'type' and 'messageType' fields")
                return
            }

            // Fallback: check for relayPassthrough wrapper
            if messageType == "relayPassthrough" {
                if let innerData = json["data"] as? [String: Any] {
                    // Check if inner has "type" field
                    if innerData["type"] != nil {
                        // Re-serialize and re-route
                        if let reEncodedData = try? JSONSerialization.data(withJSONObject: innerData),
                           let reEncodedText = String(data: reEncodedData, encoding: .utf8) {
                            handleTextMessage(reEncodedText)
                            return
                        }
                    } else if innerData["messageType"] != nil {
                        // Route as device message
                        handleDeviceMessageEvent(innerData)
                        return
                    }
                }
                // If we can't route it, just ignore
                logger.debug("Ignoring relayPassthrough message with no recognizable inner type")
                return
            }

            // Route by root["type"]
            switch messageType {
            case "registered":
                handleRegisteredMessage(json)
            case "resumed":
                handleResumedMessage(json)
            case "session":
                handleSessionMessage(json)
            case "relay_response":
                handleRelayResponseMessage(json)
            case "relay_event":
                handleRelayEventMessage(json)
            case "error":
                handleErrorMessage(json)
            case "device-status":
                if let json = json as? [String: Any] {
                    handleDeviceStatusMessage(json)
                }
            default:
                logger.debug("Received unknown message type: \(messageType)")
            }
        } catch {
            logger.error("Failed to decode message: \(error)")
        }
    }

    private func handleRegisteredMessage(_ json: [String: Any]) {
        // Cancel registration timeout timer
        registrationTimer?.invalidate()
        registrationTimer = nil

        logger.info("Device registered with relay server")

        // Extract optional session credentials
        if let sessionId = json["sessionId"] as? String {
            self.sessionId = sessionId
            logger.info("Registered with session")
        }

        if let resumeToken = json["resumeToken"] as? String {
            self.resumeToken = resumeToken

            // Persist to keychain if we have both sessionId and resumeToken
            if let sessionId = self.sessionId {
                let expiresAt = json["expiresAt"] as? String
                let resumeMeta = RelaySessionMeta(
                    sessionId: sessionId,
                    resumeToken: resumeToken,
                    expiresAtISO: expiresAt
                )
                try? KeychainManager.shared.store(
                    object: resumeMeta,
                    for: KeychainManager.KeychainItem.relayResumeToken(deviceId: deviceId)
                )
            }
        }

        // Create handshake for connected state
        let handshake = ConnectionHandshake(
            sessionId: self.sessionId ?? UUID().uuidString,
            clientId: deviceId,
            transport: "websocket"
        )

        publishOnMain {
            self.connectionState = .connected(handshake)
            self.isConnected = true
        }
        reconnectAttempts = 0
        startHeartbeat()
        startWatchdog()

        // Flush any queued messages
        flushMessageQueue()

        // Complete registration promise
        registrationPromise?(.success(()))
        registrationPromise = nil
    }

    private func handleResumedMessage(_ json: [String: Any]) {
        // Cancel registration timeout timer
        registrationTimer?.invalidate()
        registrationTimer = nil

        logger.info("Relay session resumed successfully")

        // Extract sessionId and expiresAt
        guard let sessionId = json["sessionId"] as? String else {
            logger.error("Missing sessionId in resumed response")
            registrationPromise?(.failure(.serverError("invalid_response", "Missing sessionId")))
            registrationPromise = nil
            return
        }

        logger.info("Resumed session successfully")

        let expiresAt = json["expiresAt"] as? String

        // Update expiresAt in keychain if we have the resume token
        if let existingMeta = try? KeychainManager.shared.retrieve(
            type: RelaySessionMeta.self,
            for: KeychainManager.KeychainItem.relayResumeToken(deviceId: deviceId),
            prompt: nil
        ) {
            let updatedMeta = RelaySessionMeta(
                sessionId: sessionId,
                resumeToken: existingMeta.resumeToken,
                expiresAtISO: expiresAt
            )
            try? KeychainManager.shared.store(
                object: updatedMeta,
                for: KeychainManager.KeychainItem.relayResumeToken(deviceId: deviceId)
            )
        }

        // Store sessionId in instance var
        self.sessionId = sessionId

        // Create a handshake object for the connected state
        let handshake = ConnectionHandshake(
            sessionId: sessionId,
            clientId: deviceId,
            transport: "websocket"
        )

        publishOnMain {
            self.connectionState = .connected(handshake)
            self.isConnected = true
        }
        reconnectAttempts = 0
        startHeartbeat()
        startWatchdog()

        // Flush any queued messages
        flushMessageQueue()

        // Complete the registration promise
        registrationPromise?(.success(()))
        registrationPromise = nil
    }

    private func handleSessionMessage(_ json: [String: Any]) {
        logger.info("Received session details from server")

        if let sessionId = json["sessionId"] as? String {
            self.sessionId = sessionId
        }

        if let resumeToken = json["resumeToken"] as? String {
            self.resumeToken = resumeToken

            if let sessionId = self.sessionId {
                let expiresAt = json["expiresAt"] as? String
                let resumeMeta = RelaySessionMeta(
                    sessionId: sessionId,
                    resumeToken: resumeToken,
                    expiresAtISO: expiresAt
                )
                try? KeychainManager.shared.store(
                    object: resumeMeta,
                    for: KeychainManager.KeychainItem.relayResumeToken(deviceId: deviceId)
                )
            }
        }
    }

    private func handleRelayResponseMessage(_ json: [String: Any]) {
        guard let responseDict = json["response"] as? [String: Any] else {
            logger.warning("Relay response missing response field")
            return
        }

        // Extract correlationId - ONLY camelCase
        guard let correlationId = responseDict["correlationId"] as? String else {
            logger.warning("Relay response missing correlationId")
            return
        }

        // Parse isFinal - ONLY camelCase, default to true if not present
        let isFinal = (responseDict["isFinal"] as? Bool) ?? true

        rpcQueue.async {
            guard let responseSubject = self.pendingRPCCalls[correlationId] else {
                self.logger.warning("Received relay response for unknown call: \(correlationId)")
                return
            }

            // Check for queued response (not an error)
            if let resultDict = responseDict["result"] as? [String: Any],
               let queued = resultDict["queued"] as? Bool,
               queued == true {
                // This is a success - message was queued by server for later delivery
                self.logger.info("RPC response indicates message was queued (correlationId: \(correlationId))")
            }

            // Parse error field
            let errorMsg = responseDict["error"] as? String
            let rpcError: RpcError? = errorMsg.map {
                RpcError(code: -1, message: $0)
            }

            // Create RpcResponse
            let rpcResponse = RpcResponse(
                id: correlationId,
                result: responseDict["result"],
                error: rpcError,
                isFinal: isFinal
            )

            responseSubject.send(rpcResponse)

            // Log metrics if this is the final response or an error
            if isFinal || rpcError != nil {
                if let metrics = self.rpcMetrics[correlationId] {
                    let duration = Date().timeIntervalSince(metrics.startTime)

                    // Calculate response size
                    let responseSize: Int
                    if let responseData = try? JSONSerialization.data(withJSONObject: responseDict) {
                        responseSize = responseData.count
                    } else {
                        responseSize = 0
                    }

                    let status = rpcError != nil ? "Error" : "Success"
                    let shortTargetId = String(metrics.targetDeviceId.prefix(8))

                    if rpcError != nil {
                        self.logger.error("[RPC] \(metrics.method) -> \(shortTargetId) | Status: \(status) | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(metrics.requestSize)) | Response: \(self.formatBytes(responseSize)) | Error: \(errorMsg ?? "Unknown")")
                    } else {
                        self.logger.info("[RPC] \(metrics.method) -> \(shortTargetId) | Status: \(status) | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(metrics.requestSize)) | Response: \(self.formatBytes(responseSize))")
                    }
                }
            }

            // Complete stream if final or error
            if rpcError != nil {
                responseSubject.send(completion: .failure(.serverError("rpc_error", errorMsg ?? "Unknown RPC error")))
                self.removePendingCall(id: correlationId)
            } else if isFinal {
                responseSubject.send(completion: .finished)
                self.removePendingCall(id: correlationId)
            }
        }
    }

    private func handleRelayEventMessage(_ json: [String: Any]) {
        guard let eventType = json["eventType"] as? String else {
            logger.warning("Relay event missing eventType field")
            return
        }

        let data = json["data"] as? [String: Any] ?? [:]
        let timestamp = Date()
        let sourceDeviceId = json["sourceDeviceId"] as? String

        let relayEvent = RelayEvent(
            eventType: eventType,
            data: data,
            timestamp: timestamp,
            sourceDeviceId: sourceDeviceId
        )

        publishOnMain {
            self.eventPublisher.send(relayEvent)
        }

        if relayEvent.eventType.hasPrefix("job:") {
            NotificationCenter.default.post(
                name: Notification.Name("relay-event-job"),
                object: self,
                userInfo: ["event": relayEvent]
            )
        }

        // Forward history-state-changed events to NotificationCenter
        if eventType == "history-state-changed" {
            NotificationCenter.default.post(
                name: NSNotification.Name("relay-event-history-state-changed"),
                object: nil,
                userInfo: ["event": relayEvent]
            )
        }
    }

    private func handleDeviceMessageEvent(_ json: [String: Any]) {
        // Terminal events: terminal.output payload data is base64-encoded by desktop;
        // terminal.exit indicates session termination with exit code.
        let eventType = json["messageType"] as? String ?? "unknown"
        let payload = json["payload"] as? [String: Any] ?? [:]
        let sourceDeviceId = json["sourceDeviceId"] as? String

        let relayEvent = RelayEvent(
            eventType: eventType,
            data: payload.mapValues { AnyCodable(any: $0) },
            timestamp: Date(),
            sourceDeviceId: sourceDeviceId
        )

        publishOnMain {
            self.eventPublisher.send(relayEvent)
        }

        if relayEvent.eventType.hasPrefix("job:") {
            NotificationCenter.default.post(
                name: Notification.Name("relay-event-job"),
                object: self,
                userInfo: ["event": relayEvent]
            )
        }
    }

    private func handleErrorMessage(_ json: [String: Any]) {
        let errorMessage = json["message"] as? String ?? "Unknown error"
        let errorCode = json["code"] as? String ?? "unknown"

        logger.error("Received relay error: \(errorMessage)")

        let nonRetryableCodes: Set<String> = [
            "auth_required",
            "invalid_device_id",
            "missing_scope",
            "device_ownership_failed",
            "missing_target_device_id",
            "invalid_relay_envelope",
            "invalid_payload",
            "invalid_rpc_payload",
            "missing_method",
            "invalid_params"
        ]

        if nonRetryableCodes.contains(errorCode) {
            logger.error("Non-retryable error received: \(errorCode)")
            publishOnMain {
                self.connectionState = .failed(ServerRelayError.serverError(errorCode, errorMessage))
                self.isConnected = false
                self.lastError = .serverError(errorCode, errorMessage)
            }
            isReconnecting = false
            stopReconnection()
            registrationPromise?(.failure(.serverError(errorCode, errorMessage)))
            registrationPromise = nil
            if !allowInternalReconnect {
                return
            }
            return
        }

        // Check if this is an invalid_resume error
        if errorCode == "invalid_resume" {
            logger.warning("resume_failed_retrying_register")

            // Clear stored resume token
            try? KeychainManager.shared.delete(
                for: KeychainManager.KeychainItem.relayResumeToken(deviceId: deviceId)
            )

            // Clear instance state
            self.sessionId = nil
            self.resumeToken = nil

            // Immediately retry with registration
            sendRegistration()
            return
        }

        publishOnMain {
            self.lastError = .serverError(errorCode, errorMessage)
        }
    }

    private func handleDeviceStatusMessage(_ json: [String: Any]) {
        let payload = (json["payload"] as? [String: Any]) ?? [:]
        let event = RelayEvent(eventType: "device-status", data: payload, timestamp: Date(), sourceDeviceId: nil)
        publishOnMain {
            self.eventPublisher.send(event)
        }
    }

    private func handleConnectionError(_ error: Error) {
        logger.error("Connection error: \(error)")

        publishOnMain {
            self.connectionState = .reconnecting
            self.isConnected = false
            self.lastError = .networkError(error)
        }

        stopHeartbeat()
        stopWatchdog()

        // Fail all pending RPCs
        executeSafelyOnRpcQueue {
            let pendingIds = Array(self.pendingRPCCalls.keys)
            let subjects = Array(self.pendingRPCCalls.values)

            for (id, subject) in zip(pendingIds, subjects) {
                subject.send(completion: .failure(.networkError(error)))
                self.removePendingCall(id: id)
            }
        }

        if shouldReconnect() {
            scheduleReconnection()
        }
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.sendHeartbeat()
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    private func sendHeartbeat() {
        Task { [weak self] in
            guard let self = self else { return }
            do {
                try await self.sendMessage(type: "heartbeat", payload: nil)
            } catch {
                logger.error("Failed to send heartbeat: \(error)")
            }
        }
    }

    // MARK: - Watchdog

    private func startWatchdog() {
        stopWatchdog()
        lastMessageReceivedAt = Date()

        // Check every 15 seconds, trigger reconnect if no message for 1.5x heartbeat interval (45s)
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }

            let timeSinceLastMessage = Date().timeIntervalSince(self.lastMessageReceivedAt)
            let watchdogThreshold: TimeInterval = 30.0 * 1.5 // 1.5x heartbeat interval

            if timeSinceLastMessage > watchdogThreshold {
                self.logger.warning("Watchdog timeout: no message received for \(timeSinceLastMessage)s (threshold: \(watchdogThreshold)s)")
                self.handleConnectionError(ServerRelayError.timeout)
            }
        }
    }

    private func stopWatchdog() {
        watchdogTimer?.invalidate()
        watchdogTimer = nil
    }

    // MARK: - Reconnection

    private func shouldReconnect() -> Bool {
        return allowInternalReconnect && (maxReconnectAttempts <= 0 || reconnectAttempts < maxReconnectAttempts) && !isReconnecting
    }

    private func scheduleReconnection() {
        guard allowInternalReconnect else { return }
        guard !isReconnecting else { return }

        isReconnecting = true
        reconnectAttempts += 1

        // Add exponential backoff for reconnect (1s, 2s, 4s, up to 30s)
        let delay = min(pow(2.0, Double(self.reconnectAttempts - 1)), 30.0)
        logger.info("Scheduling reconnection in \(delay) seconds (attempt \(self.reconnectAttempts))")

        publishOnMain {
            self.connectionState = .reconnecting
        }

        reconnectionTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            guard let self = self else { return }

            self.isReconnecting = false

            if let token = self.jwtToken {
                self.reconnectionCancellable?.cancel()
                self.reconnectionCancellable = self.connect(jwtToken: token)
                    .sink(
                        receiveCompletion: { [weak self] _ in
                            self?.reconnectionCancellable = nil
                        },
                        receiveValue: { [weak self] _ in
                            self?.reconnectionCancellable = nil
                        }
                    )
            }
        }
    }

    private func stopReconnection() {
        reconnectionTimer?.invalidate()
        reconnectionTimer = nil
        isReconnecting = false
        reconnectionCancellable?.cancel()
        reconnectionCancellable = nil
    }

    private func setupApplicationLifecycleObservers() {
        #if canImport(UIKit)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                self.logger.info("App entered background, disconnecting from relay")
                self.disconnect(isUserInitiated: false)
            }
            .store(in: &cancellables)
        #endif
    }
}

// MARK: - Supporting Types

public enum ConnectionError: Error {
    case timeout
    case terminal(Error)
}

public enum ServerRelayError: Error, LocalizedError {
    case notConnected
    case invalidURL
    case invalidState(String)
    case networkError(Error)
    case encodingError(Error)
    case timeout
    case serverError(String, String)
    case disconnected

    public var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to server relay"
        case .invalidURL:
            return "Invalid relay URL"
        case .invalidState(let message):
            return "Invalid state: \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Encoding error: \(error.localizedDescription)"
        case .timeout:
            return "Request timeout"
        case .serverError(let code, let message):
            return "Server error \(code): \(message)"
        case .disconnected:
            return "Disconnected from relay"
        }
    }
}


// RPC types
public struct RpcRequest: Codable {
    public let method: String
    public let params: [String: AnyCodable]
    public let id: String
    public let idempotencyKey: String?

    public init(method: String, params: [String: Any] = [:], id: String = UUID().uuidString, idempotencyKey: String? = nil) {
        self.method = method
        self.params = params.mapValues { AnyCodable(any: $0) }
        self.id = id
        self.idempotencyKey = idempotencyKey
    }
}

public struct RpcResponse: Codable {
    public let id: String
    public let result: AnyCodable?
    public let error: RpcError?
    public let isFinal: Bool

    public init(id: String, result: Any? = nil, error: RpcError? = nil, isFinal: Bool = true) {
        self.id = id
        self.result = result.map { AnyCodable(any: $0) }
        self.error = error
        self.isFinal = isFinal
    }
}

public struct RpcError: Codable, CustomStringConvertible {
    public let code: Int
    public let message: String
    public let data: AnyCodable?

    public init(code: Int, message: String, data: Any? = nil) {
        self.code = code
        self.message = message
        self.data = data.map { AnyCodable(any: $0) }
    }

    public var description: String {
        if let data = data {
            return "RpcError(code: \(code), message: \(message), data: \(data))"
        } else {
            return "RpcError(code: \(code), message: \(message))"
        }
    }
}

// Event types
public struct RelayEvent: Codable {
    public let eventType: String
    public let data: [String: AnyCodable]
    public let timestamp: Date
    public let sourceDeviceId: String?
    
    public init(eventType: String, data: [String: Any], timestamp: Date = Date(), sourceDeviceId: String? = nil) {
        self.eventType = eventType
        self.data = data.mapValues { AnyCodable(any: $0) }
        self.timestamp = timestamp
        self.sourceDeviceId = sourceDeviceId
    }
}

// Relay message types
public struct RelayMessage: Codable {
    public let messageType: String
    public let callId: String
    public let targetDeviceId: String?
    public let sourceDeviceId: String
    public let payload: RelayPayload
    public let timestamp: Date
    
    public init(messageType: String, callId: String, targetDeviceId: String?, sourceDeviceId: String, payload: RelayPayload, timestamp: Date = Date()) {
        self.messageType = messageType
        self.callId = callId
        self.targetDeviceId = targetDeviceId
        self.sourceDeviceId = sourceDeviceId
        self.payload = payload
        self.timestamp = timestamp
    }
}

public enum RelayPayload: Codable {
    case heartbeat(RelayHeartbeatPayload)
    case rpc(RpcRequest)
    case response(RpcResponse)
    case event(RelayEvent)

    private enum CodingKeys: String, CodingKey {
        case type, data
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "heartbeat":
            let data = try container.decode(RelayHeartbeatPayload.self, forKey: .data)
            self = .heartbeat(data)
        case "rpc":
            let data = try container.decode(RpcRequest.self, forKey: .data)
            self = .rpc(data)
        case "response":
            let data = try container.decode(RpcResponse.self, forKey: .data)
            self = .response(data)
        case "event":
            let data = try container.decode(RelayEvent.self, forKey: .data)
            self = .event(data)
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: container, debugDescription: "Unknown payload type: \(type)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .heartbeat(let data):
            try container.encode("heartbeat", forKey: .type)
            try container.encode(data, forKey: .data)
        case .rpc(let data):
            try container.encode("rpc", forKey: .type)
            try container.encode(data, forKey: .data)
        case .response(let data):
            try container.encode("response", forKey: .type)
            try container.encode(data, forKey: .data)
        case .event(let data):
            try container.encode("event", forKey: .type)
            try container.encode(data, forKey: .data)
        }
    }
}

public struct RelayHeartbeatPayload: Codable {
    public let timestamp: Date

    public init(timestamp: Date) {
        self.timestamp = timestamp
    }
}

// Relay session metadata for persistence
public struct RelaySessionMeta: Codable {
    public let sessionId: String
    public let resumeToken: String
    public let expiresAtISO: String?

    public init(sessionId: String, resumeToken: String, expiresAtISO: String? = nil) {
        self.sessionId = sessionId
        self.resumeToken = resumeToken
        self.expiresAtISO = expiresAtISO
    }
}

// Extension for RpcResponse to provide convenient access to result dictionary
public extension RpcResponse {
    var resultDict: [String: Any]? {
        return result?.value as? [String: Any]
    }
}

// Type alias for response subjects
private typealias RpcResponseSubject = PassthroughSubject<RpcResponse, ServerRelayError>

// Import UIKit for application lifecycle
#if canImport(UIKit)
import UIKit
#endif
