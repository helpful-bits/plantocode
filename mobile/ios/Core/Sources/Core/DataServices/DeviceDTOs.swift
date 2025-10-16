import Foundation

/*
 Server-to-Client Device DTO Field Mapping:

 Server (snake_case)          →  Client (camelCase)
 ───────────────────────────────────────────────────
 device_id                    →  deviceId
 device_name                  →  deviceName
 device_type                  →  deviceType
 platform                     →  platform
 platform_version             →  platformVersion
 app_version                  →  appVersion
 status                       →  status
 last_heartbeat               →  lastHeartbeat
 cpu_usage                    →  cpuUsage
 memory_usage                 →  memoryUsage
 disk_space_gb                →  diskSpaceGb
 active_jobs                  →  activeJobs
 capabilities                 →  capabilities
 created_at                   →  createdAt
 updated_at                   →  updatedAt

 This mapping ensures consistent JSON decoding from the server's device registry.
 All timestamps are ISO 8601 strings decoded to Swift Date objects.
*/

// MARK: - Server Device DTO

/// Server-side device representation with snake_case fields
/// This struct is decoded directly from the server's JSON response
public struct ServerDeviceInfo: Codable {
    public let deviceId: UUID
    public let deviceName: String
    public let deviceType: String
    public let platform: String
    public let platformVersion: String?
    public let appVersion: String
    public let status: String
    public let lastHeartbeat: Date?
    public let capabilities: AnyCodable?
    public let cpuUsage: Double?
    public let memoryUsage: Double?
    public let diskSpaceGb: Int?
    public let activeJobs: Int?
    public let createdAt: Date
    public let updatedAt: Date?

    public init(
        deviceId: UUID,
        deviceName: String,
        deviceType: String,
        platform: String,
        platformVersion: String?,
        appVersion: String,
        status: String,
        lastHeartbeat: Date?,
        capabilities: AnyCodable?,
        cpuUsage: Double?,
        memoryUsage: Double?,
        diskSpaceGb: Int?,
        activeJobs: Int?,
        createdAt: Date,
        updatedAt: Date?
    ) {
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.deviceType = deviceType
        self.platform = platform
        self.platformVersion = platformVersion
        self.appVersion = appVersion
        self.status = status
        self.lastHeartbeat = lastHeartbeat
        self.capabilities = capabilities
        self.cpuUsage = cpuUsage
        self.memoryUsage = memoryUsage
        self.diskSpaceGb = diskSpaceGb
        self.activeJobs = activeJobs
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - DTO to Domain Model Mapper

extension RegisteredDevice {
    /// Map from server DTO to domain model
    public static func from(_ s: ServerDeviceInfo) -> RegisteredDevice {
        // Map status from string, defaulting to offline if invalid
        let deviceStatus = DeviceStatus(rawValue: s.status) ?? .offline

        // Parse capabilities from AnyCodable
        let deviceCapabilities = s.capabilities?.value as? [String: Any]
        let capabilities = DeviceCapabilities(
            supportsVoice: deviceCapabilities?["supports_voice"] as? Bool ?? false,
            supportsMerge: deviceCapabilities?["supports_merge"] as? Bool ?? false,
            supportsFileSearch: deviceCapabilities?["supports_file_search"] as? Bool ?? false,
            supportsResearch: deviceCapabilities?["supports_research"] as? Bool ?? false,
            supportsTasks: deviceCapabilities?["supports_tasks"] as? Bool ?? false,
            supportsPlans: deviceCapabilities?["supports_plans"] as? Bool ?? false,
            maxConcurrentJobs: deviceCapabilities?["max_concurrent_jobs"] as? UInt32 ?? 5,
            priorityLevel: deviceCapabilities?["priority_level"] as? UInt8 ?? 5,
            activeProjectDirectory: deviceCapabilities?["activeProjectDirectory"] as? String
        )

        // Create health metrics if available
        let health: DeviceHealth?
        if let cpuUsage = s.cpuUsage,
           let memoryUsage = s.memoryUsage,
           let diskSpaceGb = s.diskSpaceGb,
           let activeJobs = s.activeJobs {
            health = DeviceHealth(
                deviceId: s.deviceId,
                cpuUsage: cpuUsage,
                memoryUsage: memoryUsage,
                diskSpaceGb: diskSpaceGb,
                activeJobs: activeJobs,
                timestamp: s.lastHeartbeat ?? Date()
            )
        } else {
            health = nil
        }

        return RegisteredDevice(
            id: s.deviceId,
            deviceId: s.deviceId,
            deviceName: s.deviceName,
            deviceType: s.deviceType,
            platform: s.platform,
            appVersion: s.appVersion,
            status: deviceStatus,
            lastHeartbeat: s.lastHeartbeat,
            capabilities: capabilities,
            health: health,
            createdAt: s.createdAt
        )
    }
}
