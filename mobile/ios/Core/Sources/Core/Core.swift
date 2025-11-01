import Foundation

/// Main entry point for the PlanToCode Core library
public final class PlanToCodeCore {

    /// Shared instance for easy access
    public static let shared = PlanToCodeCore()

    /// Data services manager
    public private(set) var dataServices: DataServicesManager?

    /// Current configuration
    public private(set) var configuration: CoreConfiguration?

    private init() {}

    /// Initialize the core with configuration
    @MainActor
    public func initialize(with configuration: CoreConfiguration) {
        self.configuration = configuration
        self.dataServices = DataServicesManager(
            baseURL: configuration.desktopAPIURL,
            deviceId: configuration.deviceId
        )

        setupLogging(level: configuration.logLevel)
    }

    /// Check if core is initialized
    public var isInitialized: Bool {
        return dataServices != nil && configuration != nil
    }

    private func setupLogging(level: LogLevel) {
        // Setup logging framework
    }
}

/// Configuration for the core library
public struct CoreConfiguration {
    /// URL of the desktop app API
    public let desktopAPIURL: URL

    /// Unique device identifier
    public let deviceId: String

    /// Logging level
    public let logLevel: LogLevel

    /// Cache configuration
    public let cacheConfig: CacheConfiguration

    /// Connection timeout settings
    public let timeoutConfig: TimeoutConfiguration

    public init(
        desktopAPIURL: URL,
        deviceId: String,
        logLevel: LogLevel = .info,
        cacheConfig: CacheConfiguration = CacheConfiguration(),
        timeoutConfig: TimeoutConfiguration = TimeoutConfiguration()
    ) {
        self.desktopAPIURL = desktopAPIURL
        self.deviceId = deviceId
        self.logLevel = logLevel
        self.cacheConfig = cacheConfig
        self.timeoutConfig = timeoutConfig
    }
}

/// Logging levels
public enum LogLevel: String, CaseIterable {
    case debug
    case info
    case warning
    case error
    case none
}

/// Cache configuration
public struct CacheConfiguration {
    /// Maximum cache size in bytes
    public let maxSize: Int

    /// Default TTL for cache entries in seconds
    public let defaultTTL: TimeInterval

    /// Whether to persist cache to disk
    public let persistToDisk: Bool

    public init(
        maxSize: Int = 50 * 1024 * 1024, // 50MB
        defaultTTL: TimeInterval = 300, // 5 minutes
        persistToDisk: Bool = false
    ) {
        self.maxSize = maxSize
        self.defaultTTL = defaultTTL
        self.persistToDisk = persistToDisk
    }
}

/// Timeout configuration
public struct TimeoutConfiguration {
    /// Request timeout in seconds
    public let requestTimeout: TimeInterval

    /// Resource timeout in seconds
    public let resourceTimeout: TimeInterval

    /// Connection test interval in seconds
    public let connectionTestInterval: TimeInterval

    public init(
        requestTimeout: TimeInterval = 30,
        resourceTimeout: TimeInterval = 60,
        connectionTestInterval: TimeInterval = 30
    ) {
        self.requestTimeout = requestTimeout
        self.resourceTimeout = resourceTimeout
        self.connectionTestInterval = connectionTestInterval
    }
}

/// Version information
public struct CoreVersion {
    public static let current = "1.0.0"
    public static let apiVersion = "1.0"
    public static let buildNumber = "1"

    public static var versionString: String {
        return "\(current) (build \(buildNumber))"
    }
}