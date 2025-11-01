import Foundation

// MARK: - Device Discovery Models

/// Represents a registered desktop device discoverable from mobile
public struct RegisteredDevice: Codable, Identifiable, Equatable {
    public let id: UUID
    public let deviceId: UUID
    public let deviceName: String
    public let deviceType: String
    public let platform: String
    public let appVersion: String
    public let status: DeviceStatus
    public let isConnected: Bool
    public let lastHeartbeat: Date?
    public let capabilities: DeviceCapabilities
    public let health: DeviceHealth?
    public let createdAt: Date

    public init(
        id: UUID,
        deviceId: UUID,
        deviceName: String,
        deviceType: String,
        platform: String,
        appVersion: String,
        status: DeviceStatus,
        isConnected: Bool,
        lastHeartbeat: Date?,
        capabilities: DeviceCapabilities,
        health: DeviceHealth?,
        createdAt: Date
    ) {
        self.id = id
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.deviceType = deviceType
        self.platform = platform
        self.appVersion = appVersion
        self.status = status
        self.isConnected = isConnected
        self.lastHeartbeat = lastHeartbeat
        self.capabilities = capabilities
        self.health = health
        self.createdAt = createdAt
    }

}

// DeviceStatus is defined in HealthTypes.swift

// DeviceCapabilities is defined in HealthTypes.swift

/// Device health metrics
public struct DeviceHealth: Codable, Equatable {
    public let deviceId: UUID
    public let cpuUsage: Double
    public let memoryUsage: Double
    public let diskSpaceGb: Int
    public let activeJobs: Int
    public let timestamp: Date

    public init(
        deviceId: UUID,
        cpuUsage: Double,
        memoryUsage: Double,
        diskSpaceGb: Int,
        activeJobs: Int,
        timestamp: Date
    ) {
        self.deviceId = deviceId
        self.cpuUsage = cpuUsage
        self.memoryUsage = memoryUsage
        self.diskSpaceGb = diskSpaceGb
        self.activeJobs = activeJobs
        self.timestamp = timestamp
    }

    /// Overall health score from 0-100
    public var healthScore: Double {
        let cpuScore = max(0, 100 - cpuUsage)
        let memoryScore = max(0, 100 - memoryUsage)
        let diskScore = min(100, Double(diskSpaceGb) * 10) // 10GB = 100 points

        return (cpuScore * 0.4 + memoryScore * 0.4 + diskScore * 0.2)
    }

    /// Health status for display
    public var healthStatus: HealthStatus {
        let score = healthScore
        if score >= 80 { return .excellent }
        if score >= 60 { return .good }
        if score >= 40 { return .fair }
        return .poor
    }
}

// HealthStatus is defined in HealthTypes.swift

// MARK: - API Response Models

/// Response from the devices list API
public struct DeviceListResponse: Codable {
    public let devices: [RegisteredDevice]

    public init(devices: [RegisteredDevice]) {
        self.devices = devices
    }
}

/// Connection descriptor for establishing device connections
public struct ConnectionDescriptor: Codable {
    public let deviceId: UUID
    public let localEndpoints: [String]
    public let relayEndpoint: String?
    public let publicKey: String
    public let createdAt: Date
    public let expiresAt: Date

    public init(
        deviceId: UUID,
        localEndpoints: [String],
        relayEndpoint: String?,
        publicKey: String,
        createdAt: Date,
        expiresAt: Date
    ) {
        self.deviceId = deviceId
        self.localEndpoints = localEndpoints
        self.relayEndpoint = relayEndpoint
        self.publicKey = publicKey
        self.createdAt = createdAt
        self.expiresAt = expiresAt
    }

    /// Check if the connection descriptor is still valid
    public var isValid: Bool {
        return Date() < expiresAt
    }
}

// MARK: - Pairing Models

/// Request to create a pairing with a desktop device
public struct CreatePairingRequest: Codable {
    public let targetDeviceId: UUID

    public init(targetDeviceId: UUID) {
        self.targetDeviceId = targetDeviceId
    }
}

/// Request to complete pairing with a verification code
public struct CompletePairingRequest: Codable {
    public let pairingCode: String

    public init(pairingCode: String) {
        self.pairingCode = pairingCode
    }
}

/// Pairing response
public struct PairingResponse: Codable {
    public let success: Bool
    public let message: String
    public let device: RegisteredDevice?

    public init(success: Bool, message: String, device: RegisteredDevice?) {
        self.success = success
        self.message = message
        self.device = device
    }
}

/// Pairing request details
public struct DevicePairingRequest: Codable {
    public let id: UUID
    public let requestingDeviceId: String
    public let targetDeviceId: UUID
    public let userId: UUID
    public let status: String
    public let pairingCode: String?
    public let expiresAt: Date
    public let createdAt: Date

    public init(
        id: UUID,
        requestingDeviceId: String,
        targetDeviceId: UUID,
        userId: UUID,
        status: String,
        pairingCode: String?,
        expiresAt: Date,
        createdAt: Date
    ) {
        self.id = id
        self.requestingDeviceId = requestingDeviceId
        self.targetDeviceId = targetDeviceId
        self.userId = userId
        self.status = status
        self.pairingCode = pairingCode
        self.expiresAt = expiresAt
        self.createdAt = createdAt
    }
}