import Foundation

// MARK: - Health Monitoring Protocol Types
// Shared health monitoring types that mirror the Rust implementation

/// Protocol version for health monitoring
public let healthProtocolVersion = "1.0.0"

// MARK: - Health Metrics

/// Core health metrics reported by all devices
public struct HealthMetrics: Codable, Equatable {
    /// CPU usage percentage (0-100)
    public let cpuUsage: Double
    /// Memory usage percentage (0-100)
    public let memoryUsage: Double
    /// Available disk space in GB
    public let diskSpaceGb: UInt64
    /// Number of currently active jobs/tasks
    public let activeJobs: UInt32
    /// Timestamp when metrics were collected
    public let timestamp: Date

    public init(
        cpuUsage: Double,
        memoryUsage: Double,
        diskSpaceGb: UInt64,
        activeJobs: UInt32,
        timestamp: Date = Date()
    ) {
        self.cpuUsage = cpuUsage
        self.memoryUsage = memoryUsage
        self.diskSpaceGb = diskSpaceGb
        self.activeJobs = activeJobs
        self.timestamp = timestamp
    }

    /// Calculate overall health score (0-100)
    public var healthScore: Double {
        let cpuScore = max(0, 100 - cpuUsage)
        let memoryScore = max(0, 100 - memoryUsage)
        let diskScore = min(100, Double(diskSpaceGb) * 10.0)

        // Weighted average: CPU 40%, Memory 40%, Disk 20%
        return min(100, (cpuScore * 0.4) + (memoryScore * 0.4) + (diskScore * 0.2))
    }

    /// Get health status level based on score
    public var healthStatus: HealthStatus {
        switch healthScore {
        case 80...100:
            return .excellent
        case 60..<80:
            return .good
        case 40..<60:
            return .fair
        default:
            return .poor
        }
    }

    /// Check if the device is under high load
    public var isHighLoad: Bool {
        return cpuUsage > 80.0 || memoryUsage > 90.0
    }

    /// Check if disk space is critically low
    public var isLowDiskSpace: Bool {
        return diskSpaceGb < 5 // Less than 5GB
    }
}

/// Health status levels
public enum HealthStatus: String, Codable, CaseIterable {
    case excellent
    case good
    case fair
    case poor

    public var displayName: String {
        switch self {
        case .excellent: return "Excellent"
        case .good: return "Good"
        case .fair: return "Fair"
        case .poor: return "Poor"
        }
    }

    public var colorCode: String {
        switch self {
        case .excellent: return "#22C55E" // Green
        case .good: return "#84CC16"      // Light Green
        case .fair: return "#F59E0B"      // Orange
        case .poor: return "#EF4444"      // Red
        }
    }

    public var sortOrder: Int {
        switch self {
        case .excellent: return 0
        case .good: return 1
        case .fair: return 2
        case .poor: return 3
        }
    }
}

// MARK: - Device Status

/// Device operational status
public enum DeviceStatus: String, Codable, CaseIterable {
    case online
    case away
    case offline

    public var displayName: String {
        switch self {
        case .online: return "Online"
        case .away: return "Away"
        case .offline: return "Offline"
        }
    }

    public var isAvailable: Bool {
        return self == .online
    }

    public var isResponsive: Bool {
        return self == .online || self == .away
    }

    public var statusColor: String {
        switch self {
        case .online: return "#22C55E"  // Green
        case .away: return "#F59E0B"    // Orange
        case .offline: return "#6B7280" // Gray
        }
    }
}

extension DeviceStatus {
    /// Derive status from health metrics
    public init(from health: HealthMetrics) {
        if health.isHighLoad {
            self = .away
        } else {
            self = .online
        }
    }
}

// MARK: - Device Capabilities

/// Device capabilities and supported features
public struct DeviceCapabilities: Codable, Equatable {
    public let supportsVoice: Bool
    public let supportsMerge: Bool
    public let supportsFileSearch: Bool
    public let supportsResearch: Bool
    public let supportsTasks: Bool
    public let supportsPlans: Bool
    public let maxConcurrentJobs: UInt32
    public let priorityLevel: UInt8 // 1-10, higher is better

    public init(
        supportsVoice: Bool = true,
        supportsMerge: Bool = true,
        supportsFileSearch: Bool = true,
        supportsResearch: Bool = true,
        supportsTasks: Bool = true,
        supportsPlans: Bool = true,
        maxConcurrentJobs: UInt32 = 5,
        priorityLevel: UInt8 = 5
    ) {
        self.supportsVoice = supportsVoice
        self.supportsMerge = supportsMerge
        self.supportsFileSearch = supportsFileSearch
        self.supportsResearch = supportsResearch
        self.supportsTasks = supportsTasks
        self.supportsPlans = supportsPlans
        self.maxConcurrentJobs = maxConcurrentJobs
        self.priorityLevel = priorityLevel
    }

    /// Get list of supported feature names
    public var supportedFeatures: [String] {
        var features: [String] = []
        if supportsVoice { features.append("Voice") }
        if supportsMerge { features.append("Merge") }
        if supportsFileSearch { features.append("File Search") }
        if supportsResearch { features.append("Research") }
        if supportsTasks { features.append("Tasks") }
        if supportsPlans { features.append("Plans") }
        return features
    }

    /// Calculate capability match percentage for required features
    public func capabilityMatch(for requiredFeatures: [String]) -> Double {
        guard !requiredFeatures.isEmpty else { return 100.0 }

        let supportedCount = requiredFeatures.filter { supportsFeature($0) }.count
        return (Double(supportedCount) / Double(requiredFeatures.count)) * 100.0
    }

    /// Check if a specific feature is supported
    public func supportsFeature(_ feature: String) -> Bool {
        switch feature.lowercased() {
        case "voice":
            return supportsVoice
        case "merge":
            return supportsMerge
        case "file_search", "file-search", "filesearch":
            return supportsFileSearch
        case "research":
            return supportsResearch
        case "tasks":
            return supportsTasks
        case "plans":
            return supportsPlans
        default:
            return false
        }
    }

    /// Get current load factor (0-100)
    public func loadFactor(activeJobs: UInt32) -> Double {
        guard maxConcurrentJobs > 0 else { return 100.0 }

        let loadPercentage = (Double(activeJobs) / Double(maxConcurrentJobs)) * 100.0
        return min(100.0, loadPercentage)
    }
}

// MARK: - Connectivity Information

/// Connectivity information for device communication
public struct ConnectivityInfo: Codable, Equatable {
    public let localIPs: [String]
    public let availablePorts: [UInt16]
    public let relayEligible: Bool
    public let publicIP: String?

    public init(
        localIPs: [String],
        availablePorts: [UInt16],
        relayEligible: Bool = true,
        publicIP: String? = nil
    ) {
        self.localIPs = localIPs
        self.availablePorts = availablePorts
        self.relayEligible = relayEligible
        self.publicIP = publicIP
    }

    /// Get all possible local endpoints
    public var localEndpoints: [String] {
        return localIPs.flatMap { ip in
            availablePorts.map { port in
                "\(ip):\(port)"
            }
        }
    }

    /// Check if device is on local network
    public func isLocalNetwork(targetIP: String) -> Bool {
        let isLocalRange = { (ip: String) -> Bool in
            return ip.hasPrefix("192.168.") || ip.hasPrefix("10.") || ip.hasPrefix("172.")
        }

        let deviceOnLocal = localIPs.contains(where: isLocalRange)
        let targetOnLocal = isLocalRange(targetIP)

        return deviceOnLocal && targetOnLocal
    }
}

// MARK: - Heartbeat Payload

/// Complete heartbeat payload sent by devices
public struct HeartbeatPayload: Codable {
    public let protocolVersion: String
    public let deviceId: UUID
    public let status: DeviceStatus
    public let health: HealthMetrics
    public let capabilities: DeviceCapabilities
    public let connectivity: ConnectivityInfo
    public let extendedMetrics: [String: AnyCodable]?

    public init(
        deviceId: UUID,
        health: HealthMetrics,
        capabilities: DeviceCapabilities,
        connectivity: ConnectivityInfo,
        extendedMetrics: [String: AnyCodable]? = nil
    ) {
        self.protocolVersion = healthProtocolVersion
        self.deviceId = deviceId
        self.status = DeviceStatus(from: health)
        self.health = health
        self.capabilities = capabilities
        self.connectivity = connectivity
        self.extendedMetrics = extendedMetrics
    }

    /// Validate heartbeat payload
    public func validate() throws {
        guard !deviceId.uuidString.isEmpty else {
            throw ValidationError.invalidDeviceId
        }

        guard health.cpuUsage >= 0 && health.cpuUsage <= 100 else {
            throw ValidationError.invalidCPUUsage
        }

        guard health.memoryUsage >= 0 && health.memoryUsage <= 100 else {
            throw ValidationError.invalidMemoryUsage
        }

        guard health.activeJobs <= capabilities.maxConcurrentJobs else {
            throw ValidationError.tooManyActiveJobs
        }

        guard !connectivity.localIPs.isEmpty else {
            throw ValidationError.noLocalIPs
        }
    }
}

// MARK: - Device Selection

/// Device selection criteria for mobile clients
public struct DeviceSelectionCriteria {
    public let requiredFeatures: [String]
    public let minHealthScore: Double
    public let preferLocalNetwork: Bool
    public let maxActiveJobs: UInt32?

    public init(
        requiredFeatures: [String] = [],
        minHealthScore: Double = 40.0, // Fair or better
        preferLocalNetwork: Bool = true,
        maxActiveJobs: UInt32? = nil
    ) {
        self.requiredFeatures = requiredFeatures
        self.minHealthScore = minHealthScore
        self.preferLocalNetwork = preferLocalNetwork
        self.maxActiveJobs = maxActiveJobs
    }
}

/// Device selection result with priority score
public struct DeviceSelection {
    public let deviceId: UUID
    public let priorityScore: Double
    public let healthScore: Double
    public let capabilityMatch: Double
    public let networkProximity: Double
    public let loadFactor: Double

    public init(
        deviceId: UUID,
        priorityScore: Double,
        healthScore: Double,
        capabilityMatch: Double,
        networkProximity: Double,
        loadFactor: Double
    ) {
        self.deviceId = deviceId
        self.priorityScore = priorityScore
        self.healthScore = healthScore
        self.capabilityMatch = capabilityMatch
        self.networkProximity = networkProximity
        self.loadFactor = loadFactor
    }

    /// Calculate priority score for device selection
    public static func calculatePriority(
        health: HealthMetrics,
        capabilities: DeviceCapabilities,
        connectivity: ConnectivityInfo,
        criteria: DeviceSelectionCriteria,
        clientIP: String? = nil
    ) -> Double {
        let healthScore = health.healthScore

        // Skip devices that don't meet minimum health requirements
        guard healthScore >= criteria.minHealthScore else { return 0.0 }

        let capabilityMatch = capabilities.capabilityMatch(for: criteria.requiredFeatures)

        // Skip devices that don't support required features
        guard capabilityMatch >= 100.0 || criteria.requiredFeatures.isEmpty else { return 0.0 }

        let networkProximity: Double
        if let clientIP = clientIP {
            networkProximity = connectivity.isLocalNetwork(targetIP: clientIP) ? 100.0 : 50.0
        } else {
            networkProximity = 75.0 // Neutral if unknown
        }

        let loadFactor = 100.0 - capabilities.loadFactor(activeJobs: health.activeJobs)

        // Skip overloaded devices if criteria specified
        if let maxJobs = criteria.maxActiveJobs, health.activeJobs > maxJobs {
            return 0.0
        }

        // Calculate weighted priority score
        return (healthScore * 0.4) + (capabilityMatch * 0.3) + (networkProximity * 0.2) + (loadFactor * 0.1)
    }
}

// MARK: - Validation Errors

public enum ValidationError: LocalizedError {
    case invalidDeviceId
    case invalidCPUUsage
    case invalidMemoryUsage
    case tooManyActiveJobs
    case noLocalIPs

    public var errorDescription: String? {
        switch self {
        case .invalidDeviceId:
            return "Device ID cannot be empty"
        case .invalidCPUUsage:
            return "CPU usage must be between 0 and 100"
        case .invalidMemoryUsage:
            return "Memory usage must be between 0 and 100"
        case .tooManyActiveJobs:
            return "Active jobs cannot exceed maximum concurrent jobs"
        case .noLocalIPs:
            return "At least one local IP address must be provided"
        }
    }
}

// MARK: - Helper Types

