import Foundation
import Network
import Combine
import OSLog
#if canImport(UIKit)
import UIKit
#endif

/// Main connection manager that implements the hybrid connectivity strategy
/// Coordinates direct connections, relay connections, and failover logic
public class ConnectionManager: ConnectionStrategyCoordinator {

    // MARK: - Properties

    /// Logger for debugging and monitoring
    private let logger = Logger(subsystem: "PlanToCode", category: "ConnectionManager")

    /// Relay-first architecture enforcement - disable direct connections
    private let serverRelayOnly = true

    /// Current connection state
    public private(set) var connectionState = ConnectionState.disconnected

    /// Previous state for tracking state changes
    private var previousState = ConnectionState.disconnected

    /// Current established connection type
    public private(set) var currentConnectionType: EstablishedConnectionType?

    /// Connection quality metrics
    public private(set) var qualityMetrics = ConnectionQualityMetrics()

    /// WebSocket client for connections
    private let webSocketClient: WebSocketClient

    /// Network monitor
    private let networkMonitor: NetworkMonitor

    /// Server relay client
    private let relayClient: ServerRelayClient

    /// Current configuration
    private var currentConfig: ConnectionConfig?

    /// State continuation for async stream
    private var stateContinuation: AsyncStream<ConnectionState>.Continuation?

    /// Quality continuation for async stream
    private var qualityContinuation: AsyncStream<ConnectionQualityMetrics>.Continuation?

    /// Message continuation for async stream
    private var messageContinuation: AsyncStream<Data>.Continuation?

    /// Background task for connection monitoring
    private var monitoringTask: Task<Void, Never>?

    /// Network change monitoring task
    private var networkChangeTask: Task<Void, Never>?

    /// Event listeners
    private var eventListeners: [any ConnectionEventListener] = []

    /// Connection attempt history for analytics
    private var connectionHistory: [ConnectionAttempt] = []

    /// Failover in progress flag
    private var failoverInProgress = false

    /// Combine cancellables
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init(
        relayClient: ServerRelayClient? = nil,
        networkMonitor: NetworkMonitor? = nil
    ) {
        // Get server URL from Config.serverURL
        guard let urlString = Config.serverURL.isEmpty ? nil : Config.serverURL,
              let serverURL = URL(string: urlString) else {
            fatalError("Server URL not configured")
        }

        let deviceId = DeviceManager.shared.getOrCreateDeviceID()

        // Get pinning delegate for relay endpoint
        let pinningDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)

        // Initialize all stored properties first
        self.webSocketClient = WebSocketClient(serverURL: serverURL, sessionDelegate: pinningDelegate)
        self.relayClient = relayClient ?? ServerRelayClient(serverURL: serverURL, deviceId: deviceId, sessionDelegate: pinningDelegate)
        self.networkMonitor = networkMonitor ?? DefaultNetworkMonitor()

        // Now call instance methods after all properties are initialized
        setupEventHandlers()
        startNetworkMonitoring()
        setupLifecycleObservers()
    }

    /// Start events if enabled (WebSocket connection gated behind relay-first check)
    public func startEventsIfEnabled() {
        guard serverRelayOnly == false else {
            logger.info("Events disabled due to server relay only mode")
            return
        }
        // Would start WebSocket client here if not in relay-only mode
    }

    private func getServerURL() -> URL? {
        guard let urlString = Config.serverURL.isEmpty ? nil : Config.serverURL,
              let url = URL(string: urlString) else {
            return nil
        }
        return url
    }

    deinit {
        monitoringTask?.cancel()
        networkChangeTask?.cancel()
    }

    // MARK: - ConnectionStrategyCoordinator Implementation

    public func connect(config: ConnectionConfig) async -> ConnectionResult {
        self.currentConfig = config

        // Reject .directOnly with explicit error
        if config.strategy == .directOnly {
            let error = ConnectionStrategyError.invalidConfiguration("Direct connections are disabled; server-relay-only enforced")
            connectionState = .failed(error)
            emitStateChange()
            return .failure(error)
        }

        connectionState = .connecting
        emitStateChange()
        emitEvent(.connectionAttemptStarted(method: "relay", target: "server"))

        let startTime = Date()

        do {
            // Always use ServerRelayClient with Config.serverURL
            guard let jwtToken = config.authentication.jwtToken else {
                throw ConnectionStrategyError.authenticationFailed("JWT token required")
            }

            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                relayClient.connect(jwtToken: jwtToken)
                    .sink(
                        receiveCompletion: { completion in
                            switch completion {
                            case .finished:
                                continuation.resume()
                            case .failure(let error):
                                continuation.resume(throwing: error)
                            }
                        },
                        receiveValue: { _ in
                            // Connection successful - completion will be called with .finished
                        }
                    )
                    .store(in: &cancellables)
            }

            let duration = Date().timeIntervalSince(startTime)
            emitEvent(.connectionAttemptSucceeded(method: "relay", target: "server", duration: duration))

            connectionState = .connected(ConnectionHandshake(
                sessionId: UUID().uuidString,
                clientId: config.authentication.clientId,
                transport: "relay"
            ))
            emitStateChange()

            // Start quality monitoring
            startQualityMonitoring()

            return .success(.relay(sessionId: UUID().uuidString, relayURL: relayClient.serverURL))

        } catch {
            let duration = Date().timeIntervalSince(startTime)
            emitEvent(.connectionAttemptFailed(method: "relay", target: "server", error: error, duration: duration))

            connectionState = .failed(error)
            emitStateChange()

            return .failure(error)
        }
    }

    public func disconnect() async {
        connectionState = .closing
        emitStateChange()

        // Cancel monitoring
        monitoringTask?.cancel()
        monitoringTask = nil

        // Disconnect relay client
        relayClient.disconnect()

        // Clear state
        currentConnectionType = nil
        connectionState = .disconnected
        emitStateChange()
    }

    public func sendMessage(_ message: Data) async throws {
        guard connectionState.isConnected else {
            throw ConnectionStrategyError.networkUnavailable
        }
        // Convert Data to dictionary and send via relay client
        if let messageDict = try? JSONSerialization.jsonObject(with: message) as? [String: Any],
           let type = messageDict["type"] as? String {
            let payload = messageDict["payload"] as? [String: Any]
            try await relayClient.sendMessage(type: type, payload: payload)
        } else {
            throw ConnectionStrategyError.invalidConfiguration("Invalid message format")
        }
    }

    public var messageStream: AsyncStream<Data> {
        AsyncStream { continuation in
            messageContinuation = continuation
        }
    }

    public var stateStream: AsyncStream<ConnectionState> {
        AsyncStream { continuation in
            stateContinuation = continuation
        }
    }

    public var qualityStream: AsyncStream<ConnectionQualityMetrics> {
        AsyncStream { continuation in
            qualityContinuation = continuation
        }
    }







    // MARK: - Quality Monitoring

    private func startQualityMonitoring() {
        monitoringTask = Task {
            while !Task.isCancelled && connectionState.isConnected {
                try? await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds

                // Update quality metrics from relay client
                let newMetrics = ConnectionQualityMetrics() // Default metrics for relay connection
                if newMetrics.lastMeasurement != qualityMetrics.lastMeasurement {
                    qualityMetrics = newMetrics
                    qualityContinuation?.yield(qualityMetrics)
                    emitEvent(.qualityMetricsUpdated(qualityMetrics))
                }

                // Check if connection quality degraded significantly
                if qualityMetrics.stability < 0.5 && !failoverInProgress {
                    await attemptFailover()
                }
            }
        }
    }

    private func attemptFailover() async {
        // Failover not supported in server-relay-only mode
        logger.debug("Failover not supported in server-relay-only mode")
    }

    // MARK: - Event Handling

    private func setupEventHandlers() {
        // Subscribe to relayClient.$connectionState and relayClient.events
        relayClient.$connectionState
            .sink { [weak self] state in
                self?.connectionState = state
                self?.emitStateChange()
            }
            .store(in: &cancellables)

        relayClient.events
            .sink { [weak self] event in
                // Convert RelayEvent to Data for compatibility
                if let eventData = try? JSONEncoder().encode(event) {
                    self?.messageContinuation?.yield(eventData)
                    self?.emitEvent(.messageReceived(size: eventData.count))
                }
            }
            .store(in: &cancellables)
    }

    private func setupLifecycleObservers() {
        #if canImport(UIKit)
        // Add observer for app becoming active
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            Task {
                await MultiConnectionManager.shared.restoreConnections()
            }
        }
        #endif
    }

    private func startNetworkMonitoring() {
        networkMonitor.startMonitoring()

        networkChangeTask = Task { [weak self] in
            guard let self else { return }
            for await path in self.networkMonitor.networkChangeStream {
                await self.handleNetworkPathChange(path)
            }
        }
    }

    @MainActor
    private func handleNetworkPathChange(_ path: NWPath) {
        emitEvent(.networkChanged(path: path))

        // Handle network changes - might trigger reconnection
        if !path.status.isUsable && connectionState.isConnected {
            // Network became unavailable
            connectionState = .failed(ConnectionStrategyError.networkUnavailable)
            emitStateChange()
        } else if path.status.isUsable && connectionState.isFailed {
            // Network became available - attempt reconnection
            if let config = currentConfig {
                Task {
                    _ = await connect(config: config)
                }
            }
            // Also restore multi-connections when network becomes available
            Task {
                await MultiConnectionManager.shared.restoreConnections()
            }
        }
    }

    // MARK: - Utilities

    private func emitStateChange() {
        stateContinuation?.yield(connectionState)
        emitEvent(.stateChanged(from: previousState, to: connectionState))
        previousState = connectionState
    }

    private func emitEvent(_ event: ConnectionEvent) {
        DispatchQueue.main.async {
            for listener in self.eventListeners {
                listener.handleEvent(event)
            }
        }
    }

    private func recordConnectionAttempt(method: ConnectionMethod, success: Bool, error: Error?) {
        let attempt = ConnectionAttempt(
            method: method,
            timestamp: Date(),
            success: success,
            error: error
        )
        connectionHistory.append(attempt)

        // Keep only last 100 attempts
        if connectionHistory.count > 100 {
            connectionHistory.removeFirst()
        }
    }

    // MARK: - Public Utilities

    public func addEventListener(_ listener: any ConnectionEventListener) {
        eventListeners.append(listener)
    }

    public func removeEventListener(_ listener: any ConnectionEventListener) {
        eventListeners.removeAll { $0 === listener as AnyObject }
    }

    public func getConnectionHistory() -> [ConnectionAttempt] {
        return connectionHistory
    }

    public func getNetworkStatus() -> NWPath? {
        return networkMonitor.currentPath
    }

    /// Send a structured protocol message
    public func sendProtocolMessage(type: String, payload: [String: Any]) async throws {
        guard connectionState.isConnected else {
            throw ConnectionStrategyError.networkUnavailable
        }

        // Add timestamp and id to payload
        var enrichedPayload = payload
        enrichedPayload["timestamp"] = Date().timeIntervalSince1970
        enrichedPayload["id"] = UUID().uuidString

        try await relayClient.sendMessage(type: type, payload: enrichedPayload)
    }

}

// MARK: - Supporting Types

/// Connection attempt record for analytics
public struct ConnectionAttempt {
    public let method: ConnectionMethod
    public let timestamp: Date
    public let success: Bool
    public let error: Error?
}

/// Connection method used
public enum ConnectionMethod {
    case direct
    case relay
    case failover
}

/// Relay session information
public struct RelaySessionInfo {
    public let sessionId: String
    public let websocketURL: String
    public let sessionToken: String
    public let timeoutSeconds: TimeInterval
}

/// Relay service client protocol
public protocol RelayServiceClient {
    func createSession(config: ConnectionConfig) async -> Result<RelaySessionInfo, Error>
    func joinSession(sessionId: String, sessionToken: String) async -> Result<Void, Error>
    func destroySession(sessionId: String) async -> Result<Void, Error>
}

// MARK: - Extensions

extension NWPath.Status {
    var isUsable: Bool {
        return self == .satisfied
    }
}

extension ConnectionEventListener {
    // Protocol constraint to ensure AnyObject conformance
}

// MARK: - Default Implementations


/// Default network monitor implementation
public class DefaultNetworkMonitor: NetworkMonitor {
    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.vibemanager.network.monitor")

    public private(set) var currentPath: NWPath?

    private var networkContinuation: AsyncStream<NWPath>.Continuation?

    public var isNetworkAvailable: Bool {
        currentPath?.status == .satisfied
    }

    public var isOnWiFi: Bool {
        currentPath?.usesInterfaceType(.wifi) == true
    }

    public var isOnCellular: Bool {
        currentPath?.usesInterfaceType(.cellular) == true
    }

    public var networkChangeStream: AsyncStream<NWPath> {
        AsyncStream { continuation in
            networkContinuation = continuation
        }
    }

    public func startMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            self?.currentPath = path
            self?.networkContinuation?.yield(path)
        }
        pathMonitor.start(queue: monitorQueue)
    }

    public func stopMonitoring() {
        pathMonitor.cancel()
        networkContinuation?.finish()
    }
}

