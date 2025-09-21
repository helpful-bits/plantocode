import Foundation
import LocalAuthentication
import CryptoKit

/// Biometric authentication manager for iOS
public class BiometricAuthManager: ObservableObject {

    // MARK: - Types

    public enum AuthenticationResult {
        case success
        case failure(AuthenticationError)
        case cancelled
        case fallback
    }

    public enum AuthenticationError: Error, LocalizedError {
        case notAvailable
        case notEnrolled
        case lockout
        case biometryLockout
        case systemCancel
        case authenticationFailed
        case invalidContext
        case userFallback
        case biometryNotAvailable
        case passcodeNotSet
        case touchIDNotAvailable
        case touchIDNotEnrolled
        case touchIDLockout
        case faceIDNotAvailable
        case faceIDNotEnrolled
        case faceIDLockout
        case unknown(Int)

        public var errorDescription: String? {
            switch self {
            case .notAvailable:
                return "Biometric authentication is not available on this device"
            case .notEnrolled:
                return "No biometric authentication methods are enrolled"
            case .lockout:
                return "Biometric authentication is temporarily locked"
            case .biometryLockout:
                return "Biometric authentication is locked due to too many failed attempts"
            case .systemCancel:
                return "Authentication was cancelled by the system"
            case .authenticationFailed:
                return "Authentication failed"
            case .invalidContext:
                return "Invalid authentication context"
            case .userFallback:
                return "User chose to use fallback authentication"
            case .biometryNotAvailable:
                return "Biometric authentication is not available"
            case .passcodeNotSet:
                return "Device passcode is not set"
            case .touchIDNotAvailable:
                return "Touch ID is not available"
            case .touchIDNotEnrolled:
                return "No fingerprints are enrolled for Touch ID"
            case .touchIDLockout:
                return "Touch ID is locked due to too many failed attempts"
            case .faceIDNotAvailable:
                return "Face ID is not available"
            case .faceIDNotEnrolled:
                return "Face ID is not enrolled"
            case .faceIDLockout:
                return "Face ID is locked due to too many failed attempts"
            case .unknown(let code):
                return "Unknown authentication error: \(code)"
            }
        }
    }

    public enum BiometricType {
        case none
        case touchID
        case faceID
        case unknown

        var displayName: String {
            switch self {
            case .none:
                return "None"
            case .touchID:
                return "Touch ID"
            case .faceID:
                return "Face ID"
            case .unknown:
                return "Biometric Authentication"
            }
        }
    }

    public struct AuthenticationOptions {
        let reason: String
        let fallbackTitle: String?
        let cancelTitle: String?
        let allowDevicePasscode: Bool
        let biometricPolicy: LAPolicy

        public init(
            reason: String,
            fallbackTitle: String? = "Use Passcode",
            cancelTitle: String? = nil,
            allowDevicePasscode: Bool = true,
            biometricPolicy: LAPolicy = .deviceOwnerAuthenticationWithBiometrics
        ) {
            self.reason = reason
            self.fallbackTitle = fallbackTitle
            self.cancelTitle = cancelTitle
            self.allowDevicePasscode = allowDevicePasscode
            self.biometricPolicy = biometricPolicy
        }

        public static let `default` = AuthenticationOptions(
            reason: "Authenticate to access your data"
        )

        public static let strict = AuthenticationOptions(
            reason: "Biometric authentication required",
            fallbackTitle: nil,
            allowDevicePasscode: false,
            biometricPolicy: .deviceOwnerAuthenticationWithBiometrics
        )

        public static let flexible = AuthenticationOptions(
            reason: "Authenticate to continue",
            allowDevicePasscode: true,
            biometricPolicy: .deviceOwnerAuthentication
        )
    }

    // MARK: - Properties

    public static let shared = BiometricAuthManager()

    @Published public private(set) var isAvailable = false
    @Published public private(set) var biometricType: BiometricType = .none
    @Published public private(set) var isEnrolled = false

    private let context = LAContext()

    // MARK: - Initialization

    private init() {
        updateAvailability()
    }

    // MARK: - Public Methods

    /// Update biometric availability status
    public func updateAvailability() {
        let context = LAContext()
        var error: NSError?

        // Check if biometric authentication is available
        isAvailable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)

        if isAvailable {
            // Determine biometric type
            switch context.biometryType {
            case .faceID:
                biometricType = .faceID
            case .touchID:
                biometricType = .touchID
            case .none:
                biometricType = .none
            @unknown default:
                biometricType = .unknown
            }

            isEnrolled = true
        } else {
            biometricType = .none
            isEnrolled = false

            if let error = error {
                switch error.code {
                case LAError.biometryNotEnrolled.rawValue:
                    // Device supports biometrics but none are enrolled
                    let tempContext = LAContext()
                    if tempContext.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) {
                        switch tempContext.biometryType {
                        case .faceID:
                            biometricType = .faceID
                        case .touchID:
                            biometricType = .touchID
                        default:
                            biometricType = .none
                        }
                    }
                    isEnrolled = false
                default:
                    break
                }
            }
        }
    }

    /// Authenticate using biometrics
    public func authenticate(
        with options: AuthenticationOptions = .default
    ) async -> AuthenticationResult {
        return await withCheckedContinuation { continuation in
            authenticate(with: options) { result in
                continuation.resume(returning: result)
            }
        }
    }

    /// Authenticate using biometrics with completion handler
    public func authenticate(
        with options: AuthenticationOptions = .default,
        completion: @escaping (AuthenticationResult) -> Void
    ) {
        // Create a new context for each authentication
        let authContext = LAContext()

        // Configure context
        if let fallbackTitle = options.fallbackTitle {
            authContext.localizedFallbackTitle = fallbackTitle
        }

        if let cancelTitle = options.cancelTitle {
            authContext.localizedCancelTitle = cancelTitle
        }

        // Check availability
        var error: NSError?
        let policy = options.allowDevicePasscode ? LAPolicy.deviceOwnerAuthentication : options.biometricPolicy

        guard authContext.canEvaluatePolicy(policy, error: &error) else {
            let authError = mapLAError(error)
            DispatchQueue.main.async {
                completion(.failure(authError))
            }
            return
        }

        // Perform authentication
        authContext.evaluatePolicy(policy, localizedReason: options.reason) { success, error in
            DispatchQueue.main.async {
                if success {
                    completion(.success)
                } else if let error = error as? LAError {
                    switch error.code {
                    case .userCancel:
                        completion(.cancelled)
                    case .userFallback:
                        completion(.fallback)
                    case .systemCancel:
                        completion(.failure(.systemCancel))
                    case .authenticationFailed:
                        completion(.failure(.authenticationFailed))
                    case .biometryLockout, .touchIDLockout:
                        completion(.failure(.biometryLockout))
                    case .biometryNotAvailable:
                        completion(.failure(.biometryNotAvailable))
                    case .biometryNotEnrolled, .touchIDNotEnrolled:
                        completion(.failure(.notEnrolled))
                    case .passcodeNotSet:
                        completion(.failure(.passcodeNotSet))
                    default:
                        completion(.failure(.unknown(error.code.rawValue)))
                    }
                } else {
                    completion(.failure(.authenticationFailed))
                }
            }
        }
    }

    /// Check if device has passcode set
    public func hasDevicePasscode() -> Bool {
        let context = LAContext()
        return context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// Check if specific biometric type is available
    public func isBiometricTypeAvailable(_ type: BiometricType) -> Bool {
        return biometricType == type && isAvailable
    }

    /// Get user-friendly description of current biometric capabilities
    public func getBiometricCapabilityDescription() -> String {
        if !isAvailable {
            return "Biometric authentication is not available"
        }

        if !isEnrolled {
            return "\(biometricType.displayName) is not set up"
        }

        return "\(biometricType.displayName) is available"
    }

    /// Reset authentication context (useful after app becomes active)
    public func resetContext() {
        updateAvailability()
    }

    // MARK: - Private Methods

    private func mapLAError(_ error: NSError?) -> AuthenticationError {
        guard let error = error else {
            return .unknown(0)
        }

        switch error.code {
        case LAError.biometryNotAvailable.rawValue:
            return .biometryNotAvailable
        case LAError.biometryNotEnrolled.rawValue:
            return .notEnrolled
        case LAError.biometryLockout.rawValue:
            return .biometryLockout
        case LAError.touchIDNotAvailable.rawValue:
            return .touchIDNotAvailable
        case LAError.touchIDNotEnrolled.rawValue:
            return .touchIDNotEnrolled
        case LAError.touchIDLockout.rawValue:
            return .touchIDLockout
        case LAError.passcodeNotSet.rawValue:
            return .passcodeNotSet
        default:
            return .unknown(error.code)
        }
    }
}

// MARK: - Convenience Extensions

extension BiometricAuthManager {

    /// Quick authentication with default options
    public func quickAuth() async -> Bool {
        let result = await authenticate()
        return result == .success
    }

    /// Authentication specifically for sensitive operations
    public func authenticateForSensitiveOperation(
        operation: String
    ) async -> AuthenticationResult {
        let options = AuthenticationOptions(
            reason: "Authenticate to \(operation)",
            fallbackTitle: "Use Passcode",
            allowDevicePasscode: true,
            biometricPolicy: .deviceOwnerAuthentication
        )

        return await authenticate(with: options)
    }

    /// Authentication for app unlock
    public func authenticateForAppUnlock() async -> AuthenticationResult {
        let options = AuthenticationOptions(
            reason: "Unlock Vibe Manager",
            fallbackTitle: "Use Passcode",
            allowDevicePasscode: true,
            biometricPolicy: .deviceOwnerAuthentication
        )

        return await authenticate(with: options)
    }

    /// Authentication for payment/financial operations
    public func authenticateForPayment() async -> AuthenticationResult {
        let options = AuthenticationOptions(
            reason: "Authenticate for payment",
            fallbackTitle: nil,
            allowDevicePasscode: false,
            biometricPolicy: .deviceOwnerAuthenticationWithBiometrics
        )

        return await authenticate(with: options)
    }
}

// MARK: - AuthenticationResult Convenience

extension BiometricAuthManager.AuthenticationResult: Equatable {
    public static func == (
        lhs: BiometricAuthManager.AuthenticationResult,
        rhs: BiometricAuthManager.AuthenticationResult
    ) -> Bool {
        switch (lhs, rhs) {
        case (.success, .success):
            return true
        case (.cancelled, .cancelled):
            return true
        case (.fallback, .fallback):
            return true
        case (.failure(let lhsError), .failure(let rhsError)):
            return lhsError.localizedDescription == rhsError.localizedDescription
        default:
            return false
        }
    }
}

extension BiometricAuthManager.AuthenticationResult {
    public var isSuccess: Bool {
        if case .success = self {
            return true
        }
        return false
    }

    public var isFailure: Bool {
        if case .failure = self {
            return true
        }
        return false
    }

    public var isCancelled: Bool {
        if case .cancelled = self {
            return true
        }
        return false
    }
}

// MARK: - Notification Handling

extension BiometricAuthManager {

    /// Call this when app becomes active to refresh biometric status
    public func handleAppDidBecomeActive() {
        updateAvailability()
    }

    /// Call this when biometric settings might have changed
    public func handleBiometricSettingsChanged() {
        updateAvailability()
    }
}