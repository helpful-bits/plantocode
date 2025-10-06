import Foundation
import KeychainAccess
#if canImport(UIKit)
import UIKit
#endif

/// Manages device identification and persistence for authentication token binding
public final class DeviceManager {
    public static let shared = DeviceManager()

    private let keychain = Keychain(service: "com.vibemanager.mobile.device")
    private let deviceIDKey = "device_id"

    private init() {}

    /// Get or create a persistent device ID for device-binding headers (X-Device-ID, X-Token-Binding)
    public func getOrCreateDeviceID() -> String {
        // Try to retrieve existing device ID from keychain
        if let existingDeviceID = try? keychain.get(deviceIDKey),
           !existingDeviceID.isEmpty {
            return existingDeviceID
        }

        // Generate new device ID using UUID
        let deviceID = UUID().uuidString

        // Store in keychain with high security
        do {
            try keychain
                .accessibility(.whenUnlockedThisDeviceOnly) // Most secure option
                .synchronizable(false) // Don't sync to other devices
                .set(deviceID, key: deviceIDKey)
        } catch {
            print("Warning: Failed to store device ID in keychain: \(error)")
            // Fall back to in-memory for this session
        }

        return deviceID
    }

    /// Clear stored device ID (for testing or reset purposes)
    public func clearDeviceID() throws {
        try keychain.remove(deviceIDKey)
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