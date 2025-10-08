import Foundation
import Foundation
import Combine
import OSLog
import Network
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Task Description Types

public struct WebSocketTaskDescription: Codable {
    public let id: String
    public let sessionId: String
    public let content: String
    public let createdAt: Int64
    public let updatedAt: Int64
    public let createdBy: String
    public let version: UInt32
    public let isActive: Bool
    public let checksum: String
}

public struct TaskDescriptionUpdatePayload: Codable {
    public let taskId: String
    public let sessionId: String
    public let content: String
    public let version: UInt32
    public let deviceId: String
    public let updatedAt: Int64
}

// MARK: - Supporting Types for WebSocket

public struct ReconnectionConfig {
    public let maxRetries: Int
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval

    public init(maxRetries: Int = 5, baseDelay: TimeInterval = 1.0, maxDelay: TimeInterval = 30.0) {
        self.maxRetries = maxRetries
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
    }

    public var maxReconnectAttempts: Int {
        return maxRetries
    }

    public func getReconnectDelay(attempt: Int) -> TimeInterval {
        let exponentialDelay = baseDelay * pow(2.0, Double(attempt - 1))
        return min(exponentialDelay, maxDelay)
    }
}

public struct EventFilters: Codable {
    public let eventTypes: [String]?
    public let sessionIds: [String]?
    public let projectDirectories: [String]?

    public init(eventTypes: [String]? = nil, sessionIds: [String]? = nil, projectDirectories: [String]? = nil) {
        self.eventTypes = eventTypes
        self.sessionIds = sessionIds
        self.projectDirectories = projectDirectories
    }
}

/// WebSocket client for bidirectional real-time communication
public class WebSocketClient: NSObject, ObservableObject {
    private let logger = Logger(subsystem: "VibeManager", category: "WebSocket")

    // MARK: - Published Properties
    @Published public private(set) var connectionState: ConnectionState = .disconnected
    @Published public private(set) var lastPingTime: Date?
    @Published public private(set) var roundTripTime: TimeInterval?
    @Published public private(set) var reconnectAttempts: Int = 0

    // MARK: - Private Properties
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession
    private var cancellables = Set<AnyCancellable>()

    // Event handling
    private var messageSubject = PassthroughSubject<WebSocketMessage, Never>()
    private var eventSubject = PassthroughSubject<ServerEvent, Never>()
    private var taskUpdatesSubject = PassthroughSubject<TaskDescription, Never>()

    // Configuration
    private var serverURL: URL
    private let reconnectionConfig: ReconnectionConfig
    private var subscriptions: [String: EventSubscription] = [:]
    private var sessionDelegate: URLSessionDelegate?

    // Heartbeat and connection monitoring
    private var heartbeatTimer: Timer?
    private var reconnectionTimer: Timer?
    private var isReconnecting = false
    private var pendingPings: [String: Date] = [:]
    private var connectedAt: Date?
    private var metrics = ConnectionQualityMetrics()

    // Auto-connect control
    public var autoConnect = false

    // Network monitoring
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "NetworkMonitor")

    // MARK: - Public Interface

    /// Stream of incoming WebSocket messages
    public var messageStream: AnyPublisher<WebSocketMessage, Never> {
        messageSubject.eraseToAnyPublisher()
    }

    /// Stream of incoming events
    public var eventStream: AnyPublisher<ServerEvent, Never> {
        eventSubject.eraseToAnyPublisher()
    }

    /// Stream of task description updates
    public var taskUpdates: AnyPublisher<TaskDescription, Never> {
        taskUpdatesSubject.eraseToAnyPublisher()
    }

    /// Current connection quality metrics snapshot
    public var currentQualityMetrics: ConnectionQualityMetrics {
        if let connectedAt {
            return ConnectionQualityMetrics(
                roundTripTimeMs: metrics.roundTripTimeMs,
                stability: metrics.stability,
                bytesSent: metrics.bytesSent,
                bytesReceived: metrics.bytesReceived,
                messagesSent: metrics.messagesSent,
                messagesReceived: metrics.messagesReceived,
                connectionDuration: Date().timeIntervalSince(connectedAt),
                lastMeasurement: metrics.lastMeasurement
            )
        }
        return metrics
    }

    // MARK: - Initialization

    public init(
        serverURL: URL,
        reconnectionConfig: ReconnectionConfig = ReconnectionConfig(),
        sessionDelegate: URLSessionDelegate? = nil
    ) {
        self.serverURL = serverURL
        self.reconnectionConfig = reconnectionConfig
        self.sessionDelegate = sessionDelegate

        // Create URLSession with WebSocket configuration
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 0

        let delegate = sessionDelegate ?? CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.urlSession = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)

        super.init()

        setupNetworkMonitoring()
        setupApplicationLifecycleObservers()
    }

    deinit {
        disconnect()
        networkMonitor.cancel()
        cancellables.removeAll()
    }

    // MARK: - Connection Management

    /// Connect to the WebSocket endpoint
    public func connect() {
        guard !connectionState.isConnected && connectionState != .connecting else {
            logger.warning("Already connected or connecting")
            return
        }

        logger.info("Connecting to WebSocket: \(self.serverURL)")
        connectionState = .connecting

        establishConnection()
    }

    /// Update the server endpoint and TLS delegate before reconnecting.
    public func updateEndpoint(serverURL: URL, sessionDelegate: URLSessionDelegate?) {
        disconnect()
        self.serverURL = serverURL
        self.sessionDelegate = sessionDelegate

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 0

        urlSession.invalidateAndCancel()
        let delegate = sessionDelegate ?? CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        urlSession = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }

    /// Disconnect from the WebSocket endpoint
    public func disconnect() {
        logger.info("Disconnecting from WebSocket")

        connectionState = .disconnected
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        stopHeartbeat()
        cancelReconnection()
        isReconnecting = false
        reconnectAttempts = 0
        subscriptions.removeAll()
        resetMetrics()
    }

    /// Manually trigger reconnection
    public func reconnect() {
        logger.info("Manual reconnection triggered")
        disconnect()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.connect()
        }
    }

    // MARK: - Subscription Management

    /// Subscribe to events with filters
    public func subscribe(
        subscriptionId: String? = nil,
        filters: EventFilters,
        options: SubscriptionOptions = SubscriptionOptions()
    ) async throws -> String {
        let subId = subscriptionId ?? UUID().uuidString

        let subscription = EventSubscription(
            subscriptionId: subId,
            filters: filters,
            options: options
        )

        subscriptions[subId] = subscription

        let message = WebSocketMessage.subscribe(SubscribeMessage(
            subscriptionId: subId,
            filters: filters,
            options: options
        ))

        try await sendMessage(message)
        return subId
    }

    /// Unsubscribe from events
    public func unsubscribe(subscriptionId: String) async throws {
        subscriptions.removeValue(forKey: subscriptionId)

        let message = WebSocketMessage.unsubscribe(UnsubscribeMessage(
            subscriptionId: subscriptionId
        ))

        try await sendMessage(message)
    }

    /// Acknowledge event receipt
    public func acknowledgeEvent(eventId: String, eventSeq: UInt64) async throws {
        let message = WebSocketMessage.ack(AckMessage(
            eventId: eventId,
            batchId: nil,
            eventSeq: eventSeq,
            success: true,
            error: nil
        ))

        try await sendMessage(message)
    }

    /// Request event replay
    public func requestReplay(
        fromSequence: UInt64,
        toSequence: UInt64? = nil,
        filters: EventFilters? = nil,
        maxEvents: UInt32? = nil
    ) async throws -> String {
        let requestId = UUID().uuidString

        let message = WebSocketMessage.replayRequest(ReplayRequestMessage(
            requestId: requestId,
            fromSeq: fromSequence,
            toSeq: toSequence,
            filters: filters,
            maxEvents: maxEvents
        ))

        try await sendMessage(message)
        return requestId
    }

    // MARK: - Private Methods

    private func establishConnection() {
        // Use Config.deviceLinkWebSocketURL for the WebSocket URL
        let wsURL = Config.deviceLinkWebSocketURL
        var request = URLRequest(url: wsURL)

        // Set handshake headers
        Task {
            let token = await AuthService.shared.getValidAccessToken() ?? ""
            let deviceId = DeviceManager.shared.getOrCreateDeviceID()

            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
            request.setValue(deviceId, forHTTPHeaderField: "X-Token-Binding")
            request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")

            webSocketTask = urlSession.webSocketTask(with: request)
            webSocketTask?.resume()

            startReceiving()
            startHeartbeat()

            logger.debug("Connecting device-link WebSocket: \(wsURL)")
        }
    }

    private func startReceiving() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let message):
                self.handleWebSocketMessage(message)
                // Continue receiving
                self.startReceiving()

            case .failure(let error):
                self.logger.error("WebSocket receive error: \(error)")
                self.handleConnectionFailure(.connectionError(error))
            }
        }
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            updateMetrics(bytesReceivedDelta: UInt64(text.utf8.count), messagesReceivedDelta: 1)
            handleTextMessage(text)

        case .data(let data):
            updateMetrics(bytesReceivedDelta: UInt64(data.count), messagesReceivedDelta: 1)
            if let text = String(data: data, encoding: .utf8) {
                handleTextMessage(text)
            } else {
                logger.warning("Received binary data that couldn't be decoded as UTF-8")
            }

        @unknown default:
            logger.warning("Received unknown WebSocket message type")
        }
    }

    private func handleTextMessage(_ text: String) {
        do {
            let message = try JSONDecoder().decode(WebSocketMessage.self, from: text.data(using: .utf8)!)

            DispatchQueue.main.async {
                self.messageSubject.send(message)
            }

            handleParsedMessage(message)

        } catch {
            logger.error("Failed to decode WebSocket message: \(error)")
        }
    }

    private func handleParsedMessage(_ message: WebSocketMessage) {
        switch message {
        case .connected(let connectedMsg):
            handleConnectedMessage(connectedMsg)

        case .event(let eventMsg):
            handleEventMessage(eventMsg)

        case .eventBatch(let batchMsg):
            handleEventBatchMessage(batchMsg)

        case .pong(let pongMsg):
            handlePongMessage(pongMsg)

        case .subscriptionConfirmed(let confirmMsg):
            handleSubscriptionConfirmed(confirmMsg)

        case .subscriptionError(let errorMsg):
            handleSubscriptionError(errorMsg)

        case .error(let errorMsg):
            handleErrorMessage(errorMsg)

        case .replayResponse(let replayMsg):
            handleReplayResponse(replayMsg)

        default:
            logger.debug("Received unhandled message type")
        }
    }

    private func handleConnectedMessage(_ message: ConnectedMessage) {
        logger.info("WebSocket upgrade success (device-link): \(message.sessionId)")

        DispatchQueue.main.async {
            let connectionResult = ConnectionHandshake(sessionId: message.sessionId, clientId: message.deviceId, transport: "websocket")
            self.connectionState = .connected(connectionResult)
            self.reconnectAttempts = 0
            self.connectedAt = Date()
            self.metrics = ConnectionQualityMetrics()
        }
    }

    private func handleEventMessage(_ message: EventMessage) {
        // Log event with structured information
        let eventType = message.event.eventType
        let sequence = message.event.sequence
        let dataKeys = (message.event.data.value as? [String: Any])?.keys.joined(separator: ",") ?? ""
        logger.info("Event: type=\(eventType, privacy: .public) seq=\(sequence) keys=\(dataKeys, privacy: .public)")

        DispatchQueue.main.async {
            self.eventSubject.send(message.event)

            // Handle specific event types
            if message.event.eventType == "TaskDescriptionUpdated",
               let payloadData = try? JSONSerialization.data(withJSONObject: message.event.data.value) {
                do {
                    let taskUpdate = try JSONDecoder().decode(TaskDescriptionUpdatePayload.self, from: payloadData)

                    let taskDescription = TaskDescription(
                        id: taskUpdate.taskId,
                        sessionId: taskUpdate.sessionId,
                        content: taskUpdate.content,
                        createdAt: 0, // Not provided in update payload
                        updatedAt: taskUpdate.updatedAt,
                        createdBy: taskUpdate.deviceId,
                        version: taskUpdate.version,
                        isActive: true,
                        checksum: ""  // Would need to calculate or receive from server
                    )

                    self.taskUpdatesSubject.send(taskDescription)
                } catch {
                    self.logger.error("Failed to decode TaskDescriptionUpdatePayload: \(error.localizedDescription)")
                }
            }
        }

        // Auto-acknowledge if required
        if let subscription = message.subscriptionId.flatMap({ subscriptions[$0] }),
           subscription.options.requireAcks {
            Task {
                try? await acknowledgeEvent(
                    eventId: message.event.id,
                    eventSeq: message.event.sequence
                )
            }
        }
    }

    private func handleEventBatchMessage(_ message: EventBatchMessage) {
        // Log batch event with structured information
        let batchSize = message.events.count
        let batchSeq = message.batchSeq
        let eventTypes = message.events.map { $0.eventType }.joined(separator: ",")
        logger.info("EventBatch: batchId=\(message.batchId, privacy: .public) seq=\(batchSeq) size=\(batchSize) types=\(eventTypes, privacy: .public)")

        for event in message.events {
            let eventType = event.eventType
            let sequence = event.sequence
            let dataKeys = (event.data.value as? [String: Any])?.keys.joined(separator: ",") ?? ""
            logger.info("Event: type=\(eventType, privacy: .public) seq=\(sequence) keys=\(dataKeys, privacy: .public)")

            DispatchQueue.main.async {
                self.eventSubject.send(event)
            }
        }

        // Auto-acknowledge batch if required
        if let subscription = message.subscriptionId.flatMap({ subscriptions[$0] }),
           subscription.options.requireAcks {
            Task {
                let ackMessage = WebSocketMessage.ack(AckMessage(
                    eventId: nil,
                    batchId: message.batchId,
                    eventSeq: message.batchSeq,
                    success: true,
                    error: nil
                ))
                try? await sendMessage(ackMessage)
            }
        }
    }

    private func handlePongMessage(_ message: PongMessage) {
        if let pingTime = pendingPings.removeValue(forKey: message.pingId) {
            let roundTrip = Date().timeIntervalSince(pingTime)
            DispatchQueue.main.async {
                self.roundTripTime = roundTrip
            }
            logger.debug("Ping roundtrip: \(roundTrip * 1000)ms")
            updateMetrics(roundTripMs: roundTrip * 1000)
        }
    }

    private func handleSubscriptionConfirmed(_ message: SubscriptionConfirmedMessage) {
        logger.info("Subscription confirmed: \(message.subscriptionId)")
    }

    private func handleSubscriptionError(_ message: SubscriptionErrorMessage) {
        logger.error("Subscription error: \(message.errorMessage)")
        subscriptions.removeValue(forKey: message.subscriptionId)
    }

    private func handleErrorMessage(_ message: ErrorMessage) {
        logger.error("WebSocket error: \(message.errorMessage)")

        if message.fatal {
            handleConnectionFailure(.serverError(message.errorMessage))
        }
    }

    private func handleReplayResponse(_ message: ReplayResponseMessage) {
        logger.info("Received replay with \(message.events.count) events")

        for event in message.events {
            DispatchQueue.main.async {
                self.eventSubject.send(event)
            }
        }
    }

    private func sendAuthenticationMessage() {
        Task {
            do {
                // Get device ID and token for authentication
                let deviceId = DeviceManager.shared.getOrCreateDeviceID()

                // Create authentication message
                let authMessage = WebSocketMessage.authenticate(AuthenticateMessage(
                    token: await AuthService.shared.getValidAccessToken(),
                    deviceId: deviceId,
                    clientType: "mobile"
                ))

                try await sendMessage(authMessage)
                logger.info("Authentication message sent")
            } catch {
                logger.error("Failed to send authentication message: \(error)")
                handleConnectionFailure(.authenticationFailed(error.localizedDescription))
            }
        }
    }

    public func send(message: WebSocketMessage) async throws {
        try await sendMessage(message)
    }

    private func sendMessage(_ message: WebSocketMessage) async throws {
        guard let webSocketTask = webSocketTask else {
            throw WebSocketError.notConnected
        }

        let data = try JSONEncoder().encode(message)
        let text = String(data: data, encoding: .utf8)!

        try await webSocketTask.send(.string(text))
        updateMetrics(bytesSentDelta: UInt64(data.count), messagesSentDelta: 1)
    }

    public func send(data: Data) async throws {
        guard let webSocketTask = webSocketTask else {
            throw WebSocketError.notConnected
        }
        try await webSocketTask.send(.data(data))
        updateMetrics(bytesSentDelta: UInt64(data.count), messagesSentDelta: 1)
    }

    public func send(text: String) async throws {
        guard let webSocketTask = webSocketTask else {
            throw WebSocketError.notConnected
        }
        try await webSocketTask.send(.string(text))
        updateMetrics(bytesSentDelta: UInt64(text.utf8.count), messagesSentDelta: 1)
    }

    private func updateMetrics(
        bytesSentDelta: UInt64 = 0,
        bytesReceivedDelta: UInt64 = 0,
        messagesSentDelta: UInt64 = 0,
        messagesReceivedDelta: UInt64 = 0,
        roundTripMs: TimeInterval? = nil
    ) {
        let now = Date()
        let duration = connectedAt.map { max(0, now.timeIntervalSince($0)) } ?? 0
        let roundTrip = roundTripMs ?? metrics.roundTripTimeMs
        let stability: Double
        if let roundTripMs {
            stability = max(0.0, min(1.0, 1.0 - (roundTripMs / 2000.0)))
        } else {
            stability = metrics.stability
        }

        metrics = ConnectionQualityMetrics(
            roundTripTimeMs: roundTrip,
            stability: stability,
            bytesSent: metrics.bytesSent + bytesSentDelta,
            bytesReceived: metrics.bytesReceived + bytesReceivedDelta,
            messagesSent: metrics.messagesSent + messagesSentDelta,
            messagesReceived: metrics.messagesReceived + messagesReceivedDelta,
            connectionDuration: duration,
            lastMeasurement: now
        )
    }

    private func resetMetrics() {
        metrics = ConnectionQualityMetrics()
        connectedAt = nil
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.sendPing()
        }
    }

    private func stopHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
    }

    private func sendPing() {
        guard case .connected = connectionState else { return }

        let pingId = UUID().uuidString
        let now = Date()

        pendingPings[pingId] = now

        let pingMessage = WebSocketMessage.ping(PingMessage(
            pingId: pingId,
            timestamp: now,
            expectPong: true
        ))

        Task {
            try? await sendMessage(pingMessage)
        }

        DispatchQueue.main.async {
            self.lastPingTime = now
        }

        // Clean up old pending pings
        let cutoff = now.addingTimeInterval(-60) // 1 minute timeout
        pendingPings = pendingPings.filter { $1 > cutoff }
    }

    // MARK: - Reconnection

    private func handleConnectionFailure(_ error: WebSocketError) {
        logger.error("Connection failed: \(error.localizedDescription)")

        DispatchQueue.main.async {
            self.connectionState = .disconnected
        }

        webSocketTask = nil
        stopHeartbeat()
        resetMetrics()

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
        logger.info("Scheduling reconnection in \(delay) seconds (attempt \(self.reconnectAttempts))")

        DispatchQueue.main.async {
            self.connectionState = .reconnecting
        }

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

    // MARK: - Network Monitoring

    private func setupNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }

            if path.status == .satisfied && self.connectionState == .disconnected {
                self.logger.info("Network became available, attempting to reconnect")
                DispatchQueue.main.async {
                    self.connect()
                }
            } else if path.status != .satisfied, case .connected = self.connectionState {
                self.logger.warning("Network became unavailable")
                self.handleConnectionFailure(.networkUnavailable)
            }
        }

        networkMonitor.start(queue: networkQueue)
    }

    private func setupApplicationLifecycleObservers() {
        // Reconnect when app becomes active
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                if self.connectionState == .disconnected && !self.isReconnecting {
                    self.logger.info("App became active, reconnecting WebSocket")
                    self.connect()
                }
            }
            .store(in: &cancellables)

        // Disconnect when app enters background
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                guard let self = self else { return }
                self.logger.info("App entered background, disconnecting WebSocket")
                self.disconnect()
            }
            .store(in: &cancellables)
    }
}

// MARK: - Supporting Types

public struct EventSubscription {
    public let subscriptionId: String
    public let filters: EventFilters
    public let options: SubscriptionOptions
    public let createdAt: Date

    init(subscriptionId: String, filters: EventFilters, options: SubscriptionOptions) {
        self.subscriptionId = subscriptionId
        self.filters = filters
        self.options = options
        self.createdAt = Date()
    }
}

public struct SubscriptionOptions: Codable {
    public let enableBatching: Bool
    public let maxBatchSize: UInt32
    public let maxBatchWaitMs: UInt64
    public let requireAcks: Bool
    public let maxUnackedEvents: UInt32
    public let includeHistory: Bool
    public let maxHistoryEvents: UInt32?
    public let enableCompression: Bool
    public let compressionThreshold: UInt32

    public init(
        enableBatching: Bool = true,
        maxBatchSize: UInt32 = 50,
        maxBatchWaitMs: UInt64 = 100,
        requireAcks: Bool = true,
        maxUnackedEvents: UInt32 = 100,
        includeHistory: Bool = false,
        maxHistoryEvents: UInt32? = 100,
        enableCompression: Bool = true,
        compressionThreshold: UInt32 = 1024
    ) {
        self.enableBatching = enableBatching
        self.maxBatchSize = maxBatchSize
        self.maxBatchWaitMs = maxBatchWaitMs
        self.requireAcks = requireAcks
        self.maxUnackedEvents = maxUnackedEvents
        self.includeHistory = includeHistory
        self.maxHistoryEvents = maxHistoryEvents
        self.enableCompression = enableCompression
        self.compressionThreshold = compressionThreshold
    }
}

// WebSocket message types
public enum WebSocketMessage: Codable {
    case authenticate(AuthenticateMessage)
    case subscribe(SubscribeMessage)
    case unsubscribe(UnsubscribeMessage)
    case event(EventMessage)
    case eventBatch(EventBatchMessage)
    case ack(AckMessage)
    case subscriptionConfirmed(SubscriptionConfirmedMessage)
    case subscriptionError(SubscriptionErrorMessage)
    case ping(PingMessage)
    case pong(PongMessage)
    case connected(ConnectedMessage)
    case error(ErrorMessage)
    case replayRequest(ReplayRequestMessage)
    case replayResponse(ReplayResponseMessage)

    private enum CodingKeys: String, CodingKey {
        case type
    }

    private enum MessageType: String, Codable {
        case authenticate, subscribe, unsubscribe, event, eventBatch, ack
        case subscriptionConfirmed, subscriptionError, ping, pong
        case connected, error, replayRequest, replayResponse
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(MessageType.self, forKey: .type)

        switch type {
        case .authenticate:
            self = .authenticate(try AuthenticateMessage(from: decoder))
        case .subscribe:
            self = .subscribe(try SubscribeMessage(from: decoder))
        case .unsubscribe:
            self = .unsubscribe(try UnsubscribeMessage(from: decoder))
        case .event:
            self = .event(try EventMessage(from: decoder))
        case .eventBatch:
            self = .eventBatch(try EventBatchMessage(from: decoder))
        case .ack:
            self = .ack(try AckMessage(from: decoder))
        case .subscriptionConfirmed:
            self = .subscriptionConfirmed(try SubscriptionConfirmedMessage(from: decoder))
        case .subscriptionError:
            self = .subscriptionError(try SubscriptionErrorMessage(from: decoder))
        case .ping:
            self = .ping(try PingMessage(from: decoder))
        case .pong:
            self = .pong(try PongMessage(from: decoder))
        case .connected:
            self = .connected(try ConnectedMessage(from: decoder))
        case .error:
            self = .error(try ErrorMessage(from: decoder))
        case .replayRequest:
            self = .replayRequest(try ReplayRequestMessage(from: decoder))
        case .replayResponse:
            self = .replayResponse(try ReplayResponseMessage(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .authenticate(let msg):
            try container.encode(MessageType.authenticate, forKey: .type)
            try msg.encode(to: encoder)
        case .subscribe(let msg):
            try container.encode(MessageType.subscribe, forKey: .type)
            try msg.encode(to: encoder)
        case .unsubscribe(let msg):
            try container.encode(MessageType.unsubscribe, forKey: .type)
            try msg.encode(to: encoder)
        case .event(let msg):
            try container.encode(MessageType.event, forKey: .type)
            try msg.encode(to: encoder)
        case .eventBatch(let msg):
            try container.encode(MessageType.eventBatch, forKey: .type)
            try msg.encode(to: encoder)
        case .ack(let msg):
            try container.encode(MessageType.ack, forKey: .type)
            try msg.encode(to: encoder)
        case .subscriptionConfirmed(let msg):
            try container.encode(MessageType.subscriptionConfirmed, forKey: .type)
            try msg.encode(to: encoder)
        case .subscriptionError(let msg):
            try container.encode(MessageType.subscriptionError, forKey: .type)
            try msg.encode(to: encoder)
        case .ping(let msg):
            try container.encode(MessageType.ping, forKey: .type)
            try msg.encode(to: encoder)
        case .pong(let msg):
            try container.encode(MessageType.pong, forKey: .type)
            try msg.encode(to: encoder)
        case .connected(let msg):
            try container.encode(MessageType.connected, forKey: .type)
            try msg.encode(to: encoder)
        case .error(let msg):
            try container.encode(MessageType.error, forKey: .type)
            try msg.encode(to: encoder)
        case .replayRequest(let msg):
            try container.encode(MessageType.replayRequest, forKey: .type)
            try msg.encode(to: encoder)
        case .replayResponse(let msg):
            try container.encode(MessageType.replayResponse, forKey: .type)
            try msg.encode(to: encoder)
        }
    }
}

// Message payload types
public struct AuthenticateMessage: Codable {
    public let token: String?
    public let deviceId: String
    public let clientType: String

    public init(token: String?, deviceId: String, clientType: String) {
        self.token = token
        self.deviceId = deviceId
        self.clientType = clientType
    }
}

public struct SubscribeMessage: Codable {
    public let subscriptionId: String
    public let filters: EventFilters
    public let options: SubscriptionOptions
}

public struct UnsubscribeMessage: Codable {
    public let subscriptionId: String
}

public struct EventMessage: Codable {
    public let subscriptionId: String?
    public let event: ServerEvent
    public let deliveryAttempt: UInt32
}

public struct EventBatchMessage: Codable {
    public let subscriptionId: String?
    public let events: [ServerEvent]
    public let batchId: String
    public let batchSeq: UInt64
    public let isFinalBatch: Bool
}

public struct AckMessage: Codable {
    public let eventId: String?
    public let batchId: String?
    public let eventSeq: UInt64?
    public let success: Bool
    public let error: String?
}

public struct SubscriptionConfirmedMessage: Codable {
    public let subscriptionId: String
    public let activeFilters: EventFilters
    public let lastEventSeq: UInt64?
}

public struct SubscriptionErrorMessage: Codable {
    public let subscriptionId: String
    public let errorCode: String
    public let errorMessage: String
    public let retryAfter: UInt64?
}

public struct PingMessage: Codable {
    public let pingId: String
    public let timestamp: Date
    public let expectPong: Bool
}

public struct PongMessage: Codable {
    public let pingId: String
    public let timestamp: Date
    public let serverTime: Date
}

public struct ConnectedMessage: Codable {
    public let sessionId: String
    public let deviceId: String
    public let serverTime: Date
    public let protocolVersion: String
    public let capabilities: [String]
    public let maxEventSize: UInt32
    public let heartbeatInterval: UInt64
}

public struct ErrorMessage: Codable {
    public let errorCode: String
    public let errorMessage: String
    public let errorDetails: AnyCodable?
    public let retryAfter: UInt64?
    public let fatal: Bool
    
    public init(errorCode: String, errorMessage: String, errorDetails: Any? = nil, retryAfter: UInt64? = nil, fatal: Bool = false) {
        self.errorCode = errorCode
        self.errorMessage = errorMessage
        self.errorDetails = errorDetails.map { AnyCodable(any: $0) }
        self.retryAfter = retryAfter
        self.fatal = fatal
    }
}

public struct ReplayRequestMessage: Codable {
    public let requestId: String
    public let fromSeq: UInt64
    public let toSeq: UInt64?
    public let filters: EventFilters?
    public let maxEvents: UInt32?
}

public struct ReplayResponseMessage: Codable {
    public let requestId: String
    public let events: [ServerEvent]
    public let hasMore: Bool
    public let nextSeq: UInt64?
}


enum WebSocketError: LocalizedError {
    case notConnected
    case connectionError(Error)
    case serverError(String)
    case networkUnavailable
    case authenticationFailed(String)
    case encodingError

    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "WebSocket not connected"
        case .connectionError(let error):
            return "Connection error: \(error.localizedDescription)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .networkUnavailable:
            return "Network unavailable"
        case .authenticationFailed(let message):
            return "Authentication failed: \(message)"
        case .encodingError:
            return "Message encoding error"
        }
    }
}
