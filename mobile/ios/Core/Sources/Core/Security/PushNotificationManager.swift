import Foundation
import UserNotifications
import UIKit
import OSLog

/// Manager for handling Apple Push Notifications (APNs) registration and token management
@MainActor
public class PushNotificationManager: NSObject, ObservableObject {
    public static let shared = PushNotificationManager()

    private let logger = Logger(subsystem: "VibeManager", category: "PushNotifications")

    // MARK: - Published Properties
    @Published public private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published public private(set) var deviceToken: String?
    @Published public private(set) var lastError: PushNotificationError?

    // MARK: - Private Properties
    private let notificationCenter = UNUserNotificationCenter.current()
    private let serverAPIClient = ServerAPIClient.shared
    private var isTokenRegistered = false

    // MARK: - Initialization
    private override init() {
        super.init()

        notificationCenter.delegate = self

        // Check current authorization status
        Task {
            await checkAuthorizationStatus()
        }

        // Register for application lifecycle notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Public Methods

    /// Request permission for push notifications
    public func requestPermission() async -> Bool {
        do {
            let granted = try await notificationCenter.requestAuthorization(options: [.alert, .sound, .badge])

            authorizationStatus = await notificationCenter.notificationSettings().authorizationStatus

            if granted {
                logger.info("Push notification permission granted")
                await registerForRemoteNotifications()
            } else {
                logger.warning("Push notification permission denied")
                lastError = .permissionDenied
            }

            return granted
        } catch {
            logger.error("Failed to request push notification permission: \(error)")
            lastError = .permissionRequestFailed(error)
            return false
        }
    }

    /// Register for remote notifications with APNs
    public func registerForRemoteNotifications() async {
        guard authorizationStatus == .authorized else {
            logger.warning("Cannot register for remote notifications without authorization")
            return
        }

        #if targetEnvironment(simulator)
        logger.info("[APNs] Skipping APNs registration on Simulator")
        return
        #endif

        // registerForRemoteNotifications is synchronous and must be called on main thread
        UIApplication.shared.registerForRemoteNotifications()
        logger.info("Registered for remote notifications")
    }

    /// Handle successful APNs token registration
    public func didRegisterForRemoteNotifications(withDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()

        logger.info("Received APNs device token: \(tokenString.prefix(20))...")

        self.deviceToken = tokenString

        // Send token to server
        Task {
            await registerTokenWithServer(tokenString)
        }
    }

    /// Handle APNs registration failure
    public func didFailToRegisterForRemoteNotifications(withError error: Error) {
        logger.error("Failed to register for remote notifications: \(error)")
        lastError = .registrationFailed(error)
    }

    /// Handle received push notification
    public func didReceiveRemoteNotification(_ userInfo: [AnyHashable: Any]) async {
        logger.info("Received remote notification: \(userInfo)")

        // Parse notification data
        if let notificationData = parseNotificationData(userInfo) {
            await handlePushNotification(notificationData)
        }
    }

    /// Get current notification settings
    public func getNotificationSettings() async -> UNNotificationSettings {
        return await notificationCenter.notificationSettings()
    }

    /// Check if notifications are enabled and properly configured
    public func isNotificationEnabled() async -> Bool {
        let settings = await getNotificationSettings()
        return settings.authorizationStatus == .authorized && deviceToken != nil
    }

    // MARK: - Private Methods

    private func checkAuthorizationStatus() async {
        let settings = await notificationCenter.notificationSettings()
        authorizationStatus = settings.authorizationStatus

        logger.info("Current notification authorization status: \(self.authorizationStatus.description)")
    }

    private func registerTokenWithServer(_ token: String) async {
        guard let deviceId = UUID(uuidString: DeviceManager.shared.getOrCreateDeviceID()) else {
            logger.error("Invalid device ID format")
            lastError = .invalidDeviceId
            return
        }

        do {
            let request = PushTokenRegistrationRequest(
                deviceToken: token,
                platform: "ios",
                environment: isProduction() ? "production" : "sandbox"
            )

            let _: PushTokenRegistrationResponse = try await serverAPIClient.request(
                path: "api/devices/\(deviceId)/push-token",
                method: .POST,
                body: request,
                token: await getCurrentAuthToken(),
                includeDeviceId: true
            )

            isTokenRegistered = true
            logger.info("Successfully registered push token with server")

        } catch {
            logger.error("Failed to register push token with server: \(error)")
            lastError = .serverRegistrationFailed(error)
        }
    }

    private func parseNotificationData(_ userInfo: [AnyHashable: Any]) -> PushNotificationData? {
        guard let aps = userInfo["aps"] as? [String: Any] else {
            logger.warning("Invalid notification format: missing aps payload")
            return nil
        }

        let alert = aps["alert"] as? [String: Any]
        let title = alert?["title"] as? String
        let body = alert?["body"] as? String
        let badge = aps["badge"] as? Int
        let sound = aps["sound"] as? String

        // Extract custom data
        var customData: [String: Any] = [:]
        for (key, value) in userInfo {
            if let keyString = key as? String, keyString != "aps" {
                customData[keyString] = value
            }
        }

        return PushNotificationData(
            title: title,
            body: body,
            badge: badge,
            sound: sound,
            customData: customData
        )
    }

    private func handlePushNotification(_ data: PushNotificationData) async {
        logger.info("Handling push notification: \(data.title ?? "No title")")

        // Handle different notification types based on custom data
        if let notificationType = data.customData["type"] as? String {
            switch notificationType {
            case "job_completed":
                await handleJobCompletedNotification(data)
            case "task_update":
                await handleTaskUpdateNotification(data)
            case "device_status":
                await handleDeviceStatusNotification(data)
            default:
                logger.info("Unknown notification type: \(notificationType)")
            }
        }

        // Update app badge if provided
        if let badge = data.badge {
            UIApplication.shared.applicationIconBadgeNumber = badge
        }
    }

    private func handleJobCompletedNotification(_ data: PushNotificationData) async {
        guard let jobId = data.customData["jobId"] as? String else {
            logger.warning("Job completed notification missing jobId")
            return
        }

        logger.info("Job completed: \(jobId)")

        // Could trigger a refresh of job status or navigate to job details
        // This would integrate with your job management system
    }

    private func handleTaskUpdateNotification(_ data: PushNotificationData) async {
        guard let taskId = data.customData["taskId"] as? String else {
            logger.warning("Task update notification missing taskId")
            return
        }

        logger.info("Task updated: \(taskId)")

        // Could trigger a refresh of task data
        // This would integrate with your task synchronization system
    }

    private func handleDeviceStatusNotification(_ data: PushNotificationData) async {
        guard let deviceId = data.customData["deviceId"] as? String else {
            logger.warning("Device status notification missing deviceId")
            return
        }

        logger.info("Device status changed: \(deviceId)")

        // Could trigger a refresh of device status
        // This would integrate with your device management system
    }

    private func getCurrentAuthToken() async -> String? {
        // Return the current JWT token from the auth system
        return await AuthService.shared.getValidAccessToken()
    }

    private func isProduction() -> Bool {
        #if DEBUG
        return false
        #else
        return true
        #endif
    }

    @objc private func applicationDidBecomeActive() {
        Task {
            await checkAuthorizationStatus()

            // Re-register token if needed
            if self.authorizationStatus == .authorized && self.deviceToken != nil && !self.isTokenRegistered {
                await registerForRemoteNotifications()
            }
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension PushNotificationManager: UNUserNotificationCenterDelegate {
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification even when app is in foreground
        completionHandler([.alert, .sound, .badge])
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        Task {
            await didReceiveRemoteNotification(userInfo)
        }

        completionHandler()
    }
}

// MARK: - Supporting Types

public enum PushNotificationError: LocalizedError {
    case permissionDenied
    case permissionRequestFailed(Error)
    case registrationFailed(Error)
    case serverRegistrationFailed(Error)
    case invalidDeviceId

    public var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Push notification permission was denied"
        case .permissionRequestFailed(let error):
            return "Failed to request permission: \(error.localizedDescription)"
        case .registrationFailed(let error):
            return "Failed to register with APNs: \(error.localizedDescription)"
        case .serverRegistrationFailed(let error):
            return "Failed to register token with server: \(error.localizedDescription)"
        case .invalidDeviceId:
            return "Invalid device ID format"
        }
    }
}

public struct PushNotificationData {
    public let title: String?
    public let body: String?
    public let badge: Int?
    public let sound: String?
    public let customData: [String: Any]

    public init(title: String?, body: String?, badge: Int?, sound: String?, customData: [String: Any]) {
        self.title = title
        self.body = body
        self.badge = badge
        self.sound = sound
        self.customData = customData
    }
}

public struct PushTokenRegistrationRequest: Codable {
    public let deviceToken: String
    public let platform: String
    public let environment: String

    public init(deviceToken: String, platform: String, environment: String) {
        self.deviceToken = deviceToken
        self.platform = platform
        self.environment = environment
    }
}

public struct PushTokenRegistrationResponse: Codable {
    public let success: Bool
    public let message: String

    public init(success: Bool, message: String) {
        self.success = success
        self.message = message
    }
}

// MARK: - Extensions

extension UNAuthorizationStatus {
    var description: String {
        switch self {
        case .notDetermined:
            return "notDetermined"
        case .denied:
            return "denied"
        case .authorized:
            return "authorized"
        case .provisional:
            return "provisional"
        case .ephemeral:
            return "ephemeral"
        @unknown default:
            return "unknown"
        }
    }
}