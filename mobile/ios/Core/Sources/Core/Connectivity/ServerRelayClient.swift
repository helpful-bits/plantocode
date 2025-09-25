import Foundation
import Foundation
import Combine
import OSLog

/// WebSocket client for connecting to server relay endpoint for device-to-device communication
public class ServerRelayClient: NSObject, ObservableObject {
    private let logger = Logger(subsystem: "VibeManager", category: "ServerRelayClient")

    // MARK: - Published Properties
    @Published public private(set) var connectionState: ConnectionState = .disconnected
    @Published public private(set) var isConnected: Bool = false
    @Published public private(set) var lastError: ServerRelayError?

    // MARK: - Private Properties
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession
    public let serverURL: URL
    private var jwtToken: String?
    private let deviceId: String

    // RPC and event handling
    private var pendingRPCCalls: [String: RpcResponseSubject] = [:]
    private let rpcQueue = DispatchQueue(label: "rpc-queue")
    private var eventPublisher = PassthroughSubject<RelayEvent, Never>()
    private var registrationPromise: ((Result<Void, ServerRelayError>) -> Void)?

    // Connection management
    private var heartbeatTimer: Timer?
    private var reconnectionTimer: Timer?
    private var isReconnecting = false
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Public Interface

    /// Stream of incoming events from the relay
    public var events: AnyPublisher<RelayEvent, Never> {
        eventPublisher.eraseToAnyPublisher()
    }

    // MARK: - Initialization

    public init(serverURL: URL, deviceId: String) {
        self.serverURL = serverURL
        self.deviceId = deviceId

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 0

        self.urlSession = URLSession(configuration: config)

        super.init()

        setupApplicationLifecycleObservers()
    }

    deinit {
        disconnect()
        cancellables.removeAll()
    }

    // MARK: - Connection Management

    /// Connect to the relay endpoint with JWT authentication
    public func connect(jwtToken: String) -> AnyPublisher<Void, ServerRelayError> {
        self.jwtToken = jwtToken

        return Future<Void, ServerRelayError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState("Client deallocated")))
                return
            }

            // Build URLRequest for "/ws/device-link" derived from Config.serverURL
            var urlComponents = URLComponents(url: self.serverURL, resolvingAgainstBaseURL: false)
            urlComponents?.path = "/ws/device-link"

            guard let wsURL = urlComponents?.url else {
                promise(.failure(.invalidURL))
                return
            }

            var request = URLRequest(url: wsURL)
            // Set headers: Authorization: "Bearer \(jwt)", X-Device-ID: deviceId, X-Client-Type: "mobile"
            request.setValue("Bearer \(jwtToken)", forHTTPHeaderField: "Authorization")
            request.setValue(self.deviceId, forHTTPHeaderField: "X-Device-ID")
            request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")

            self.logger.info("Connecting to server relay: \(wsURL)")
            self.connectionState = .connecting

            self.webSocketTask = self.urlSession.webSocketTask(with: request)
            self.webSocketTask?.resume()

            // Start receiving messages
            self.startReceivingMessages()

            // Store the promise for completion when registration succeeds
            self.registrationPromise = promise

            // Send device registration immediately
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                self.sendRegistration()
            }
        }
        .eraseToAnyPublisher()
    }

    /// Disconnect from the relay
    public func disconnect() {
        logger.info("Disconnecting from server relay")

        connectionState = .disconnected
        isConnected = false
        stopHeartbeat()
        stopReconnection()

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil

        // Fail all pending RPC calls
        rpcQueue.async(execute: {
            for (_, subject) in self.pendingRPCCalls {
                subject.send(completion: .failure(.disconnected))
            }
            self.pendingRPCCalls.removeAll()
        })
    }

    // MARK: - RPC Calls

    /// Invoke an RPC method on a target device
    public func invoke(
        targetDeviceId: String,
        request: RpcRequest,
        timeout: TimeInterval = 30.0
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        return AsyncThrowingStream { continuation in
            // Create response subject for this call
            let responseSubject = PassthroughSubject<RpcResponse, ServerRelayError>()

            rpcQueue.async {
                self.pendingRPCCalls[request.id] = responseSubject
            }

            // Subscribe to responses and stream them
            let cancellable = responseSubject
                .timeout(.seconds(timeout), scheduler: DispatchQueue.main, options: nil)
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .finished:
                            continuation.finish()
                        case .failure(let error):
                            continuation.finish(throwing: error)
                        }

                        // Clean up
                        self.rpcQueue.async {
                            self.pendingRPCCalls.removeValue(forKey: request.id)
                        }
                    },
                    receiveValue: { response in
                        continuation.yield(response)

                        // If this is the final response, finish the stream
                        if response.isFinal {
                            continuation.finish()
                        }
                    }
                )

            continuation.onTermination = { _ in
                cancellable.cancel()
                self.rpcQueue.async {
                    self.pendingRPCCalls.removeValue(forKey: request.id)
                }
            }

            // Serialize: {"type":"relay","target_device_id":targetDeviceId,"message_type":"rpc","payload":request}
            let messageData: [String: Any] = [
                "type": "relay",
                "target_device_id": targetDeviceId,
                "message_type": "rpc",
                "payload": [
                    "method": request.method,
                    "params": request.params.mapValues { $0.value },
                    "id": request.id
                ]
            ]

            // Send the message
            Task {
                do {
                    try await self.sendMessage(messageData)
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // MARK: - Private Methods

    // Send registration message on open
    private func sendRegistration() {
        // On open, send text JSON: {"type":"register","device_id":deviceId,"device_name":UIDevice.current.name}
        let registrationData: [String: Any] = [
            "type": "register",
            "device_id": deviceId,
            "device_name": UIDevice.current.name
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: registrationData)
            guard let jsonString = String(data: jsonData, encoding: .utf8) else {
                registrationPromise?(.failure(.encodingError(NSError(domain: "ServerRelayClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to encode registration data"]))))
                registrationPromise = nil
                return
            }

            // Use webSocketTask.send(.string(json)) exclusively (no .data frames)
            webSocketTask?.send(.string(jsonString)) { [weak self] error in
                if let error = error {
                    self?.registrationPromise?(.failure(.networkError(error)))
                    self?.registrationPromise = nil
                } else {
                    // Registration sent successfully, but don't complete promise yet
                    // Wait for "registered" response in message handler
                    self?.logger.info("Registration message sent")
                }
            }
        } catch {
            registrationPromise?(.failure(.encodingError(error)))
            registrationPromise = nil
        }
    }

    public func sendMessage(_ messageData: [String: Any]) async throws {
        guard let webSocketTask = webSocketTask else {
            throw ServerRelayError.notConnected
        }

        let jsonData = try JSONSerialization.data(withJSONObject: messageData)
        guard let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw ServerRelayError.encodingError(NSError(domain: "ServerRelayClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to encode message"]))
        }

        // Use webSocketTask.send(.string(json)) exclusively (no .data frames)
        try await webSocketTask.send(.string(jsonString))
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
        case .data(_):
            // Ignore data frames - we only handle text messages
            logger.warning("Received unexpected data frame, ignoring")
        @unknown default:
            break
        }
    }

    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else {
            logger.error("Failed to convert text to data")
            return
        }

        do {
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let messageType = json["type"] as? String else {
                logger.error("Invalid message format - missing type field")
                return
            }

            // Route by root["type"]
            switch messageType {
            case "registered":
                // "registered" → set connectionState = .connected
                handleRegisteredMessage(json)
            case "relay_response":
                // "relay_response" → decode response.id and complete matching pending call
                handleRelayResponseMessage(json)
            case "error":
                // "error" → update lastError
                handleErrorMessage(json)
            default:
                logger.debug("Received unknown message type: \(messageType)")
            }
        } catch {
            logger.error("Failed to decode message: \(error)")
        }
    }

    private func handleRegisteredMessage(_ json: [String: Any]) {
        logger.info("Device registered successfully")

        // Create a handshake object for the connected state
        let handshake = ConnectionHandshake(
            sessionId: UUID().uuidString,
            clientId: deviceId,
            transport: "websocket"
        )

        connectionState = .connected(handshake)
        isConnected = true
        reconnectAttempts = 0
        startHeartbeat()

        // Complete the registration promise
        registrationPromise?(.success(()))
        registrationPromise = nil
    }

    private func handleRelayResponseMessage(_ json: [String: Any]) {
        guard let responseId = json["id"] as? String else {
            logger.warning("Relay response missing id field")
            return
        }

        rpcQueue.async {
            guard let responseSubject = self.pendingRPCCalls[responseId] else {
                self.logger.warning("Received relay response for unknown call: \(responseId)")
                return
            }

            // Create RpcResponse from the relay response
            let rpcResponse = RpcResponse(
                id: responseId,
                result: json["result"],
                error: nil,
                isFinal: true
            )

            responseSubject.send(rpcResponse)
            responseSubject.send(completion: .finished)
            self.pendingRPCCalls.removeValue(forKey: responseId)
        }
    }

    private func handleErrorMessage(_ json: [String: Any]) {
        let errorMessage = json["message"] as? String ?? "Unknown error"
        let errorCode = json["code"] as? String ?? "unknown"

        logger.error("Received relay error: \(errorMessage)")
        lastError = .serverError(errorCode, errorMessage)
    }




    private func handleConnectionError(_ error: Error) {
        logger.error("Connection error: \(error)")

        DispatchQueue.main.async {
            self.connectionState = .failed(error)
            self.isConnected = false
            self.lastError = .networkError(error)
        }

        stopHeartbeat()

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
        let heartbeatPayload: [String: Any] = [
            "messageType": "heartbeat",
            "callId": UUID().uuidString,
            "sourceDeviceId": deviceId,
            "timestamp": Date().timeIntervalSince1970
        ]

        Task {
            try? await sendMessage(heartbeatPayload)
        }
    }

    // MARK: - Reconnection

    private func shouldReconnect() -> Bool {
        return reconnectAttempts < maxReconnectAttempts && !isReconnecting
    }

    private func scheduleReconnection() {
        guard !isReconnecting else { return }

        isReconnecting = true
        reconnectAttempts += 1

        // Add exponential backoff for reconnect (1s, 2s, 4s, up to 30s)
        let delay = min(pow(2.0, Double(self.reconnectAttempts - 1)), 30.0)
        logger.info("Scheduling reconnection in \(delay) seconds (attempt \(self.reconnectAttempts))")

        DispatchQueue.main.async {
            self.connectionState = .reconnecting
        }

        reconnectionTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            guard let self = self else { return }

            self.isReconnecting = false

            if let token = self.jwtToken {
                self.connect(jwtToken: token)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { _ in }
                    )
                    .store(in: &self.cancellables)
            }
        }
    }

    private func stopReconnection() {
        reconnectionTimer?.invalidate()
        reconnectionTimer = nil
        isReconnecting = false
    }

    private func setupApplicationLifecycleObservers() {
        // Reconnect when app becomes active
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                if !self.isConnected && !self.isReconnecting, let token = self.jwtToken {
                    self.logger.info("App became active, reconnecting to relay")
                    self.connect(jwtToken: token)
                        .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
                        .store(in: &self.cancellables)
                }
            }
            .store(in: &cancellables)

        // Disconnect when app enters background
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                self.logger.info("App entered background, disconnecting from relay")
                self.disconnect()
            }
            .store(in: &cancellables)
    }
}

// MARK: - Supporting Types

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

    public init(method: String, params: [String: Any] = [:], id: String = UUID().uuidString) {
        self.method = method
        self.params = params.mapValues { AnyCodable(any: $0) }
        self.id = id
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

public struct RpcError: Codable {
    public let code: Int
    public let message: String
    public let data: AnyCodable?
    
    public init(code: Int, message: String, data: Any? = nil) {
        self.code = code
        self.message = message
        self.data = data.map { AnyCodable(any: $0) }
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

// Type alias for response subjects
private typealias RpcResponseSubject = PassthroughSubject<RpcResponse, ServerRelayError>

// Import UIKit for application lifecycle
import UIKit

