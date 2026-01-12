import Foundation
import Combine
import OSLog
import Security
import UIKit

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

    private func firstSnakeCaseKey(in value: Any, path: String = "") -> String? {
        if let dict = value as? [String: Any] {
            for (key, nested) in dict {
                let nextPath = path.isEmpty ? key : "\(path).\(key)"
                if key.contains("_") {
                    return nextPath
                }
                if let found = firstSnakeCaseKey(in: nested, path: nextPath) {
                    return found
                }
            }
        } else if let array = value as? [Any] {
            for (index, nested) in array.enumerated() {
                let nextPath = path.isEmpty ? "[\(index)]" : "\(path)[\(index)]"
                if let found = firstSnakeCaseKey(in: nested, path: nextPath) {
                    return found
                }
            }
        }
        return nil
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
    private var lastEventId: UInt64 = 0
    private var lastAckSentEventId: UInt64 = 0
    private var pendingAckTask: Task<Void, Never>?
    private let eventAckDebounceSeconds: TimeInterval = 1.0
    private let lastEventIdDefaultsKey: String

    // Connection monitoring
    private var lastMessageReceivedAt: Date = Date()
    private var watchdogTimer: Timer?

    // RPC metrics tracking
    private struct RpcMetrics {
        let method: String
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
    private var registrationTimer: Timer?

    private var cancellables = Set<AnyCancellable>()
    private var isDisconnecting = false

    /// Callback invoked when relay session is registered or resumed.
    /// Used by MultiConnectionManager to trigger jobs reconciliation on successful handshake.
    public var onRegisteredOrResumed: (() -> Void)?

    /// Provider to check if network is online. Used to skip futile connection attempts when offline.
    public var isNetworkOnline: (() -> Bool)?

    /// Provider to get current active session ID for heartbeat payloads.
    public var activeSessionIdProvider: (() -> String?)?

    // MARK: - Public Interface

    /// Stream of incoming events from the relay
    public var events: AnyPublisher<RelayEvent, Never> {
        eventPublisher
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    // MARK: - Initialization

    public init(serverURL: URL, deviceId: String, sessionDelegate: URLSessionDelegate? = nil) {
        let normalizedDeviceId = deviceId.lowercased()
        self.serverURL = serverURL
        self.deviceId = normalizedDeviceId
        self.lastEventIdDefaultsKey = "relay_last_event_id_\(normalizedDeviceId)"

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = true

        let delegate = sessionDelegate ?? CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.urlSession = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)

        super.init()

        var storedEventId = (UserDefaults.standard.object(forKey: lastEventIdDefaultsKey) as? NSNumber)?.uint64Value ?? 0
        if storedEventId == 0 {
            let legacyKey = "relay_last_event_id_\(normalizedDeviceId.uppercased())"
            if legacyKey != lastEventIdDefaultsKey,
               let legacyValue = UserDefaults.standard.object(forKey: legacyKey) as? NSNumber {
                storedEventId = legacyValue.uint64Value
                UserDefaults.standard.set(legacyValue, forKey: lastEventIdDefaultsKey)
                UserDefaults.standard.removeObject(forKey: legacyKey)
            }
        }
        self.lastEventId = storedEventId
        self.lastAckSentEventId = storedEventId

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
            var hasResumed = false
            let lock = NSLock()

            let safeResume: (Result<Void, Error>) -> Void = { result in
                lock.lock()
                defer { lock.unlock() }
                guard !hasResumed else { return }
                hasResumed = true
                cancellable?.cancel()
                timeoutTimer?.invalidate()
                switch result {
                case .success:
                    continuation.resume(returning: ())
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }

            // Check if already ready (optimization)
            if case .connected = connectionState, sessionId != nil && !sessionId!.isEmpty {
                safeResume(.success(()))
                return
            }

            // Start timeout timer
            timeoutTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { _ in
                safeResume(.failure(ConnectionError.timeout))
            }

            // Helper struct for type-checker performance
            struct ReadinessResult {
                let isReady: Bool
                let isFailed: Bool
                let failedError: ServerRelayError?
            }

            let combinedPublisher = Publishers.CombineLatest($connectionState, $sessionId)
            let mappedPublisher = combinedPublisher.map { [weak self] (state: ConnectionState, sid: String?) -> ReadinessResult in
                guard self != nil else {
                    return ReadinessResult(isReady: false, isFailed: true, failedError: ServerRelayError.invalidState("Client deallocated"))
                }
                let isConnected: Bool
                let isFailed: Bool
                var failedError: ServerRelayError?
                switch state {
                case .connected:
                    isConnected = true
                    isFailed = false
                case .failed(let error):
                    isConnected = false
                    isFailed = true
                    failedError = error as? ServerRelayError
                default:
                    isConnected = false
                    isFailed = false
                }
                let hasValidSession = sid != nil && !sid!.isEmpty
                let isReady = isConnected && hasValidSession
                return ReadinessResult(isReady: isReady, isFailed: isFailed, failedError: failedError)
            }
            let dedupedPublisher = mappedPublisher.removeDuplicates { $0.isReady == $1.isReady && $0.isFailed == $1.isFailed }
            cancellable = dedupedPublisher.sink { result in
                if result.isFailed {
                    let error = result.failedError ?? ServerRelayError.invalidState("Connection failed")
                    safeResume(.failure(ConnectionError.terminal(error)))
                } else if result.isReady {
                    safeResume(.success(()))
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
        try? KeychainManager.shared.delete(for: .relayResumeToken(deviceId: deviceId.uuidString.lowercased()))
    }

    /// Disconnect from the relay
    /// - Parameter isUserInitiated: If true, fails all pending RPCs. If false (network drop), keeps state for reconnection.
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

        registrationTimer?.invalidate()
        registrationTimer = nil

        // Only clear session credentials on user-initiated disconnect
        if isUserInitiated {
            self.sessionId = nil
            self.resumeToken = nil
        }

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil

        if isUserInitiated {
            // User explicitly disconnected: fail all pending calls
            executeSafelyOnRpcQueue {
                let pendingIds = Array(self.pendingRPCCalls.keys)
                let subjects = Array(self.pendingRPCCalls.values)

                for (id, subject) in zip(pendingIds, subjects) {
                    subject.send(completion: .failure(.disconnected))
                    self.removePendingCall(id: id)
                }
            }
        }
        // Non-user disconnect (e.g., network change / transient outage):
        // - Keep pendingRPCCalls so invoke() timeouts handle failures if reconnect never happens.
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

    private func rpcTimeout(for method: String) -> TimeInterval {
        switch method {
        case "files.search", "job.list", "job.get", "session.syncHistoryState", "session.mergeHistoryState", "session.getHistoryState":
            return 90.0
        case "session.list", "session.get", "session.update", "settings.getProjectTaskModelSettings", "actions.estimatePromptTokens":
            return 60.0
        case "terminal.start":
            return 60.0
        default:
            return 30.0
        }
    }

    /// Invoke an RPC method on the active desktop connection.
    ///
    /// Expected envelope sent to server:
    /// {
    ///   "type": "rpc.request",
    ///   "payload": {
    ///     "id": "<request-id>",
    ///     "method": "<method-name>",
    ///     "params": {...},
    ///     "idempotencyKey": "<optional>"
    ///   }
    /// }
    public func invoke(
        request: RpcRequest,
        timeout: TimeInterval = 30.0
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        return AsyncThrowingStream { continuation in
            guard !request.method.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                continuation.finish(throwing: ServerRelayError.invalidState("Missing request.method"))
                return
            }

            let req: RpcRequest
            if request.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                req = RpcRequest(
                    method: request.method,
                    params: request.params.mapValues { $0.value },
                    id: UUID().uuidString,
                    idempotencyKey: request.idempotencyKey
                )
            } else {
                req = request
            }

            let responseSubject = PassthroughSubject<RpcResponse, ServerRelayError>()
            let effectiveTimeout = max(timeout, self.rpcTimeout(for: req.method))

            rpcQueue.async {
                self.pendingRPCCalls[req.id] = responseSubject
            }

            let cancellable = responseSubject
                .timeout(.seconds(effectiveTimeout), scheduler: DispatchQueue.main, options: nil, customError: {
                    self.rpcQueue.async {
                        if let metrics = self.rpcMetrics[req.id] {
                            self.logger.warning("[RPC] \(metrics.method) | Timeout after \(effectiveTimeout)s")
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
                                    let errorDesc = error.localizedDescription
                                    self.logger.error("[RPC] \(metrics.method) | Status: Failed | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(metrics.requestSize)) | Error: \(errorDesc)")
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

            Task { [weak self] in
                guard let self = self else {
                    continuation.finish(throwing: ServerRelayError.invalidState("Client deallocated"))
                    return
                }

                guard case .connected = self.connectionState, self.hasSessionCredentials else {
                    self.removePendingCall(id: req.id)
                    continuation.finish(throwing: ServerRelayError.notConnected)
                    return
                }

                var rpcPayload: [String: Any] = [
                    "id": req.id,
                    "method": req.method,
                    "params": req.params.mapValues { $0.jsonValue }
                ]
                if let key = req.idempotencyKey {
                    rpcPayload["idempotencyKey"] = key
                }

                do {
                    let envelope: [String: Any] = [
                        "type": "rpc.request",
                        "payload": rpcPayload
                    ]
                    let encodedString = try self.encodeForWebSocket(envelope)
                    let requestSize = encodedString.utf8.count

                    let metrics = RpcMetrics(
                        method: req.method,
                        startTime: Date(),
                        requestSize: requestSize
                    )
                    self.rpcQueue.async {
                        self.rpcMetrics[req.id] = metrics
                    }

                    try await self.sendMessage(type: "rpc.request", payload: rpcPayload)
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

        if let path = firstSnakeCaseKey(in: sanitized) {
            throw ServerRelayError.invalidState("snake_case key '\(path)' in outgoing relay payload")
        }

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
        // Build registration payload matching device_link_ws RegisterPayload schema
        // Uses compactMapValues to omit nil values for a clean JSON structure
        let storedResumeToken: String?
        let storedSessionId: String?

        let resumeItem = KeychainManager.KeychainItem.relayResumeToken(deviceId: self.deviceId)
        var resumeMeta = try? KeychainManager.shared.retrieve(
            type: RelaySessionMeta.self,
            for: resumeItem,
            prompt: nil
        )
        if resumeMeta == nil {
            let legacyDeviceId = self.deviceId.uppercased()
            if legacyDeviceId != self.deviceId {
                let legacyItem = KeychainManager.KeychainItem.relayResumeToken(deviceId: legacyDeviceId)
                if let legacyMeta = try? KeychainManager.shared.retrieve(
                    type: RelaySessionMeta.self,
                    for: legacyItem,
                    prompt: nil
                ) {
                    resumeMeta = legacyMeta
                    try? KeychainManager.shared.store(object: legacyMeta, for: resumeItem)
                    try? KeychainManager.shared.delete(for: legacyItem)
                }
            }
        }

        if let resumeMeta {
            storedSessionId = resumeMeta.sessionId
            storedResumeToken = resumeMeta.resumeToken
            logger.info("Attempting to register with resume credentials, deviceId=\(self.deviceId)")
        } else {
            storedSessionId = nil
            storedResumeToken = nil
            logger.info("Registering new session, deviceId=\(self.deviceId)")
        }

        var payload: [String: Any] = [
            "deviceId": self.deviceId,
            "deviceName": UIDevice.current.name
        ]
        if let storedSessionId {
            payload["sessionId"] = storedSessionId
        }
        if let storedResumeToken {
            payload["resumeToken"] = storedResumeToken
        }
        if lastEventId > 0 {
            payload["lastEventId"] = lastEventId
        }

        do {
            let envelope: [String: Any] = [
                "type": "register",
                "payload": payload
            ]
            let jsonString = try encodeForWebSocket(envelope)

            webSocketTask?.send(.string(jsonString)) { [weak self] error in
                if let error = error {
                    self?.registrationPromise?(.failure(.networkError(error)))
                    self?.registrationPromise = nil
                } else {
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
        guard case .connected = connectionState, hasSessionCredentials else {
            throw ServerRelayError.notConnected
        }
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

    /// Send control message to bind this mobile device to the desktop producer for binary terminal output
    public func sendBinaryBind(sessionId: String, includeSnapshot: Bool = true) async throws {
        guard case .connected = connectionState, hasSessionCredentials else {
            throw ServerRelayError.notConnected
        }

        logger.info("sendBinaryBind: binding to sessionId=\(sessionId), includeSnapshot=\(includeSnapshot)")

        let payload: [String: Any] = [
            "sessionId": sessionId,
            "includeSnapshot": includeSnapshot
        ]

        try await self.sendMessage(type: "terminal.binary.bind", payload: payload)
    }

    /// Send control message to unbind binary terminal output
    public func sendBinaryUnbind(sessionId: String) {
        Task { [weak self] in
            guard let self = self else { return }
            guard case .connected = self.connectionState, self.hasSessionCredentials else {
                return
            }
            do {
                try await self.sendMessage(type: "terminal.binary.unbind", payload: ["sessionId": sessionId])

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

    /// Parse framed terminal event with explicit sessionId (forward-looking protocol support)
    /// Format: "PTC1" sentinel (4 bytes) + sessionIdLength (2 bytes big-endian) + sessionId (UTF-8) + payload
    /// Returns nil for non-framed payloads, maintaining backward compatibility
    private func parseFramedTerminalEvent(_ data: Data) -> (sessionId: String, payload: Data)? {
        let sentinel = Data([0x50, 0x54, 0x43, 0x31]) // "PTC1"
        guard data.count > sentinel.count + 2 else { return nil }
        guard data.prefix(sentinel.count) == sentinel else { return nil }

        var offset = sentinel.count
        let lengthRange = offset..<(offset + 2)
        let lengthBytes = data[lengthRange]
        let sessionIdLength = lengthBytes.withUnsafeBytes { ptr -> UInt16 in
            return ptr.load(as: UInt16.self).bigEndian
        }
        offset += 2

        guard data.count >= offset + Int(sessionIdLength) else { return nil }
        let sessionIdData = data[offset..<(offset + Int(sessionIdLength))]
        guard let sessionId = String(data: sessionIdData, encoding: .utf8) else { return nil }
        offset += Int(sessionIdLength)

        let payload = data.suffix(from: offset)
        return (sessionId: sessionId, payload: Data(payload))
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            handleTextMessage(text)
        case .data(let data):
            lastMessageReceivedAt = Date()
            guard let framed = parseFramedTerminalEvent(data) else {
                logger.debug("Dropping unframed binary data: \(data.count) bytes")
                return
            }
            logger.debug("WebSocket framed binary received: \(framed.payload.count) bytes, sessionId=\(framed.sessionId)")
            publishOnMain {
                self.terminalBytesSubject.send(
                    TerminalBytesEvent(
                        data: framed.payload,
                        timestamp: Date(),
                        sessionId: framed.sessionId
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

            if let path = self.firstSnakeCaseKey(in: json) {
                logger.error("Dropping relay message with snake_case key: \(path)")
                publishOnMain {
                    self.lastError = .invalidState("snake_case key '\(path)' in incoming relay payload")
                }
                return
            }

            guard let messageType = json["type"] as? String else {
                logger.error("Invalid message format - missing 'type' field")
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
            case "pong":
                break
            case "rpc.response":
                handleRpcResponseMessage(json)
            case "event":
                handleEventMessage(json)
            case "terminal.binary.bound":
                handleTerminalBinaryBound(json)
            case "error":
                handleErrorMessage(json)
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
            self.lastError = nil
        }
        startHeartbeat()
        startWatchdog()

        // Complete registration promise
        registrationPromise?(.success(()))
        registrationPromise = nil

        // Notify listeners that registration completed successfully
        onRegisteredOrResumed?()
    }

    private func handleResumedMessage(_ json: [String: Any]) {
        // Cancel registration timeout timer
        registrationTimer?.invalidate()
        registrationTimer = nil

        logger.info("Relay session resumed successfully")

        // Extract sessionId and expiresAt
        guard let sessionId = json["sessionId"] as? String else {
            logger.error("Missing sessionId in resumed response")
            registrationPromise?(.failure(.serverError("invalidResponse", "Missing sessionId")))
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
            self.lastError = nil
        }
        startHeartbeat()
        startWatchdog()

        // Complete the registration promise
        registrationPromise?(.success(()))
        registrationPromise = nil

        // Notify listeners that resume completed successfully
        onRegisteredOrResumed?()
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

    private func handleRpcResponseMessage(_ json: [String: Any]) {
        guard let responseDict = json["payload"] as? [String: Any] else {
            logger.warning("rpc.response missing payload field")
            return
        }

        guard let correlationId = responseDict["id"] as? String else {
            logger.warning("rpc.response missing id")
            return
        }

        let isFinal = (responseDict["isFinal"] as? Bool) ?? true

        rpcQueue.async {
            guard let responseSubject = self.pendingRPCCalls[correlationId] else {
                self.logger.warning("Received rpc.response for unknown call: \(correlationId)")
                return
            }

            var rpcError: RpcError?
            if let errorDict = responseDict["error"] as? [String: Any] {
                let code = errorDict["code"] as? Int ?? -1
                let message = errorDict["message"] as? String ?? "Unknown RPC error"
                let data = errorDict["data"]
                rpcError = RpcError(code: code, message: message, data: data)
            }

            let rpcResponse = RpcResponse(
                id: correlationId,
                result: responseDict["result"],
                error: rpcError,
                isFinal: isFinal
            )

            responseSubject.send(rpcResponse)

            if isFinal || rpcError != nil {
                if let metrics = self.rpcMetrics[correlationId] {
                    let duration = Date().timeIntervalSince(metrics.startTime)
                    let responseSize: Int
                    if let responseData = try? JSONSerialization.data(withJSONObject: responseDict) {
                        responseSize = responseData.count
                    } else {
                        responseSize = 0
                    }

                    let status = rpcError != nil ? "Error" : "Success"

                    if rpcError != nil {
                        self.logger.error("[RPC] \(metrics.method) | Status: \(status) | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(metrics.requestSize)) | Response: \(self.formatBytes(responseSize)) | Error: \(rpcError?.message ?? "Unknown")")
                    } else {
                        self.logger.info("[RPC] \(metrics.method) | Status: \(status) | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(metrics.requestSize)) | Response: \(self.formatBytes(responseSize))")
                    }
                }
            }

            if rpcError != nil {
                responseSubject.send(completion: .failure(.serverError("rpcError", rpcError?.message ?? "Unknown RPC error")))
                self.removePendingCall(id: correlationId)
            } else if isFinal {
                responseSubject.send(completion: .finished)
                self.removePendingCall(id: correlationId)
            }
        }
    }

    private func handleEventMessage(_ json: [String: Any]) {
        guard let payload = json["payload"] as? [String: Any],
              let eventType = payload["eventType"] as? String else {
            logger.warning("Event message missing eventType")
            return
        }

        let data = payload["payload"] as? [String: Any] ?? [:]
        let timestamp = Date()
        let sourceDeviceId = json["sourceDeviceId"] as? String
        let eventId = (json["eventId"] as? NSNumber)?.uint64Value

        if let eventId {
            updateLastEventId(eventId)
            scheduleEventAck()
        }

        if let snakeKey = findSnakeCaseKey(data) {
            logger.error("Dropping relay event with snake_case key at \(snakeKey) (eventType=\(eventType))")
            return
        }

        let relayEvent = RelayEvent(
            eventType: eventType,
            data: data,
            timestamp: timestamp,
            sourceDeviceId: sourceDeviceId,
            eventId: eventId
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

        if eventType == "history-state-changed" {
            NotificationCenter.default.post(
                name: NSNotification.Name("relay-event-history-state-changed"),
                object: nil,
                userInfo: ["event": relayEvent]
            )
        }
    }

    private func findSnakeCaseKey(_ value: Any, path: String = "") -> String? {
        if let dict = value as? [String: Any] {
            for (key, nested) in dict {
                let nextPath = path.isEmpty ? key : "\(path).\(key)"
                if key.contains("_") {
                    return nextPath
                }
                if let found = findSnakeCaseKey(nested, path: nextPath) {
                    return found
                }
            }
        } else if let array = value as? [Any] {
            for (index, nested) in array.enumerated() {
                let nextPath = "\(path)[\(index)]"
                if let found = findSnakeCaseKey(nested, path: nextPath) {
                    return found
                }
            }
        }
        return nil
    }

    private func updateLastEventId(_ eventId: UInt64) {
        guard eventId > lastEventId else { return }
        lastEventId = eventId
        UserDefaults.standard.set(NSNumber(value: eventId), forKey: lastEventIdDefaultsKey)
    }

    private func scheduleEventAck() {
        guard lastEventId > lastAckSentEventId else { return }
        pendingAckTask?.cancel()
        pendingAckTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(eventAckDebounceSeconds * 1_000_000_000))
            guard self.lastEventId > self.lastAckSentEventId else { return }
            let ackId = self.lastEventId
            self.lastAckSentEventId = ackId
            try? await self.sendMessage(type: "event-ack", payload: ["lastEventId": ackId])
        }
    }

    private func handleTerminalBinaryBound(_ json: [String: Any]) {
        guard let payload = json["payload"] as? [String: Any],
              let sessionId = payload["sessionId"] as? String else {
            logger.warning("terminal.binary.bound missing sessionId")
            return
        }

        publishOnMain {
            NotificationCenter.default.post(
                name: Notification.Name("terminal-binary-bound"),
                object: self,
                userInfo: ["sessionId": sessionId]
            )
        }
    }


    private func handleErrorMessage(_ json: [String: Any]) {
        let errorMessage = json["message"] as? String ?? "Unknown error"
        let errorCode = (json["code"] as? String ?? "unknown").trimmingCharacters(in: .whitespacesAndNewlines)

        logger.error("Received relay error: \(errorMessage)")

        // Non-retryable error codes (camelCase from server)
        let nonRetryableCodes: Set<String> = [
            "authRequired",
            "invalidDeviceId",
            "missingScope",
            "deviceOwnershipFailed",
            "missingTargetDeviceId",
            "invalidRelayEnvelope",
            "invalidPayload",
            "invalidRpcPayload",
            "missingMethod",
            "invalidParams"
        ]

        if nonRetryableCodes.contains(errorCode) {
            logger.error("Non-retryable error received: \(errorCode)")
            publishOnMain {
                self.connectionState = .failed(ServerRelayError.serverError(errorCode, errorMessage))
                self.isConnected = false
                self.lastError = .serverError(errorCode, errorMessage)
            }
            registrationPromise?(.failure(.serverError(errorCode, errorMessage)))
            registrationPromise = nil
            return
        }

        // Check if this is an invalidResume error
        if errorCode == "invalidResume" {
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

    private func handleConnectionError(_ error: Error) {
        logger.error("Connection error: \(error)")

        publishOnMain {
            self.connectionState = .failed(ServerRelayError.networkError(error))
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
            guard case .connected = self.connectionState, self.hasSessionCredentials else {
                return
            }
            do {
                var payload: [String: Any] = [:]
                if let activeSessionId = self.activeSessionIdProvider?() {
                    payload["activeSessionId"] = activeSessionId
                }
                try await self.sendMessage(type: "heartbeat", payload: payload)
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

    private func setupApplicationLifecycleObservers() {
        // Background/foreground handling is managed by AppDelegate and MultiConnectionManager
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
        self.idempotencyKey = idempotencyKey ?? RpcRequest.defaultIdempotencyKey(method: method, id: id)
    }

    private static func defaultIdempotencyKey(method: String, id: String) -> String? {
        let lower = method.lowercased()
        let verbs = [".create", ".update", ".delete", ".cancel", ".sync", ".set", ".start", ".kill", ".merge", ".rename", ".duplicate"]
        if verbs.contains(where: { lower.contains($0) }) {
            return id
        }
        let bareVerbs = ["create", "update", "delete", "cancel", "sync", "set", "start", "kill", "merge", "rename", "duplicate"]
        if bareVerbs.contains(where: { lower.hasPrefix($0) }) {
            return id
        }
        return nil
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
    public static let UNAUTHORIZED_CODE = 401
    public static let FORBIDDEN_CODE = 403
    public static let NOT_FOUND_CODE = 404
    public static let VALIDATION_ERROR_CODE = 422

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

    public func toDataServiceError() -> DataServiceError {
        switch code {
        case RpcError.UNAUTHORIZED_CODE:
            return .authenticationError(message)
        case RpcError.FORBIDDEN_CODE:
            return .permissionDenied(message)
        case RpcError.NOT_FOUND_CODE:
            return .invalidRequest(message)
        case RpcError.VALIDATION_ERROR_CODE:
            return .validation(message)
        default:
            return .serverError("rpcError: \(message)")
        }
    }
}

// Event types
public struct RelayEvent: Codable {
    public let eventType: String
    public let data: [String: AnyCodable]
    public let timestamp: Date
    public let sourceDeviceId: String?
    public let eventId: UInt64?
    
    public init(eventType: String, data: [String: Any], timestamp: Date = Date(), sourceDeviceId: String? = nil, eventId: UInt64? = nil) {
        self.eventType = eventType
        self.data = data.mapValues { AnyCodable(any: $0) }
        self.timestamp = timestamp
        self.sourceDeviceId = sourceDeviceId
        self.eventId = eventId
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
