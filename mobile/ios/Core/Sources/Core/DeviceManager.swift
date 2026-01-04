import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Manages device identification and persistence for authentication token binding
public final class DeviceManager {
    public static let shared = DeviceManager()

    private init() {}

    public var deviceId: UUID {
        UUID(uuidString: KeychainManager.shared.getOrCreateDeviceId())!
    }

    /// Get or create a persistent device ID for device-binding headers (X-Device-ID, X-Token-Binding)
    public func getOrCreateDeviceID() -> String {
        if let existingDeviceID = try? KeychainManager.shared.retrieveString(for: .deviceIdentifier),
           !existingDeviceID.isEmpty {
            return existingDeviceID
        }

        let deviceID = UUID().uuidString

        do {
            try KeychainManager.shared.store(string: deviceID, for: .deviceIdentifier)
        } catch {
            print("Warning: Failed to store device ID in keychain: \(error)")
        }

        return deviceID
    }

    /// Clear stored device ID (for testing or reset purposes)
    public func clearDeviceID() throws {
        try KeychainManager.shared.delete(for: .deviceIdentifier)
    }

    /// Get device info for debugging and analytics
    public func getDeviceInfo() -> DeviceInfo {
        return DeviceInfo(
            deviceID: getOrCreateDeviceID(),
            platform: "ios",
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
            systemVersion: UIDevice.current.systemVersion,
            deviceModel: UIDevice.current.model,
            identifierForVendor: UIDevice.current.identifierForVendor?.uuidString
        )
    }
}

/// Device information structure
public struct DeviceInfo {
    public let deviceID: String
    public let platform: String
    public let appVersion: String?
    public let systemVersion: String
    public let deviceModel: String
    public let identifierForVendor: String?

    public init(deviceID: String, platform: String, appVersion: String?, systemVersion: String, deviceModel: String, identifierForVendor: String?) {
        self.deviceID = deviceID
        self.platform = platform
        self.appVersion = appVersion
        self.systemVersion = systemVersion
        self.deviceModel = deviceModel
        self.identifierForVendor = identifierForVendor
    }
}