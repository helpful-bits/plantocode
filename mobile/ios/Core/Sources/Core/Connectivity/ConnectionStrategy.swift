import Foundation
import Network

/// Connection strategy types for mobile-desktop communication
public enum ConnectionStrategy {
    /// Try direct connection first, fallback to relay
    case hybrid
    /// Only attempt direct connection
    case directOnly
    /// Only use relay connection
    case relayOnly
}

/// Connection state for tracking connection lifecycle
public enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case handshaking
    case authenticating
    case connected(ConnectionHandshake)
    case reconnecting
    case closing
    case failed(Error)

    public static func == (lhs: ConnectionState, rhs: ConnectionState) -> Bool {
        switch (lhs, rhs) {
        case (.disconnected, .disconnected),
             (.connecting, .connecting),
             (.handshaking, .handshaking),
             (.authenticating, .authenticating),
             (.reconnecting, .reconnecting),
             (.closing, .closing):
            return true
        case let (.connected(lResult), .connected(rResult)):
            return lResult == rResult
        case let (.failed(lError), .failed(rError)):
            return (lError as NSError) == (rError as NSError)
        default:
            return false
        }
    }
}

/// Connection type successfully established
public enum EstablishedConnectionType: Equatable {
    /// Direct WebSocket connection to desktop
    case direct(url: URL)
    /// Relay connection through server
    case relay(sessionId: String, relayURL: URL)
}

/// Connection attempt result
public enum ConnectionResult: Equatable {
    /// Connection successful
    case success(EstablishedConnectionType)
    /// Connection failed
    case failure(Error)
    /// Direct connection established
    case direct
    /// Direct local connection established
    case directLocal
    /// Relay connection established
    case relay
    /// Authenticated connection with details
    case authenticated(sessionId: String, clientId: String, transport: String)

    public static func == (lhs: ConnectionResult, rhs: ConnectionResult) -> Bool {
        switch (lhs, rhs) {
        case (.direct, .direct),
             (.directLocal, .directLocal),
             (.relay, .relay):
            return true
        case let (.success(lType), .success(rType)):
            return lType == rType
        case let (.failure(lError), .failure(rError)):
            return (lError as NSError) == (rError as NSError)
        case let (.authenticated(lSession, lClient, lTransport), .authenticated(rSession, rClient, rTransport)):
            return lSession == rSession && lClient == rClient && lTransport == rTransport
        default:
            return false
        }
    }

    /// Convenience initializer for authenticated connections
    public init(sessionId: String, clientId: String, transport: String) {
        self = .authenticated(sessionId: sessionId, clientId: clientId, transport: transport)
    }
}

/// Connection strategy errors
public enum ConnectionStrategyError: Error, LocalizedError {
    /// Direct connection failed
    case directConnectionFailed(underlying: Error)
    /// Relay connection failed
    case relayConnectionFailed(underlying: Error)
    /// All connection methods failed
    case allConnectionMethodsFailed([Error])
    /// Invalid configuration
    case invalidConfiguration(String)
    /// Authentication failed
    case authenticationFailed(String)
    /// Timeout occurred
    case timeout
    /// Network unavailable
    case networkUnavailable

    public var errorDescription: String? {
        switch self {
        case .directConnectionFailed(let error):
            return "Direct connection failed: \(error.localizedDescription)"
        case .relayConnectionFailed(let error):
            return "Relay connection failed: \(error.localizedDescription)"
        case .allConnectionMethodsFailed(let errors):
            return "All connection methods failed: \(errors.map(\.localizedDescription).joined(separator: ", "))"
        case .invalidConfiguration(let message):
            return "Invalid configuration: \(message)"
        case .authenticationFailed(let message):
            return "Authentication failed: \(message)"
        case .timeout:
            return "Connection timeout"
        case .networkUnavailable:
            return "Network unavailable"
        }
    }
}

/// Connection configuration
public struct ConnectionConfig {
    /// Desktop discovery configuration
    public let desktopDiscovery: DesktopDiscoveryConfig
    /// Relay server configuration
    public let relayServer: RelayServerConfig
    /// Connection strategy to use
    public let strategy: ConnectionStrategy
    /// Connection timeout in seconds
    public let connectionTimeoutSeconds: TimeInterval
    /// Authentication configuration
    public let authentication: AuthenticationConfig
    /// Retry configuration
    public let retry: RetryConfig

    public init(
        desktopDiscovery: DesktopDiscoveryConfig = DesktopDiscoveryConfig(),
        relayServer: RelayServerConfig,
        strategy: ConnectionStrategy = .hybrid,
        connectionTimeoutSeconds: TimeInterval = 10.0,
        authentication: AuthenticationConfig,
        retry: RetryConfig = RetryConfig()
    ) {
        self.desktopDiscovery = desktopDiscovery
        self.relayServer = relayServer
        self.strategy = strategy
        self.connectionTimeoutSeconds = connectionTimeoutSeconds
        self.authentication = authentication
        self.retry = retry
    }
}

/// Desktop discovery configuration
public struct DesktopDiscoveryConfig {
    /// Ports to scan for desktop WebSocket server
    public let scanPorts: [UInt16]
    /// Local network addresses to check
    public let localAddresses: [String]
    /// Discovery timeout per address
    public let discoveryTimeoutSeconds: TimeInterval
    /// Enable mDNS/Bonjour discovery
    public let enableBonjour: Bool
    /// Bonjour service type
    public let bonjourServiceType: String

    public init(
        scanPorts: [UInt16] = [8080, 8081, 8082],
        localAddresses: [String] = [],
        discoveryTimeoutSeconds: TimeInterval = 3.0,
        enableBonjour: Bool = true,
        bonjourServiceType: String = "_plantocode._tcp"
    ) {
        self.scanPorts = scanPorts
        self.localAddresses = localAddresses
        self.discoveryTimeoutSeconds = discoveryTimeoutSeconds
        self.enableBonjour = enableBonjour
        self.bonjourServiceType = bonjourServiceType
    }
}

/// Relay server configuration
public struct RelayServerConfig {
    /// Relay server base URL
    public let baseURL: URL
    /// WebSocket endpoint path
    public let websocketPath: String
    /// API endpoint path
    public let apiPath: String
    /// Enable TLS for relay connection
    public let enableTLS: Bool

    public init(
        baseURL: URL,
        websocketPath: String = "/ws/relay",
        apiPath: String = "/api",
        enableTLS: Bool = true
    ) {
        self.baseURL = baseURL
        self.websocketPath = websocketPath
        self.apiPath = apiPath
        self.enableTLS = enableTLS
    }
}

/// Authentication configuration
public struct AuthenticationConfig {
    /// JWT token for authentication
    public let jwtToken: String?
    /// Client identifier
    public let clientId: String
    /// Client type (always "mobile" for mobile clients)
    public let clientType: String
    /// Additional metadata
    public let metadata: [String: String]

    public init(
        jwtToken: String? = nil,
        clientId: String = UUID().uuidString,
        clientType: String = "mobile",
        metadata: [String: String] = [:]
    ) {
        self.jwtToken = jwtToken
        self.clientId = clientId
        self.clientType = clientType
        self.metadata = metadata
    }
}

/// Retry configuration
public struct RetryConfig {
    /// Maximum number of retry attempts
    public let maxAttempts: Int
    /// Initial retry delay in seconds
    public let initialDelaySeconds: TimeInterval
    /// Exponential backoff multiplier
    public let backoffMultiplier: Double
    /// Maximum retry delay in seconds
    public let maxDelaySeconds: TimeInterval

    public init(
        maxAttempts: Int = 3,
        initialDelaySeconds: TimeInterval = 1.0,
        backoffMultiplier: Double = 2.0,
        maxDelaySeconds: TimeInterval = 30.0
    ) {
        self.maxAttempts = maxAttempts
        self.initialDelaySeconds = initialDelaySeconds
        self.backoffMultiplier = backoffMultiplier
        self.maxDelaySeconds = maxDelaySeconds
    }
}


/// Connection quality metrics
public struct ConnectionQualityMetrics {
    /// Round-trip time in milliseconds
    public let roundTripTimeMs: TimeInterval
    /// Connection stability (0.0 to 1.0)
    public let stability: Double
    /// Bytes sent
    public let bytesSent: UInt64
    /// Bytes received
    public let bytesReceived: UInt64
    /// Messages sent
    public let messagesSent: UInt64
    /// Messages received
    public let messagesReceived: UInt64
    /// Connection duration
    public let connectionDuration: TimeInterval
    /// Last measurement timestamp
    public let lastMeasurement: Date

    public init(
        roundTripTimeMs: TimeInterval = 0,
        stability: Double = 1.0,
        bytesSent: UInt64 = 0,
        bytesReceived: UInt64 = 0,
        messagesSent: UInt64 = 0,
        messagesReceived: UInt64 = 0,
        connectionDuration: TimeInterval = 0,
        lastMeasurement: Date = Date()
    ) {
        self.roundTripTimeMs = roundTripTimeMs
        self.stability = stability
        self.bytesSent = bytesSent
        self.bytesReceived = bytesReceived
        self.messagesSent = messagesSent
        self.messagesReceived = messagesReceived
        self.connectionDuration = connectionDuration
        self.lastMeasurement = lastMeasurement
    }
}

/// Connection strategy coordinator protocol
public protocol ConnectionStrategyCoordinator {
    /// Current connection state
    var connectionState: ConnectionState { get }

    /// Current connection type (if connected)
    var currentConnectionType: EstablishedConnectionType? { get }

    /// Connection quality metrics
    var qualityMetrics: ConnectionQualityMetrics { get }

    /// Attempt to establish connection using configured strategy
    func connect(config: ConnectionConfig) async -> ConnectionResult

    /// Disconnect from current connection
    func disconnect() async

    /// Send message through established connection
    func sendMessage(_ message: Data) async throws

    /// Receive messages from connection
    var messageStream: AsyncStream<Data> { get }

    /// Monitor connection state changes
    var stateStream: AsyncStream<ConnectionState> { get }

    /// Monitor connection quality changes
    var qualityStream: AsyncStream<ConnectionQualityMetrics> { get }
}

/// Network monitoring for connection strategy decisions
public protocol NetworkMonitor {
    /// Current network path
    var currentPath: NWPath? { get }

    /// Whether network is available
    var isNetworkAvailable: Bool { get }

    /// Whether on WiFi network
    var isOnWiFi: Bool { get }

    /// Whether on cellular network
    var isOnCellular: Bool { get }

    /// Monitor network changes
    var networkChangeStream: AsyncStream<NWPath> { get }

    /// Start monitoring
    func startMonitoring()

    /// Stop monitoring
    func stopMonitoring()
}

/// Desktop discovery service
public protocol DesktopDiscoveryService {
    /// Discover available desktop instances on local network
    func discoverDesktops(config: DesktopDiscoveryConfig) async -> [DiscoveredDesktop]

    /// Test connection to specific desktop
    func testConnection(to desktop: DiscoveredDesktop, timeout: TimeInterval) async -> Bool
}

/// Discovered desktop instance
public struct DiscoveredDesktop {
    /// Desktop identifier
    public let id: String
    /// Desktop name/hostname
    public let name: String
    /// WebSocket URL for connection
    public let websocketURL: URL
    /// Discovery method used
    public let discoveryMethod: DiscoveryMethod
    /// Discovery timestamp
    public let discoveredAt: Date
    /// Signal strength/quality indicator
    public let signalStrength: Double

    public init(
        id: String,
        name: String,
        websocketURL: URL,
        discoveryMethod: DiscoveryMethod,
        discoveredAt: Date = Date(),
        signalStrength: Double = 1.0
    ) {
        self.id = id
        self.name = name
        self.websocketURL = websocketURL
        self.discoveryMethod = discoveryMethod
        self.discoveredAt = discoveredAt
        self.signalStrength = signalStrength
    }
}

/// Desktop discovery method
public enum DiscoveryMethod {
    /// Discovered via Bonjour/mDNS
    case bonjour
    /// Discovered via port scanning
    case portScan
    /// Manually configured
    case manual
    /// Discovered via broadcast
    case broadcast
}

/// Connection event for monitoring and debugging
public enum ConnectionEvent {
    /// Connection attempt started
    case connectionAttemptStarted(method: String, target: String)
    /// Connection attempt succeeded
    case connectionAttemptSucceeded(method: String, target: String, duration: TimeInterval)
    /// Connection attempt failed
    case connectionAttemptFailed(method: String, target: String, error: Error, duration: TimeInterval)
    /// Connection state changed
    case stateChanged(from: ConnectionState, to: ConnectionState)
    /// Message sent
    case messageSent(size: Int)
    /// Message received
    case messageReceived(size: Int)
    /// Quality metrics updated
    case qualityMetricsUpdated(ConnectionQualityMetrics)
    /// Network change detected
    case networkChanged(path: NWPath)
    /// Desktop discovered
    case desktopDiscovered(DiscoveredDesktop)
    /// Failover occurred
    case failoverOccurred(from: EstablishedConnectionType, to: EstablishedConnectionType)
}

/// Connection event listener
public protocol ConnectionEventListener: AnyObject {
    /// Handle connection event
    func handleEvent(_ event: ConnectionEvent)
}

/// Utility extensions for connection strategy
public extension ConnectionStrategy {
    /// Whether this strategy allows direct connections
    var allowsDirectConnection: Bool {
        switch self {
        case .hybrid, .directOnly:
            return true
        case .relayOnly:
            return false
        }
    }

    /// Whether this strategy allows relay connections
    var allowsRelayConnection: Bool {
        switch self {
        case .hybrid, .relayOnly:
            return true
        case .directOnly:
            return false
        }
    }

    /// Validate the connection strategy for server-relay-only mode
    func validateForServerRelayOnly() -> ConnectionStrategyError? {
        switch self {
        case .directOnly:
            return .invalidConfiguration("Direct connections are disabled; server-relay-only enforced")
        case .hybrid, .relayOnly:
            return nil
        }
    }
}

public extension ConnectionState {
    /// Whether the connection is in a connected state
    var isConnected: Bool {
        if case .connected = self {
            return true
        }
        return false
    }

    /// Whether the connection is in a connecting state
    var isConnecting: Bool {
        switch self {
        case .connecting, .handshaking, .authenticating:
            return true
        default:
            return false
        }
    }

    /// Whether the connection is in a failed state
    var isFailed: Bool {
        if case .failed = self {
            return true
        }
        return false
    }

    /// Whether actively trying to connect or in intermediate states (including reconnecting)
    var isConnectingOrHandshaking: Bool {
        switch self {
        case .connecting, .handshaking, .authenticating, .reconnecting:
            return true
        default:
            return false
        }
    }

    /// Whether connection is usable or actively being established
    var isConnectedOrConnecting: Bool {
        return isConnected || isConnectingOrHandshaking
    }
}