import Foundation

public struct ErrorResponseDTO: Codable {
    public let code: Int
    public let message: String
    public let errorType: String
    public let errorDetails: AnyCodable?

    public init(code: Int, message: String, errorType: String, errorDetails: AnyCodable? = nil) {
        self.code = code
        self.message = message
        self.errorType = errorType
        self.errorDetails = errorDetails
    }
}

public struct UserInfoResponse: Codable {
    public let id: String
    public let email: String
    public let name: String?
    public let role: String

    public init(id: String, email: String, name: String?, role: String) {
        self.id = id
        self.email = email
        self.name = name
        self.role = role
    }
}

public struct DeviceDTO: Codable {
    public let deviceId: UUID
    public let deviceName: String
    public let deviceType: String
    public let platform: String
    public let platformVersion: String?
    public let appVersion: String
    public let status: String
    public let isConnected: Bool
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
        isConnected: Bool,
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
        self.isConnected = isConnected
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

public enum ConsentDocumentType: String, Codable {
    case terms
    case privacy
}

public enum ConsentRegion: String, Codable {
    case eu
    case us
}

public struct LegalDocument: Codable {
    public let id: UUID
    public let docType: ConsentDocumentType
    public let region: ConsentRegion
    public let version: String
    public let effectiveAt: String
    public let url: String
    public let contentHash: String?
    public let materialChange: Bool
    public let createdAt: Date
    public let updatedAt: Date

    public init(
        id: UUID,
        docType: ConsentDocumentType,
        region: ConsentRegion,
        version: String,
        effectiveAt: String,
        url: String,
        contentHash: String?,
        materialChange: Bool,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.docType = docType
        self.region = region
        self.version = version
        self.effectiveAt = effectiveAt
        self.url = url
        self.contentHash = contentHash
        self.materialChange = materialChange
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct ConsentStatusItem: Codable {
    public let docType: ConsentDocumentType
    public let region: ConsentRegion
    public let currentVersion: String
    public let acceptedVersion: String?
    public let acceptedAt: Date?
    public let requiresReconsent: Bool
    public let effectiveAt: String
    public let url: String

    public init(
        docType: ConsentDocumentType,
        region: ConsentRegion,
        currentVersion: String,
        acceptedVersion: String?,
        acceptedAt: Date?,
        requiresReconsent: Bool,
        effectiveAt: String,
        url: String
    ) {
        self.docType = docType
        self.region = region
        self.currentVersion = currentVersion
        self.acceptedVersion = acceptedVersion
        self.acceptedAt = acceptedAt
        self.requiresReconsent = requiresReconsent
        self.effectiveAt = effectiveAt
        self.url = url
    }
}

public struct ConsentStatusResponse: Codable {
    public let userId: UUID
    public let region: ConsentRegion
    public let items: [ConsentStatusItem]
    public let allConsented: Bool

    public init(userId: UUID, region: ConsentRegion, items: [ConsentStatusItem], allConsented: Bool) {
        self.userId = userId
        self.region = region
        self.items = items
        self.allConsented = allConsented
    }
}

public struct DeleteAccountResponse: Codable {
    public let status: String

    public init(status: String) {
        self.status = status
    }
}

extension RegisteredDevice {
    public static func from(_ dto: DeviceDTO) -> RegisteredDevice {
        let deviceStatus = DeviceStatus(rawValue: dto.status) ?? .offline

        let deviceCapabilities = dto.capabilities?.value as? [String: Any]
        let capabilities = DeviceCapabilities(
            supportsVoice: deviceCapabilities?["supportsVoice"] as? Bool ?? false,
            supportsMerge: deviceCapabilities?["supportsMerge"] as? Bool ?? false,
            supportsFileSearch: deviceCapabilities?["supportsFileSearch"] as? Bool ?? false,
            supportsResearch: deviceCapabilities?["supportsResearch"] as? Bool ?? false,
            supportsTasks: deviceCapabilities?["supportsTasks"] as? Bool ?? false,
            supportsPlans: deviceCapabilities?["supportsPlans"] as? Bool ?? false,
            maxConcurrentJobs: deviceCapabilities?["maxConcurrentJobs"] as? UInt32 ?? 5,
            priorityLevel: deviceCapabilities?["priorityLevel"] as? UInt8 ?? 5,
            activeProjectDirectory: deviceCapabilities?["activeProjectDirectory"] as? String
        )

        let health: DeviceHealth?
        if let cpuUsage = dto.cpuUsage,
           let memoryUsage = dto.memoryUsage,
           let diskSpaceGb = dto.diskSpaceGb,
           let activeJobs = dto.activeJobs {
            health = DeviceHealth(
                deviceId: dto.deviceId,
                cpuUsage: cpuUsage,
                memoryUsage: memoryUsage,
                diskSpaceGb: diskSpaceGb,
                activeJobs: activeJobs,
                timestamp: dto.lastHeartbeat ?? Date()
            )
        } else {
            health = nil
        }

        return RegisteredDevice(
            id: dto.deviceId,
            deviceId: dto.deviceId,
            deviceName: dto.deviceName,
            deviceType: dto.deviceType,
            platform: dto.platform,
            appVersion: dto.appVersion,
            status: deviceStatus,
            isConnected: dto.isConnected,
            lastHeartbeat: dto.lastHeartbeat,
            capabilities: capabilities,
            health: health,
            createdAt: dto.createdAt
        )
    }
}

@available(*, deprecated, renamed: "DeviceDTO")
public typealias ServerDeviceInfo = DeviceDTO
