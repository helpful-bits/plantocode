import Foundation
import Combine
import UIKit
import OSLog

/// EventSource client for server-sent events (SSE)
public class EventSourceClient: NSObject, ObservableObject {
    private let logger = Logger(subsystem: "VibeManager", category: "EventSource")

    // MARK: - Published Properties
    @Published public private(set) var connectionState: ConnectionState = .disconnected
    @Published public private(set) var lastEventId: String?
    @Published public private(set) var reconnectAttempts: Int = 0

    // MARK: - Private Properties
    private var urlSession: URLSession
    private var sessionTask: URLSessionDataTask?
    private var eventSubject = PassthroughSubject<ServerEvent, Never>()
    private var cancellables = Set<AnyCancellable>()

    // Configuration
    private let serverURL: URL
    private let eventFilters: EventFilters
    private let reconnectionConfig: ReconnectionConfig

    // Reconnection
    private var reconnectionTimer: Timer?
    private var isReconnecting = false

    // MARK: - Public Interface

    /// Stream of incoming events
    public var eventStream: AnyPublisher<ServerEvent, Never> {
        eventSubject.eraseToAnyPublisher()
    }

    // MARK: - Initialization

    public init(
        serverURL: URL,
        eventFilters: EventFilters = EventFilters(),
        reconnectionConfig: ReconnectionConfig = ReconnectionConfig()
    ) {
        self.serverURL = serverURL
        self.eventFilters = eventFilters
        self.reconnectionConfig = reconnectionConfig

        // Create URLSession with custom configuration
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 0 // No timeout for streaming
        config.httpMaximumConnectionsPerHost = 1
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData

        self.urlSession = URLSession(configuration: config)

        super.init()

        setupApplicationLifecycleObservers()
    }

    deinit {
        disconnect()
        cancellables.removeAll()
    }

    // MARK: - Public Methods

    /// Connect to the EventSource endpoint
    public func connect() {
        guard !connectionState.isConnected && connectionState != .connecting else {
            logger.warning("Already connected or connecting")
            return
        }

        logger.info("Connecting to EventSource: \\(serverURL)")
        connectionState = .connecting

        establishConnection()
    }

    /// Disconnect from the EventSource endpoint
    public func disconnect() {
        logger.info("Disconnecting from EventSource")

        connectionState = .disconnected
        sessionTask?.cancel()
        sessionTask = nil
        cancelReconnection()
        isReconnecting = false
        reconnectAttempts = 0
    }

    /// Manually trigger reconnection
    public func reconnect() {
        logger.info("Manual reconnection triggered")
        disconnect()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.connect()
        }
    }

    // MARK: - Private Methods

    private func establishConnection() {
        var urlComponents = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)!

        // Add query parameters for event filtering
        var queryItems = [URLQueryItem]()

        if let eventTypes = eventFilters.eventTypes, !eventTypes.isEmpty {
            queryItems.append(URLQueryItem(name: "eventTypes", value: eventTypes.joined(separator: ",")))
        }

        if let userIds = eventFilters.userIds, !userIds.isEmpty {
            queryItems.append(URLQueryItem(name: "userIds", value: userIds.joined(separator: ",")))
        }

        if let deviceIds = eventFilters.deviceIds, !deviceIds.isEmpty {
            queryItems.append(URLQueryItem(name: "deviceIds", value: deviceIds.joined(separator: ",")))
        }

        if let sinceSequence = eventFilters.sinceSequence {
            queryItems.append(URLQueryItem(name: "sinceSequence", value: String(sinceSequence)))
        }

        if let minPriority = eventFilters.minPriority {
            queryItems.append(URLQueryItem(name: "minPriority", value: String(minPriority)))
        }

        if let lastEventId = lastEventId {
            queryItems.append(URLQueryItem(name: "lastEventId", value: lastEventId))
        }

        urlComponents.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let finalURL = urlComponents.url else {
            logger.error("Failed to construct final URL")
            handleConnectionFailure(EventSourceError.invalidURL)
            return
        }

        var request = URLRequest(url: finalURL)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("keep-alive", forHTTPHeaderField: "Connection")

        if let lastEventId = lastEventId {
            request.setValue(lastEventId, forHTTPHeaderField: "Last-Event-ID")
        }

        sessionTask = urlSession.dataTask(with: request)
        sessionTask?.resume()

        logger.debug("EventSource connection established to: \\(finalURL)")
    }

    private func handleConnectionFailure(_ error: EventSourceError) {
        logger.error("Connection failed: \\(error.localizedDescription)")

        connectionState = .disconnected
        sessionTask = nil

        if shouldReconnect() {
            scheduleReconnection()
        }
    }

    private func shouldReconnect() -> Bool {
        return reconnectAttempts < reconnectionConfig.maxReconnectAttempts && !isReconnecting
    }

    private func scheduleReconnection() {
        guard !isReconnecting else { return }

        isReconnecting = true
        reconnectAttempts += 1

        let delay = reconnectionConfig.getReconnectDelay(attempt: reconnectAttempts)
        logger.info("Scheduling reconnection in \\(delay) seconds (attempt \\(reconnectAttempts))")

        connectionState = .reconnecting

        reconnectionTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            guard let self = self else { return }

            self.isReconnecting = false
            self.logger.info("Attempting reconnection")
            self.establishConnection()
        }
    }

    private func cancelReconnection() {
        reconnectionTimer?.invalidate()
        reconnectionTimer = nil
    }

    private func processEventData(_ data: Data) {
        let string = String(data: data, encoding: .utf8) ?? ""
        let lines = string.components(separatedBy: .newlines)

        var eventBuilder = SSEEventBuilder()

        for line in lines {
            if line.isEmpty {
                // Empty line indicates end of event
                if let event = eventBuilder.build() {
                    handleSSEEvent(event)
                }
                eventBuilder = SSEEventBuilder()
            } else if line.hasPrefix("id:") {
                eventBuilder.id = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("event:") {
                eventBuilder.eventType = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                let data = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                eventBuilder.appendData(data)
            } else if line.hasPrefix("retry:") {
                if let retryTime = Int(String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)) {
                    // Update retry time if needed
                    logger.debug("Server suggested retry time: \\(retryTime)ms")
                }
            }
        }
    }

    private func handleSSEEvent(_ sseEvent: SSEEvent) {
        let eventType = sseEvent.eventType ?? "unknown"
        logger.debug("Received SSE event: \(eventType)")

        // Update last event ID for reconnection
        if let eventId = sseEvent.id {
            lastEventId = eventId
        }

        // Parse event data
        guard let data = sseEvent.data.data(using: .utf8) else {
            logger.warning("Failed to convert event data to UTF-8")
            return
        }

        do {
            let serverEvent = try JSONDecoder().decode(ServerEvent.self, from: data)

            DispatchQueue.main.async {
                self.eventSubject.send(serverEvent)
            }

            // Reset reconnection attempts on successful event
            if reconnectAttempts > 0 {
                reconnectAttempts = 0
                logger.info("Reset reconnection attempts after successful event")
            }

        } catch {
            logger.error("Failed to decode server event: \\(error)")
        }
    }

    private func setupApplicationLifecycleObservers() {
        // Reconnect when app becomes active
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                if self.connectionState == .disconnected && !self.isReconnecting {
                    self.logger.info("App became active, reconnecting EventSource")
                    self.connect()
                }
            }
            .store(in: &cancellables)

        // Disconnect when app enters background
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                self.logger.info("App entered background, disconnecting EventSource")
                self.disconnect()
            }
            .store(in: &cancellables)
    }
}

// MARK: - URLSessionDataDelegate

extension EventSourceClient: URLSessionDataDelegate {
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {

        guard let httpResponse = response as? HTTPURLResponse else {
            logger.error("Invalid response type")
            completionHandler(.cancel)
            return
        }

        guard httpResponse.statusCode == 200 else {
            logger.error("HTTP error: \\(httpResponse.statusCode)")
            handleConnectionFailure(.httpError(httpResponse.statusCode))
            completionHandler(.cancel)
            return
        }

        let rawContentType = httpResponse.allHeaderFields["Content-Type"]
        guard let contentType = rawContentType as? String,
              contentType.contains("text/event-stream") else {
            let contentTypeValue = rawContentType.map { String(describing: $0) } ?? "unknown"
            logger.error("Invalid content type: \(contentTypeValue)")
            handleConnectionFailure(.invalidContentType)
            completionHandler(.cancel)
            return
        }

        logger.info("EventSource connection established successfully")
        DispatchQueue.main.async {
            let connectionResult = ConnectionHandshake(sessionId: UUID().uuidString, clientId: "eventsource-client", transport: "eventsource")
            self.connectionState = .connected(connectionResult)
            self.reconnectAttempts = 0
        }

        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        processEventData(data)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didCompleteWithError error: Error?) {
        if let error = error {
            logger.error("EventSource connection error: \\(error.localizedDescription)")
            handleConnectionFailure(.connectionError(error))
        } else {
            logger.info("EventSource connection completed normally")
            DispatchQueue.main.async {
                self.connectionState = .disconnected
            }
        }
    }
}

// MARK: - Supporting Types

// ConnectionState is defined in ConnectionStrategy.swift

public struct EventFilters: Codable {
    public let eventTypes: [String]?
    public let userIds: [String]?
    public let deviceIds: [String]?
    public let sinceSequence: UInt64?
    public let minPriority: UInt8?

    public init(
        eventTypes: [String]? = nil,
        userIds: [String]? = nil,
        deviceIds: [String]? = nil,
        sinceSequence: UInt64? = nil,
        minPriority: UInt8? = nil
    ) {
        self.eventTypes = eventTypes
        self.userIds = userIds
        self.deviceIds = deviceIds
        self.sinceSequence = sinceSequence
        self.minPriority = minPriority
    }
}

public struct ReconnectionConfig {
    public let maxReconnectAttempts: Int
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval
    public let backoffMultiplier: Double
    public let jitterEnabled: Bool

    public init(
        maxReconnectAttempts: Int = 10,
        baseDelay: TimeInterval = 1.0,
        maxDelay: TimeInterval = 30.0,
        backoffMultiplier: Double = 2.0,
        jitterEnabled: Bool = true
    ) {
        self.maxReconnectAttempts = maxReconnectAttempts
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
        self.backoffMultiplier = backoffMultiplier
        self.jitterEnabled = jitterEnabled
    }

    func getReconnectDelay(attempt: Int) -> TimeInterval {
        let exponentialDelay = baseDelay * pow(backoffMultiplier, Double(attempt - 1))
        let cappedDelay = min(exponentialDelay, maxDelay)

        if jitterEnabled {
            let jitter = Double.random(in: 0.8...1.2)
            return cappedDelay * jitter
        } else {
            return cappedDelay
        }
    }
}

// ServerEvent is now defined in Shared/Models/ProtocolModels.swift

// AnyCodable is defined in HealthTypes.swift

enum EventSourceError: LocalizedError {
    case invalidURL
    case httpError(Int)
    case invalidContentType
    case connectionError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid EventSource URL"
        case .httpError(let code):
            return "HTTP error: \\(code)"
        case .invalidContentType:
            return "Invalid content type for EventSource"
        case .connectionError(let error):
            return "Connection error: \\(error.localizedDescription)"
        }
    }
}

// SSE Event parsing helpers
private struct SSEEvent {
    let id: String?
    let eventType: String?
    let data: String
}

private class SSEEventBuilder {
    var id: String?
    var eventType: String?
    private var dataComponents: [String] = []

    func appendData(_ data: String) {
        dataComponents.append(data)
    }

    func build() -> SSEEvent? {
        guard !dataComponents.isEmpty else { return nil }

        let data = dataComponents.joined(separator: "\\n")
        return SSEEvent(id: id, eventType: eventType, data: data)
    }
}
