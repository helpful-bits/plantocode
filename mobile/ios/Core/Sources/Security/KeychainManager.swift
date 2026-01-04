import Foundation
import Security
import LocalAuthentication
import CryptoKit

/// Secure keychain manager for storing sensitive data
public class KeychainManager {

    // MARK: - Types

    public enum KeychainError: Error, LocalizedError {
        case itemNotFound
        case duplicateItem
        case invalidItemFormat
        case authenticationFailed
        case biometricNotAvailable
        case biometricNotEnrolled
        case operationCancelled
        case systemError(OSStatus)

        public var errorDescription: String? {
            switch self {
            case .itemNotFound:
                return "Keychain item not found"
            case .duplicateItem:
                return "Keychain item already exists"
            case .invalidItemFormat:
                return "Invalid keychain item format"
            case .authenticationFailed:
                return "Authentication failed"
            case .biometricNotAvailable:
                return "Biometric authentication not available"
            case .biometricNotEnrolled:
                return "Biometric authentication not enrolled"
            case .operationCancelled:
                return "Operation cancelled by user"
            case .systemError(let status):
                return "System error: \(status)"
            }
        }
    }

    public enum KeychainAccessibility {
        case whenUnlocked
        case whenUnlockedThisDeviceOnly
        case afterFirstUnlock
        case afterFirstUnlockThisDeviceOnly

        var cfString: CFString {
            switch self {
            case .whenUnlocked: return kSecAttrAccessibleWhenUnlocked
            case .whenUnlockedThisDeviceOnly: return kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            case .afterFirstUnlock: return kSecAttrAccessibleAfterFirstUnlock
            case .afterFirstUnlockThisDeviceOnly: return kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            }
        }
    }

    public enum BiometricPolicy {
        case none
        case biometryAny
        case biometryCurrentSet
        case devicePasscode
        case biometryOrPasscode

        var laPolicy: LAPolicy? {
            switch self {
            case .none:
                return nil
            case .biometryAny:
                return .deviceOwnerAuthenticationWithBiometrics
            case .biometryCurrentSet:
                return .deviceOwnerAuthenticationWithBiometrics
            case .devicePasscode:
                return .deviceOwnerAuthentication
            case .biometryOrPasscode:
                return .deviceOwnerAuthentication
            }
        }

        var accessControl: SecAccessControl? {
            guard let policy = laPolicy else { return nil }

            var flags: SecAccessControlCreateFlags = []

            switch self {
            case .biometryAny:
                flags = .biometryAny
            case .biometryCurrentSet:
                flags = .biometryCurrentSet
            case .devicePasscode:
                flags = .devicePasscode
            case .biometryOrPasscode:
                flags = [.biometryAny, .or, .devicePasscode]
            default:
                break
            }

            return SecAccessControlCreateWithFlags(
                kCFAllocatorDefault,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                flags,
                nil
            )
        }
    }

    public struct KeychainItem {
        let service: String
        let account: String
        let accessGroup: String?
        let accessibility: KeychainAccessibility
        let biometricPolicy: BiometricPolicy
        let synchronizable: Bool

        public init(
            service: String,
            account: String,
            accessGroup: String? = nil,
            accessibility: KeychainAccessibility = .whenUnlockedThisDeviceOnly,
            biometricPolicy: BiometricPolicy = .none,
            synchronizable: Bool = false
        ) {
            self.service = service
            self.account = account
            self.accessGroup = accessGroup
            self.accessibility = accessibility
            self.biometricPolicy = biometricPolicy
            self.synchronizable = synchronizable
        }
    }

    // MARK: - Properties

    public static let shared = KeychainManager()
    private let defaultService = "com.plantocode.mobile"
    private let deviceIdKey = "core.deviceId"

    private init() {}

    // MARK: - Device ID

    public func getOrCreateDeviceId() -> String {
        let item = KeychainItem(
            service: defaultService,
            account: deviceIdKey,
            accessibility: .afterFirstUnlockThisDeviceOnly,
            synchronizable: false
        )
        if let existing = try? retrieveString(for: item) {
            return existing
        }
        let id = UUID().uuidString
        try? store(string: id, for: item)
        return id
    }

    // MARK: - Public Methods

    /// Store data in keychain
    public func store(
        data: Data,
        for item: KeychainItem,
        updateIfExists: Bool = true
    ) throws {
        var query = baseQuery(for: item)
        query[kSecValueData] = data

        if let accessControl = item.biometricPolicy.accessControl {
            query[kSecAttrAccessControl] = accessControl
        } else {
            query[kSecAttrAccessible] = item.accessibility.cfString
        }

        let status = SecItemAdd(query as CFDictionary, nil)

        if status == errSecDuplicateItem {
            if updateIfExists {
                try update(data: data, for: item)
            } else {
                throw KeychainError.duplicateItem
            }
        } else if status != errSecSuccess {
            throw KeychainError.systemError(status)
        }
    }

    /// Retrieve data from keychain
    public func retrieve(
        for item: KeychainItem,
        prompt: String? = nil
    ) throws -> Data {
        var query = baseQuery(for: item)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne

        // Add authentication context for biometric items
        if item.biometricPolicy != .none {
            let context = LAContext()
            if let prompt = prompt {
                context.localizedFallbackTitle = "Use Passcode"
                query[kSecUseAuthenticationUI] = kSecUseAuthenticationUIAllow
                query[kSecUseAuthenticationContext] = context
                query[kSecUseOperationPrompt] = prompt
            }
        }

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                throw KeychainError.itemNotFound
            } else if status == errSecUserCanceled {
                throw KeychainError.operationCancelled
            } else if status == errSecAuthFailed {
                throw KeychainError.authenticationFailed
            } else {
                throw KeychainError.systemError(status)
            }
        }

        guard let data = result as? Data else {
            throw KeychainError.invalidItemFormat
        }

        return data
    }

    /// Update existing keychain item
    public func update(data: Data, for item: KeychainItem) throws {
        let query = baseQuery(for: item)
        let attributesToUpdate: [CFString: Any] = [kSecValueData: data]

        let status = SecItemUpdate(query as CFDictionary, attributesToUpdate as CFDictionary)

        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                throw KeychainError.itemNotFound
            } else {
                throw KeychainError.systemError(status)
            }
        }
    }

    /// Delete keychain item
    public func delete(for item: KeychainItem) throws {
        let query = baseQuery(for: item)

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.systemError(status)
        }
    }

    /// Check if keychain item exists
    public func exists(for item: KeychainItem) -> Bool {
        var query = baseQuery(for: item)
        query[kSecReturnData] = false
        query[kSecMatchLimit] = kSecMatchLimitOne

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Clear all keychain items for the app
    public func clearAll() throws {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: defaultService
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.systemError(status)
        }
    }

    // MARK: - Convenience Methods

    /// Store string in keychain
    public func store(
        string: String,
        for item: KeychainItem,
        updateIfExists: Bool = true
    ) throws {
        guard let data = string.data(using: .utf8) else {
            throw KeychainError.invalidItemFormat
        }
        try store(data: data, for: item, updateIfExists: updateIfExists)
    }

    /// Retrieve string from keychain
    public func retrieveString(
        for item: KeychainItem,
        prompt: String? = nil
    ) throws -> String {
        let data = try retrieve(for: item, prompt: prompt)
        guard let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.invalidItemFormat
        }
        return string
    }

    /// Store Codable object in keychain
    public func store<T: Codable>(
        object: T,
        for item: KeychainItem,
        updateIfExists: Bool = true
    ) throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(object)
        try store(data: data, for: item, updateIfExists: updateIfExists)
    }

    /// Retrieve Codable object from keychain
    public func retrieve<T: Codable>(
        type: T.Type,
        for item: KeychainItem,
        prompt: String? = nil
    ) throws -> T {
        let data = try retrieve(for: item, prompt: prompt)
        let decoder = JSONDecoder()
        return try decoder.decode(type, from: data)
    }

    // MARK: - Private Methods

    private func baseQuery(for item: KeychainItem) -> [CFString: Any] {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: item.service.isEmpty ? defaultService : item.service,
            kSecAttrAccount: item.account
        ]

        if let accessGroup = item.accessGroup {
            query[kSecAttrAccessGroup] = accessGroup
        }

        query[kSecAttrSynchronizable] = item.synchronizable

        return query
    }
}

// MARK: - Predefined Keychain Items

extension KeychainManager.KeychainItem {

    public static let deviceIdentifier: KeychainManager.KeychainItem = .init(
        service: "com.plantocode.mobile.device",
        account: "device_identifier",
        accessibility: .whenUnlockedThisDeviceOnly,
        synchronizable: false
    )

    public static let appJWT: KeychainManager.KeychainItem = .init(
        service: "com.plantocode.mobile.auth",
        account: "app_jwt"
    )

    public static let appJWTExpiry: KeychainManager.KeychainItem = .init(
        service: "com.plantocode.mobile.auth",
        account: "app_jwt_exp"
    )

    /// Authentication token storage
    public static func authToken(userId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.auth",
            account: "token-\(userId)",
            biometricPolicy: .biometryOrPasscode
        )
    }

    /// Refresh token storage
    public static func refreshToken(userId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.auth",
            account: "refresh-\(userId)",
            biometricPolicy: .biometryOrPasscode
        )
    }

    /// Device credentials
    public static func deviceCredentials(deviceId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.device",
            account: "credentials-\(deviceId)",
            biometricPolicy: .biometryAny
        )
    }

    /// User PIN/Password
    public static func userPin(userId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.user",
            account: "pin-\(userId)",
            biometricPolicy: .biometryCurrentSet
        )
    }

    /// SSH Keys
    public static func sshKey(keyId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.ssh",
            account: "key-\(keyId)",
            biometricPolicy: .biometryOrPasscode
        )
    }

    /// API Keys
    public static func apiKey(serviceId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.api",
            account: "key-\(serviceId)",
            biometricPolicy: .biometryAny
        )
    }

    /// Encryption keys
    public static func encryptionKey(keyId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.crypto",
            account: "key-\(keyId)",
            biometricPolicy: .biometryCurrentSet
        )
    }
}

// MARK: - Biometric Availability Check

extension KeychainManager {

    /// Check biometric availability
    public func checkBiometricAvailability() -> BiometricAvailability {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            if let error = error {
                switch error.code {
                case LAError.biometryNotAvailable.rawValue:
                    return .notAvailable
                case LAError.biometryNotEnrolled.rawValue:
                    return .notEnrolled
                case LAError.biometryLockout.rawValue:
                    return .lockedOut
                default:
                    return .notAvailable
                }
            }
            return .notAvailable
        }

        switch context.biometryType {
        case .faceID:
            return .faceID
        case .touchID:
            return .touchID
        case .none:
            return .notAvailable
        @unknown default:
            return .unknown
        }
    }

    public enum BiometricAvailability {
        case faceID
        case touchID
        case notAvailable
        case notEnrolled
        case lockedOut
        case unknown
    }
}

// MARK: - Secure Data Handling

extension KeychainManager {

    /// Generate and store encryption key
    public func generateAndStoreEncryptionKey(for item: KeychainItem) throws -> SymmetricKey {
        let key = SymmetricKey(size: .bits256)
        let keyData = key.withUnsafeBytes { Data($0) }
        try store(data: keyData, for: item)
        return key
    }

    /// Retrieve encryption key
    public func retrieveEncryptionKey(for item: KeychainItem, prompt: String? = nil) throws -> SymmetricKey {
        let keyData = try retrieve(for: item, prompt: prompt)
        return SymmetricKey(data: keyData)
    }

    /// Encrypt data with keychain-stored key
    public func encryptData(
        _ data: Data,
        with keyItem: KeychainItem,
        prompt: String? = nil
    ) throws -> Data {
        let key = try retrieveEncryptionKey(for: keyItem, prompt: prompt)
        let sealedBox = try AES.GCM.seal(data, using: key)
        return sealedBox.combined!
    }

    /// Decrypt data with keychain-stored key
    public func decryptData(
        _ encryptedData: Data,
        with keyItem: KeychainItem,
        prompt: String? = nil
    ) throws -> Data {
        let key = try retrieveEncryptionKey(for: keyItem, prompt: prompt)
        let sealedBox = try AES.GCM.SealedBox(combined: encryptedData)
        return try AES.GCM.open(sealedBox, using: key)
    }
}

// MARK: - Relay Session Storage
extension KeychainManager.KeychainItem {
    /// Relay session resume token storage per device
    public static func relayResumeToken(deviceId: String) -> KeychainManager.KeychainItem {
        return KeychainManager.KeychainItem(
            service: "com.plantocode.relay",
            account: "resume-\(deviceId)",
            biometricPolicy: .none,
            synchronizable: false
        )
    }
}
