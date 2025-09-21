import Foundation
import Combine
import Network
import CryptoKit
import UIKit
// Import CommonTypes for shared type definitions

/// Client for communicating with desktop application via WebSocket
public class DesktopAPIClient: ObservableObject {

    // MARK: - Published Properties
    @Published public var connectionState: ConnectionState = .disconnected
    @Published public var isConnected: Bool = false
    @Published public var lastError: DesktopAPIError?

    // MARK: - Private Properties
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession
    private var serverURL: URL
    private let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString

    // Response correlation
    private var pendingResponses: [String: PassthroughSubject<Data, DesktopAPIError>] = [:]
    private let responseQueue = DispatchQueue(label: "desktop-api-responses")

    // Authentication
    private var jwtToken: String?
    private var isAuthenticated = false
    private var authContinuation: CheckedContinuation<Void, Error>?

    // Combine cancellables
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(serverURL: URL, configuration: URLSessionConfiguration = .default) {
        self.serverURL = serverURL
        var sessionConfig = configuration
        sessionConfig.timeoutIntervalForRequest = 30
        sessionConfig.timeoutIntervalForResource = 60

        self.urlSession = URLSession(configuration: sessionConfig)

        // Monitor network connectivity
        setupNetworkMonitoring()
    }

    public convenience init() {
        guard let defaultURL = URL(string: "wss://127.0.0.1:4431") else {
            fatalError("Invalid default desktop WebSocket URL")
        }
        self.init(serverURL: defaultURL)
    }

    // MARK: - Public API

    /// Generic invoke method for making API calls to desktop
    public func invoke<T: Decodable>(
        command: String,
        payload: Encodable,
        timeout: TimeInterval = 30.0
    ) -> AnyPublisher<T, DesktopAPIError> {
        guard isConnected && isAuthenticated else {
            return Fail(error: DesktopAPIError.notConnected)
                .eraseToAnyPublisher()
        }

        let correlationId = UUID().uuidString

        // Create command message
        let commandMessage: CommandMessage
        do {
            commandMessage = try CommandMessage(
                command: command,
                payload: payload,
                correlationId: correlationId
            )
        } catch {
            return Fail(error: DesktopAPIError.encodingError(error)).eraseToAnyPublisher()
        }

        // Create response subject
        let responseSubject = PassthroughSubject<Data, DesktopAPIError>()

        responseQueue.async {
            self.pendingResponses[correlationId] = responseSubject
        }

        // Send command
        do {
            let messageData = try JSONEncoder().encode(commandMessage)
            let message = URLSessionWebSocketTask.Message.data(messageData)

            webSocketTask?.send(message) { [weak self] error in
                if let error = error {
                    self?.responseQueue.async {
                        self?.pendingResponses[correlationId]?.send(completion: .failure(.networkError(error)))
                        self?.pendingResponses.removeValue(forKey: correlationId)
                    }
                }
            }
        } catch {
            responseQueue.async {
                self.pendingResponses[correlationId]?.send(completion: .failure(.encodingError(error)))
                self.pendingResponses.removeValue(forKey: correlationId)
            }
        }

        return responseSubject
            .timeout(.seconds(timeout), scheduler: DispatchQueue.main)
            .tryMap { data in
                try JSONDecoder().decode(T.self, from: data)
            }
            .mapError { error in
                if let desktopError = error as? DesktopAPIError {
                    return desktopError
                } else if error is DecodingError {
                    return DesktopAPIError.decodingError(error)
                } else {
                    return DesktopAPIError.timeout
                }
            }
            .handleEvents(receiveCompletion: { [weak self] _ in
                self?.responseQueue.async {
                    self?.pendingResponses.removeValue(forKey: correlationId)
                }
            })
            .eraseToAnyPublisher()
    }

    /// Connect to desktop application
    public func connect(jwtToken: String) -> AnyPublisher<Void, DesktopAPIError> {
        self.jwtToken = jwtToken

        return Future<Void, DesktopAPIError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState("Client deallocated")))
                return
            }

            // Create WebSocket connection
            var request = URLRequest(url: self.serverURL)
            request.setValue(self.deviceId, forHTTPHeaderField: "X-Client-ID")

            self.webSocketTask = self.urlSession.webSocketTask(with: request)
            self.connectionState = .connecting

            // Start receiving messages
            self.startReceivingMessages()

            // Resume the task
            self.webSocketTask?.resume()

            // Send authentication after connection
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.authenticateWithDesktop(jwtToken: jwtToken)
                    .sink(
                        receiveCompletion: { completion in
                            if case .failure(let error) = completion {
                                promise(.failure(error))
                            }
                        },
                        receiveValue: {
                            promise(.success(()))
                        }
                    )
                    .store(in: &self.cancellables)
            }
        }
        .eraseToAnyPublisher()
    }

    /// Disconnect from desktop application
    public func disconnect() {
        isAuthenticated = false
        connectionState = .disconnected
        isConnected = false

        if let continuation = authContinuation {
            authContinuation = nil
            continuation.resume(throwing: DesktopAPIError.disconnected)
        }

        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil

        // Clear pending responses
        responseQueue.async {
            for (_, subject) in self.pendingResponses {
                subject.send(completion: .failure(.disconnected))
            }
            self.pendingResponses.removeAll()
        }
    }

    // MARK: - Private Methods

    private func authenticateWithDesktop(jwtToken: String) -> AnyPublisher<Void, DesktopAPIError> {
        let authPayload = AuthPayload(
            token: jwtToken,
            metadata: ["device_id": AnyCodable(deviceId)]
        )

        let authMessage = AuthMessage(
            messageType: "auth",
            source: "mobile",
            payload: authPayload
        )

        return Future<Void, DesktopAPIError> { [weak self] promise in
            do {
                let messageData = try JSONEncoder().encode(authMessage)
                let message = URLSessionWebSocketTask.Message.data(messageData)

                self?.webSocketTask?.send(message) { error in
                    if let error = error {
                        promise(.failure(.networkError(error)))
                        return
                    }

                    Task { [weak self] in
                        do {
                            try await self?.awaitAuthenticationAck(timeout: 10)
                            promise(.success(()))
                        } catch let ackError as DesktopAPIError {
                            promise(.failure(ackError))
                        } catch {
                            promise(.failure(.networkError(error)))
                        }
                    }
                }
            } catch {
                promise(.failure(.encodingError(error)))
            }
        }
        .eraseToAnyPublisher()
    }

    private func awaitAuthenticationAck(timeout: TimeInterval) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            authContinuation?.resume(throwing: DesktopAPIError.invalidState("Authentication attempt superseded"))
            authContinuation = continuation

            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard let self = self, let pending = self.authContinuation else { return }
                self.authContinuation = nil
                pending.resume(throwing: DesktopAPIError.timeout)
            }
        }

        isAuthenticated = true
        connectionState = .connected(ConnectionHandshake(sessionId: UUID().uuidString, clientId: deviceId, transport: "websocket"))
        isConnected = true
    }

    private func startReceivingMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                self.handleMessage(message)
                // Continue receiving
                self.startReceivingMessages()

            case .failure(let error):
                self.handleConnectionError(error)
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .data(let data):
            handleDataMessage(data)
        case .string(let text):
            if let data = text.data(using: .utf8) {
                handleDataMessage(data)
            }
        @unknown default:
            break
        }
    }

    private func handleDataMessage(_ data: Data) {
        do {
            // Try to decode as response message first
            if let responseMessage = try? JSONDecoder().decode(ResponseMessage.self, from: data) {
                handleResponseMessage(responseMessage)
                return
            }

            // Try to decode as event message
            if let eventMessage = try? JSONDecoder().decode(DesktopEventMessage.self, from: data) {
                handleEventMessage(eventMessage)
                return
            }

            // Unknown message format
            print("Received unknown message format")

        } catch {
            print("Failed to decode message: \(error)")
        }
    }

    private func handleResponseMessage(_ response: ResponseMessage) {
        if response.messageType == "auth_ack" {
            authContinuation?.resume(returning: ())
            authContinuation = nil
            return
        }

        if response.messageType == "auth_error" {
            let errorMessage: String
            if let errorInfo = response.payload.error {
                errorMessage = "\(errorInfo.code): \(errorInfo.message)"
            } else {
                errorMessage = "Authentication rejected by desktop"
            }
            authContinuation?.resume(throwing: DesktopAPIError.serverError("AUTH", errorMessage))
            authContinuation = nil
            return
        }

        responseQueue.async {
            guard let responseSubject = self.pendingResponses[response.payload.correlationId] else {
                return
            }

            if let errorInfo = response.payload.error {
                let error = DesktopAPIError.serverError(errorInfo.code, errorInfo.message)
                responseSubject.send(completion: .failure(error))
            } else if let data = response.payload.data {
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: data)
                    responseSubject.send(jsonData)
                    responseSubject.send(completion: .finished)
                } catch {
                    responseSubject.send(completion: .failure(.decodingError(error)))
                }
            } else {
                responseSubject.send(completion: .failure(.invalidResponse))
            }
        }
    }

    private func handleEventMessage(_ event: DesktopEventMessage) {
        if event.payload.eventType == "auth_ack" {
            authContinuation?.resume(returning: ())
            authContinuation = nil
            return
        }

        if event.payload.eventType == "auth_error" {
            let errorMessage: String
            let anyValue = event.payload.payload.value
            if let failure = anyValue as? [String: Any],
               let message = failure["message"] as? String {
                errorMessage = message
            } else {
                errorMessage = "Authentication rejected by desktop"
            }
            authContinuation?.resume(throwing: DesktopAPIError.serverError("AUTH", errorMessage))
            authContinuation = nil
            return
        }

        // Forward events to interested listeners
        // This could be expanded to support event subscriptions
        print("Received event: \(event.payload.eventType)")
    }

    private func handleConnectionError(_ error: Error) {
        lastError = .networkError(error)
        connectionState = .failed(error)
        isConnected = false
        isAuthenticated = false

        // Attempt reconnection after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
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

    private func setupNetworkMonitoring() {
        let monitor = NWPathMonitor()
        let queue = DispatchQueue(label: "network-monitor")

        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if path.status == .satisfied && self.isConnected == false {
                    // Network available, attempt reconnection if we have a token
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
        }

        monitor.start(queue: queue)
    }
}

// MARK: - Supporting Types

// ConnectionState is defined in CommonTypes
extension ConnectionState {
    static var error: ConnectionState { .failed(DesktopAPIError.invalidState("Error state")) }
}

public enum DesktopAPIError: Error {
    case notConnected
    case invalidURL
    case invalidState(String)
    case networkError(Error)
    case encodingError(Error)
    case decodingError(Error)
    case timeout
    case serverError(String, String)
    case invalidResponse
    case disconnected
}

// Message types for WebSocket communication
struct CommandMessage: Codable {
    let messageType = "command"
    let source = "mobile"
    let payload: CommandPayload
    let timestamp: UInt64
    let messageId: String?

    init(command: String, payload: Encodable, correlationId: String) throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let payloadData = try encoder.encode(EncodableWrapper(payload))
        let jsonObject = try JSONSerialization.jsonObject(with: payloadData)

        self.payload = CommandPayload(
            command: command,
            payload: jsonObject,
            correlationId: correlationId
        )
        self.timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
        self.messageId = correlationId
    }
}

struct CommandPayload: Codable {
    let type = "command"
    let command: String
    let payload: Any
    let correlationId: String

    private enum CodingKeys: String, CodingKey {
        case type, command, payload, correlationId
    }

    init(command: String, payload: Any, correlationId: String) {
        self.command = command
        self.payload = payload
        self.correlationId = correlationId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(command, forKey: .command)
        try container.encode(correlationId, forKey: .correlationId)

        // Encode payload as JSON
        let jsonData = try JSONSerialization.data(withJSONObject: payload)
        let jsonObject = try JSONSerialization.jsonObject(with: jsonData)
        try container.encode(AnyCodable(any: jsonObject), forKey: .payload)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        command = try container.decode(String.self, forKey: .command)
        correlationId = try container.decode(String.self, forKey: .correlationId)
        let anyValue = try container.decode(AnyCodable.self, forKey: .payload).value
        payload = anyValue
    }
}

private struct EncodableWrapper: Encodable {
    private let encodeBlock: (Encoder) throws -> Void

    init(_ encodable: Encodable) {
        self.encodeBlock = encodable.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeBlock(encoder)
    }
}

struct AuthMessage: Codable {
    let messageType: String
    let source: String
    let payload: AuthPayload
    let timestamp: UInt64

    init(messageType: String, source: String, payload: AuthPayload) {
        self.messageType = messageType
        self.source = source
        self.payload = payload
        self.timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
    }
}

struct AuthPayload: Codable {
    let type = "auth"
    let token: String
    let metadata: [String: AnyCodable]

    init(token: String, metadata: [String: AnyCodable]) {
        self.token = token
        self.metadata = metadata
    }
}

struct ResponseMessage: Codable {
    let messageType: String
    let payload: ResponsePayload
}

struct ResponsePayload: Codable {
    let type = "response"
    let correlationId: String
    let data: Any?
    let error: ResponseError?

    private enum CodingKeys: String, CodingKey {
        case type, correlationId, data, error
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        correlationId = try container.decode(String.self, forKey: .correlationId)

        let isDataNil = (try? container.decodeNil(forKey: .data)) ?? true
        if container.contains(.data) && !isDataNil {
            data = try container.decode(AnyCodable.self, forKey: .data).value
            error = nil
        } else {
            data = nil
            error = try? container.decode(ResponseError.self, forKey: .error)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(correlationId, forKey: .correlationId)
        if let data = data {
            try container.encode(AnyCodable(any: data), forKey: .data)
        }
        try container.encodeIfPresent(error, forKey: .error)
    }
}

struct ResponseError: Codable {
    let code: String
    let message: String
    let details: AnyCodable?
}

// Using EventMessage from CommonTypes
struct DesktopEventMessage: Codable {
    let messageType: String
    let payload: EventPayload
}

struct EventPayload: Codable {
    let type = "event"
    let eventType: String
    let payload: AnyCodable
}

// AnyCodable is defined in CommonTypes

extension DesktopAPIError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to desktop application"
        case .invalidURL:
            return "Invalid server URL"
        case .invalidState(let message):
            return "Invalid client state: \(message)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Encoding error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        case .timeout:
            return "Request timeout"
        case .serverError(let code, let message):
            return "Server error \(code): \(message)"
        case .invalidResponse:
            return "Invalid server response"
        case .disconnected:
            return "Connection was disconnected"
        }
    }
}
