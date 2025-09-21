import Foundation
import UIKit
import LocalAuthentication
import CryptoKit

/// Main security manager coordinating all security features
public class SecurityManager: ObservableObject {

    // MARK: - Types

    public enum SecurityLevel {
        case low
        case medium
        case high
        case maximum

        var description: String {
            switch self {
            case .low:
                return "Basic security with optional biometrics"
            case .medium:
                return "Standard security with biometric protection"
            case .high:
                return "Enhanced security with strict biometric requirements"
            case .maximum:
                return "Maximum security with all protections enabled"
            }
        }

        var requiresBiometrics: Bool {
            switch self {
            case .low:
                return false
            case .medium, .high, .maximum:
                return true
            }
        }

        var requiresAppLock: Bool {
            switch self {
            case .low, .medium:
                return false
            case .high, .maximum:
                return true
            }
        }

        var backgroundTimeLimit: TimeInterval {
            switch self {
            case .low:
                return 300 // 5 minutes
            case .medium:
                return 120 // 2 minutes
            case .high:
                return 60  // 1 minute
            case .maximum:
                return 30  // 30 seconds
            }
        }
    }

    public struct SecurityConfiguration {
        let securityLevel: SecurityLevel
        let enableJailbreakDetection: Bool
        let enableDebuggerDetection: Bool
        let enableScreenshotProtection: Bool
        let enableScreenRecordingDetection: Bool
        let enableDataLossPreventionOnBackground: Bool
        let enableCertificatePinning: Bool
        let automaticLockTimeout: TimeInterval

        public init(
            securityLevel: SecurityLevel = .medium,
            enableJailbreakDetection: Bool = true,
            enableDebuggerDetection: Bool = true,
            enableScreenshotProtection: Bool = true,
            enableScreenRecordingDetection: Bool = true,
            enableDataLossPreventionOnBackground: Bool = true,
            enableCertificatePinning: Bool = true,
            automaticLockTimeout: TimeInterval = 300
        ) {
            self.securityLevel = securityLevel
            self.enableJailbreakDetection = enableJailbreakDetection
            self.enableDebuggerDetection = enableDebuggerDetection
            self.enableScreenshotProtection = enableScreenshotProtection
            self.enableScreenRecordingDetection = enableScreenRecordingDetection
            self.enableDataLossPreventionOnBackground = enableDataLossPreventionOnBackground
            self.enableCertificatePinning = enableCertificatePinning
            self.automaticLockTimeout = automaticLockTimeout
        }

        public static let `default` = SecurityConfiguration()

        public static let development = SecurityConfiguration(
            securityLevel: .low,
            enableJailbreakDetection: false,
            enableDebuggerDetection: false,
            enableScreenshotProtection: false,
            enableScreenRecordingDetection: false,
            enableDataLossPreventionOnBackground: false,
            enableCertificatePinning: false
        )

        public static let production = SecurityConfiguration(
            securityLevel: .high,
            enableJailbreakDetection: true,
            enableDebuggerDetection: true,
            enableScreenshotProtection: true,
            enableScreenRecordingDetection: true,
            enableDataLossPreventionOnBackground: true,
            enableCertificatePinning: true,
            automaticLockTimeout: 180
        )
    }

    // MARK: - Properties

    public static let shared = SecurityManager()

    @Published public private(set) var isSecure = false
    @Published public private(set) var securityThreats: [SecurityThreat] = []
    @Published public private(set) var isLocked = false

    private var configuration: SecurityConfiguration
    private let keychainManager = KeychainManager.shared
    private let biometricManager = BiometricAuthManager.shared
    private let jailbreakDetector = JailbreakDetector()
    private let debuggerDetector = DebuggerDetector()

    private var backgroundTime: Date?
    private var lockTimer: Timer?

    // MARK: - Initialization

    private init() {
        #if DEBUG
        self.configuration = .development
        #else
        self.configuration = .production
        #endif

        setupNotifications()
        performSecurityCheck()
    }

    // MARK: - Public Methods

    /// Configure security settings
    public func configure(with configuration: SecurityConfiguration) {
        self.configuration = configuration
        performSecurityCheck()
    }

    /// Perform comprehensive security check
    public func performSecurityCheck() {
        var threats: [SecurityThreat] = []

        // Jailbreak detection
        if configuration.enableJailbreakDetection && jailbreakDetector.isJailbroken() {
            threats.append(.jailbroken)
        }

        // Debugger detection
        if configuration.enableDebuggerDetection && debuggerDetector.isDebuggerAttached() {
            threats.append(.debuggerAttached)
        }

        // Screen recording detection
        if configuration.enableScreenRecordingDetection && isScreenBeingRecorded() {
            threats.append(.screenRecording)
        }

        // Update security status
        DispatchQueue.main.async {
            self.securityThreats = threats
            self.isSecure = threats.isEmpty
        }
    }

    /// Authenticate user
    public func authenticate(reason: String? = nil) async -> Bool {
        let authReason = reason ?? "Authenticate to access Vibe Manager"

        if configuration.securityLevel.requiresBiometrics && biometricManager.isAvailable {
            let options = BiometricAuthManager.AuthenticationOptions(
                reason: authReason,
                allowDevicePasscode: configuration.securityLevel != .maximum
            )

            let result = await biometricManager.authenticate(with: options)
            let success = result.isSuccess

            if success {
                DispatchQueue.main.async {
                    self.isLocked = false
                }
            }

            return success
        } else {
            // Fallback authentication or no biometrics required
            DispatchQueue.main.async {
                self.isLocked = false
            }
            return true
        }
    }

    /// Lock the application
    public func lockApplication() {
        DispatchQueue.main.async {
            self.isLocked = true
        }

        // Clear sensitive data from memory
        clearSensitiveData()

        // Stop any ongoing operations
        stopSensitiveOperations()
    }

    /// Unlock the application
    public func unlockApplication() async -> Bool {
        return await authenticate(reason: "Unlock Vibe Manager")
    }

    /// Handle app going to background
    public func handleAppDidEnterBackground() {
        backgroundTime = Date()

        if configuration.enableDataLossPreventionOnBackground {
            // Hide sensitive content
            hideSensitiveContent()
        }

        // Start lock timer
        startLockTimer()
    }

    /// Handle app coming to foreground
    public func handleAppWillEnterForeground() {
        stopLockTimer()

        // Check if app should be locked
        if shouldLockAfterBackground() {
            lockApplication()
        }

        // Perform security check
        performSecurityCheck()

        // Show sensitive content if not locked
        if !isLocked {
            showSensitiveContent()
        }
    }

    /// Check if device meets security requirements
    public func checkSecurityRequirements() -> [SecurityRequirement] {
        var requirements: [SecurityRequirement] = []

        // Biometric requirement
        if configuration.securityLevel.requiresBiometrics {
            if !biometricManager.isAvailable {
                requirements.append(.biometricNotAvailable)
            } else if !biometricManager.isEnrolled {
                requirements.append(.biometricNotEnrolled)
            }
        }

        // Passcode requirement
        if !biometricManager.hasDevicePasscode() {
            requirements.append(.passcodeNotSet)
        }

        return requirements
    }

    /// Wipe all sensitive data
    public func wipeSensitiveData() {
        do {
            try keychainManager.clearAll()
            clearSensitiveData()
            // Additional cleanup...
        } catch {
            print("Failed to wipe sensitive data: \(error)")
        }
    }

    // MARK: - Private Methods

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(userDidTakeScreenshot),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )

        if #available(iOS 11.0, *) {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(capturedDidChange),
                name: UIScreen.capturedDidChangeNotification,
                object: nil
            )
        }
    }

    private func shouldLockAfterBackground() -> Bool {
        guard let backgroundTime = backgroundTime else { return false }

        let timeInBackground = Date().timeIntervalSince(backgroundTime)
        return timeInBackground > configuration.securityLevel.backgroundTimeLimit
    }

    private func startLockTimer() {
        stopLockTimer()

        lockTimer = Timer.scheduledTimer(withTimeInterval: configuration.automaticLockTimeout, repeats: false) { _ in
            self.lockApplication()
        }
    }

    private func stopLockTimer() {
        lockTimer?.invalidate()
        lockTimer = nil
    }

    private func isScreenBeingRecorded() -> Bool {
        if #available(iOS 11.0, *) {
            return UIScreen.main.isCaptured
        }
        return false
    }

    private func hideSensitiveContent() {
        // Implementation would hide sensitive UI elements
        NotificationCenter.default.post(name: .hideSensitiveContent, object: nil)
    }

    private func showSensitiveContent() {
        // Implementation would show sensitive UI elements
        NotificationCenter.default.post(name: .showSensitiveContent, object: nil)
    }

    private func clearSensitiveData() {
        // Clear sensitive data from memory
        // This would include clearing caches, temporary data, etc.
    }

    private func stopSensitiveOperations() {
        // Stop any ongoing sensitive operations
        // This would include network requests, file operations, etc.
    }

    // MARK: - Notification Handlers

    @objc private func appDidEnterBackground() {
        handleAppDidEnterBackground()
    }

    @objc private func appWillEnterForeground() {
        handleAppWillEnterForeground()
    }

    @objc private func userDidTakeScreenshot() {
        if configuration.enableScreenshotProtection {
            // Log security event
            logSecurityEvent(.screenshotTaken)

            // Optionally lock the app or show warning
            if configuration.securityLevel == .maximum {
                lockApplication()
            }
        }
    }

    @objc private func capturedDidChange() {
        if configuration.enableScreenRecordingDetection {
            performSecurityCheck()

            if isScreenBeingRecorded() {
                logSecurityEvent(.screenRecordingDetected)

                if configuration.securityLevel == .maximum {
                    lockApplication()
                }
            }
        }
    }

    private func logSecurityEvent(_ event: SecurityEvent) {
        // Implementation would log security events
        print("Security event: \(event)")
    }
}

// MARK: - Supporting Types

public enum SecurityThreat {
    case jailbroken
    case debuggerAttached
    case screenRecording
    case maliciousApp
    case networkInterception

    var description: String {
        switch self {
        case .jailbroken:
            return "Device is jailbroken"
        case .debuggerAttached:
            return "Debugger is attached"
        case .screenRecording:
            return "Screen is being recorded"
        case .maliciousApp:
            return "Malicious app detected"
        case .networkInterception:
            return "Network interception detected"
        }
    }
}

public enum SecurityRequirement {
    case biometricNotAvailable
    case biometricNotEnrolled
    case passcodeNotSet
    case deviceNotSecure

    var description: String {
        switch self {
        case .biometricNotAvailable:
            return "Biometric authentication is not available"
        case .biometricNotEnrolled:
            return "Biometric authentication is not set up"
        case .passcodeNotSet:
            return "Device passcode is not set"
        case .deviceNotSecure:
            return "Device does not meet security requirements"
        }
    }
}

private enum SecurityEvent {
    case screenshotTaken
    case screenRecordingDetected
    case authenticationFailed
    case jailbreakDetected
    case debuggerDetected
}

// MARK: - Notification Names

extension Notification.Name {
    static let hideSensitiveContent = Notification.Name("hideSensitiveContent")
    static let showSensitiveContent = Notification.Name("showSensitiveContent")
}

// MARK: - Jailbreak Detection

private class JailbreakDetector {

    func isJailbroken() -> Bool {
        return checkJailbreakFiles() ||
               checkCydiaScheme() ||
               checkSandboxViolation() ||
               checkFork() ||
               checkSymbolicLinks()
    }

    private func checkJailbreakFiles() -> Bool {
        let jailbreakPaths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/private/var/lib/apt/",
            "/private/var/lib/cydia",
            "/private/var/mobile/Library/SBSettings/Themes",
            "/Library/MobileSubstrate/DynamicLibraries/Veency.plist",
            "/private/var/stash",
            "/private/var/lib/apt",
            "/usr/libexec/sftp-server",
            "/usr/bin/ssh"
        ]

        for path in jailbreakPaths {
            if FileManager.default.fileExists(atPath: path) {
                return true
            }
        }

        return false
    }

    private func checkCydiaScheme() -> Bool {
        guard let url = URL(string: "cydia://package/com.example.package") else {
            return false
        }
        return UIApplication.shared.canOpenURL(url)
    }

    private func checkSandboxViolation() -> Bool {
        let testPath = "/private/test_write"
        do {
            let testString = "test"
            try testString.write(toFile: testPath, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(atPath: testPath)
            return true
        } catch {
            return false
        }
    }

    private func checkFork() -> Bool {
        let pid = fork()
        if pid >= 0 {
            return true
        }
        return false
    }

    private func checkSymbolicLinks() -> Bool {
        let symbolicLinkPaths = [
            "/Applications",
            "/var/stash/Library/Ringtones",
            "/var/stash/Library/Wallpaper",
            "/var/stash/usr/include",
            "/var/stash/usr/libexec",
            "/var/stash/usr/share",
            "/var/stash/usr/arm-apple-darwin9"
        ]

        for path in symbolicLinkPaths {
            do {
                let attributes = try FileManager.default.attributesOfItem(atPath: path)
                if let fileType = attributes[.type] as? FileAttributeType,
                   fileType == .typeSymbolicLink {
                    return true
                }
            } catch {
                continue
            }
        }

        return false
    }
}

// MARK: - Debugger Detection

private class DebuggerDetector {

    func isDebuggerAttached() -> Bool {
        return checkDebuggerFlag() || checkPtrace()
    }

    private func checkDebuggerFlag() -> Bool {
        var info = kinfo_proc()
        var mib = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        var size = MemoryLayout<kinfo_proc>.stride

        let junk = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
        assert(junk == 0, "sysctl failed")

        return (info.kp_proc.p_flag & P_TRACED) != 0
    }

    private func checkPtrace() -> Bool {
        // This is a more advanced check that would be implemented
        // based on specific anti-debugging techniques
        return false
    }
}