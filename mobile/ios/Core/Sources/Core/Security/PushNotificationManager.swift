import Foundation
import UserNotifications
#if canImport(UIKit)
import UIKit
#endif
import OSLog
import Core

/// Manager for handling Apple Push Notifications (APNs) registration and token management
@MainActor
public class PushNotificationManager: NSObject, ObservableObject {
    public static let shared = PushNotificationManager()

    private let logger = Logger(subsystem: "PlanToCode", category: "PushNotifications")

    // MARK: - Published Properties
    @Published public private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published public private(set) var deviceToken: String?
    @Published public private(set) var lastError: PushNotificationError?

    // MARK: - Local Notification Identifiers
    static let FILE_FINDER_COMPLETE = "file_finder_complete"
    static let IMPLEMENTATION_PLAN_COMPLETE = "implementation_plan_complete"
    static let TERMINAL_INACTIVITY_DETECTED = "terminal_inactivity_detected"

    // MARK: - Token Sync State
    public enum PushTokenSyncState: String {
        case pending
        case synced
        case failed
    }

    // MARK: - Private Properties
    private let notificationCenter = UNUserNotificationCenter.current()
    private let serverAPIClient = ServerAPIClient.shared
    private var isTokenRegistered = false
    private var lastRegisteredDeviceToken: Data?
    private var tokenRegistrationInFlight: String?

    private static let pendingPushTokenKey = "pendingPushToken"
    private static let pushTokenSyncStateKey = "pushTokenSyncState"

    public var pushTokenSyncState: PushTokenSyncState {
        get {
            guard let rawValue = UserDefaults.standard.string(forKey: Self.pushTokenSyncStateKey) else {
                return .pending
            }
            return PushTokenSyncState(rawValue: rawValue) ?? .pending
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: Self.pushTokenSyncStateKey)
        }
    }

    private var pendingPushToken: String? {
        get { UserDefaults.standard.string(forKey: Self.pendingPushTokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.pendingPushTokenKey) }
    }

    // MARK: - Initialization
    private override init() {
        super.init()

        notificationCenter.delegate = self

        // Register notification categories
        registerNotificationCategories()

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

        // Register for auth token refresh notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAuthTokenRefreshed),
            name: NSNotification.Name("auth-token-refreshed"),
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Private Setup Methods

    private func registerNotificationCategories() {
        let fileFinderCategory = UNNotificationCategory(
            identifier: Self.FILE_FINDER_COMPLETE,
            actions: [],
            intentIdentifiers: [],
            options: []
        )

        let implementationPlanCategory = UNNotificationCategory(
            identifier: Self.IMPLEMENTATION_PLAN_COMPLETE,
            actions: [],
            intentIdentifiers: [],
            options: []
        )

        let terminalInactivityCategory = UNNotificationCategory(
            identifier: Self.TERMINAL_INACTIVITY_DETECTED,
            actions: [],
            intentIdentifiers: [],
            options: []
        )

        notificationCenter.setNotificationCategories([
            fileFinderCategory,
            implementationPlanCategory,
            terminalInactivityCategory
        ])

        logger.info("Registered notification categories")
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
        submitTokenIfNeeded(tokenData: deviceToken, tokenString: tokenString)
    }

    /// Handle APNs registration failure
    public func didFailToRegisterForRemoteNotifications(withError error: Error) {
        logger.error("Failed to register for remote notifications: \(error)")
        lastError = .registrationFailed(error)
    }

    /// Register device token with server (new method as per requirements)
    public func register(token: Data) {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        submitTokenIfNeeded(tokenData: token, tokenString: tokenString)
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

    // MARK: - Local Notification Methods

    /// Generic method to schedule local notifications
    private func scheduleLocalNotification(title: String, body: String, userInfo: [String: Any], categoryIdentifier: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.userInfo = userInfo
        content.categoryIdentifier = categoryIdentifier
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let identifier = UUID().uuidString
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

        notificationCenter.add(request) { error in
            if let error = error {
                self.logger.error("Failed to schedule local notification: \(error)")
            } else {
                self.logger.info("Local notification scheduled: \(categoryIdentifier)")
            }
        }
    }

    /// Schedule notification for completed file finder job
    public func scheduleFileFinderCompleted(sessionId: String, projectDirectory: String?) {
        guard PlanToCodeCore.shared.dataServices?.settingsService.notifyFileFinderResultsEnabled ?? true else {
            return
        }

        scheduleLocalNotification(
            title: "File Finder complete",
            body: "Discovered files are ready in Selected",
            userInfo: [
                "type": Self.FILE_FINDER_COMPLETE,
                "sessionId": sessionId,
                "projectDirectory": projectDirectory ?? ""
            ],
            categoryIdentifier: Self.FILE_FINDER_COMPLETE
        )
    }

    /// Schedule notification for completed implementation plan
    public func scheduleImplementationPlanCompleted(
        sessionId: String,
        projectDirectory: String?,
        jobId: String,
        planTitle: String?,
        model: String?
    ) {
        guard PlanToCodeCore.shared.dataServices?.settingsService.notifyPlanReadyEnabled ?? true else {
            return
        }
#if canImport(UIKit)
        if UIApplication.shared.applicationState == .active {
            return
        }
#endif

        let displayModel = model.map(PlanContentParser.displayModelName)
        let titleText = (planTitle?.isEmpty == false) ? planTitle! : "Implementation plan ready"
        let bodyText = displayModel ?? ""

        scheduleLocalNotification(
            title: titleText,
            body: bodyText,
            userInfo: [
                "type": Self.IMPLEMENTATION_PLAN_COMPLETE,
                "sessionId": sessionId,
                "projectDirectory": projectDirectory ?? "",
                "jobId": jobId,
                "planTitle": planTitle ?? "",
                "modelUsed": model ?? ""
            ],
            categoryIdentifier: Self.IMPLEMENTATION_PLAN_COMPLETE
        )
    }

    public func scheduleTerminalInactivityDetected(sessionId: String, projectDirectory: String?, jobId: String? = nil) {
        guard PlanToCodeCore.shared.dataServices?.settingsService.notifyTerminalInactivityEnabled ?? true else {
            return
        }

        scheduleLocalNotification(
            title: "Terminal inactive",
            body: "No new terminal output detected.",
            userInfo: [
                "type": Self.TERMINAL_INACTIVITY_DETECTED,
                "sessionId": sessionId,
                "projectDirectory": projectDirectory ?? "",
                "jobId": jobId ?? ""
            ],
            categoryIdentifier: Self.TERMINAL_INACTIVITY_DETECTED
        )
    }

    /// Ensure session is loaded before navigating
    private func ensureSessionLoaded(sessionId: String, projectDirectory: String?) async {
        guard let dataServices = PlanToCodeCore.shared.dataServices else { return }
        if dataServices.sessionService.currentSession?.id != sessionId {
            // Only load if we have a project directory
            guard let projectDir = projectDirectory else {
                logger.warning("Cannot load session without project directory")
                return
            }
            do {
                try await dataServices.sessionService.loadSessionById(sessionId: sessionId, projectDirectory: projectDir)
            } catch {
                logger.error("Failed to load session: \(error)")
            }
        }
    }

    // MARK: - Private Methods

    private func submitTokenIfNeeded(tokenData: Data, tokenString: String) {
        if tokenRegistrationInFlight == tokenString { return }
        if isTokenRegistered, self.deviceToken == tokenString, pushTokenSyncState == .synced { return }

        tokenRegistrationInFlight = tokenString
        lastRegisteredDeviceToken = tokenData
        self.deviceToken = tokenString
        pendingPushToken = tokenString
        pushTokenSyncState = .pending

        Task {
            logger.info("Upserting APNs push token: \(tokenString.prefix(20))...")
            do {
                try await serverAPIClient.upsertPushToken(platform: "ios", token: tokenString)
                isTokenRegistered = true
                pushTokenSyncState = .synced
                pendingPushToken = nil
                lastError = nil
                logger.info("Successfully synced push token with server")
            } catch {
                pushTokenSyncState = .failed
                lastError = .serverRegistrationFailed(error)
                logger.error("Failed to upsert push token: \(error)")
            }
            tokenRegistrationInFlight = nil
        }
    }

    private func checkAuthorizationStatus() async {
        let settings = await notificationCenter.notificationSettings()
        authorizationStatus = settings.authorizationStatus

        logger.info("Current notification authorization status: \(self.authorizationStatus.description)")
    }

    private func registerTokenWithServer(_ token: String) async throws {
        guard let authToken = await getCurrentAuthToken() else {
            logger.error("No valid auth token available for push registration")
            throw PushNotificationError.serverRegistrationFailed(NSError(domain: "PushNotificationManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "No auth token"]))
        }

        let deviceId = DeviceManager.shared.getOrCreateDeviceID()

        let request = PushTokenRegistrationRequest(
            deviceToken: token,
            platform: "ios",
            environment: isProduction() ? "production" : "sandbox"
        )

        // Register push token with the correct endpoint
        let _: PushTokenRegistrationResponse = try await serverAPIClient.request(
            path: "api/devices/push/register",
            method: .POST,
            body: request,
            token: authToken
        )
    }

    public func registerPushTokenIfAvailable() async {
        let tokenToSync = deviceToken ?? pendingPushToken
        guard let token = tokenToSync else {
            logger.info("No device token available to register")
            return
        }

        if pushTokenSyncState == .synced && deviceToken == token {
            return
        }

        pushTokenSyncState = .pending
        do {
            try await serverAPIClient.upsertPushToken(platform: "ios", token: token)
            isTokenRegistered = true
            pushTokenSyncState = .synced
            pendingPushToken = nil
            lastError = nil
            logger.info("Successfully synced push token with server")
        } catch {
            pushTokenSyncState = .failed
            lastError = .serverRegistrationFailed(error)
            logger.error("Failed to upsert push token: \(error)")
        }
    }

    private func registerDeviceTokenWithServer(_ token: String) async {
        // This is a duplicate method - using registerTokenWithServer instead
        do {
            try await registerTokenWithServer(token)
        } catch {
            logger.error("Failed to register device token: \(error)")
        }
    }

    private func OLD_registerDeviceTokenWithServer_DEPRECATED(_ token: String) async {
        guard let authToken = await getCurrentAuthToken() else {
            logger.error("No valid auth token available for push registration")
            lastError = .serverRegistrationFailed(NSError(domain: "PushNotificationManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "No auth token"]))
            return
        }

        let currentEnvironment = isProduction() ? "production" : "sandbox"

        do {
            let request = PushTokenRegistrationRequest(
                deviceToken: token,
                platform: "ios",
                environment: currentEnvironment
            )

            let response: PushTokenRegistrationResponse = try await serverAPIClient.request(
                path: "api/devices/push/register",
                method: .POST,
                body: request,
                token: authToken
            )

            isTokenRegistered = true
            logger.info("Successfully registered device token with server")

        } catch {
            logger.error("Failed to register device token with server: \(error)")
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
            case "job_failed":
                await handleJobFailedNotification(data)
            case "task_update":
                await handleTaskUpdateNotification(data)
            case "device_status":
                await handleDeviceStatusNotification(data)
            default:
                logger.info("Unknown notification type: \(notificationType)")
            }
        }

        // Enhanced type handling for file finder and implementation plan notifications
        if let type = data.customData["type"] as? String {
            let sessionId = data.customData["sessionId"] as? String ?? ""
            let projectDirectory = data.customData["projectDirectory"] as? String

            // Handle various type formats
            let fileFinderTypes = ["file_finder_complete", "file_finder.completed", "fileFinder.completed", "find_files.completed"]
            let planTypes = ["implementation_plan_complete", "implementation_plan.completed", "plan.completed"]
            let jobRefreshTypes = ["job_completed", "job_failed", "file_finder_complete", "implementation_plan_complete"]

            if fileFinderTypes.contains(type) {
                await ensureSessionLoaded(sessionId: sessionId, projectDirectory: projectDirectory)
                AppState.shared.deepLinkRoute = .filesSelected(sessionId: sessionId, projectDirectory: projectDirectory)
            } else if planTypes.contains(type), let jobId = data.customData["jobId"] as? String {
                await ensureSessionLoaded(sessionId: sessionId, projectDirectory: projectDirectory)
                AppState.shared.deepLinkRoute = .openPlan(sessionId: sessionId, projectDirectory: projectDirectory, jobId: jobId)
            }

            // Set flag for job-related notifications to trigger refresh when app becomes active
            if jobRefreshTypes.contains(type) {
                AppState.shared.needsJobsRefreshOnNextActive = true
            }
        }

        // Badge is now managed centrally by JobsBadgeCoordinator - no direct manipulation here
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

    private func handleJobFailedNotification(_ data: PushNotificationData) async {
        guard let jobId = data.customData["jobId"] as? String else {
            logger.warning("Job failed notification missing jobId")
            return
        }

        logger.info("Job failed: \(jobId)")

        // Could trigger a refresh of job status or show error details
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

    @objc private func handleAuthTokenRefreshed() {
        Task {
            await registerPushTokenIfAvailable()
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
        let userInfo = notification.request.content.userInfo
        let categoryIdentifier = notification.request.content.categoryIdentifier
        let notificationType = (userInfo["type"] as? String)
            ?? (categoryIdentifier.isEmpty ? nil : categoryIdentifier)

        if let type = notificationType {
            let fileFinderEnabled = PlanToCodeCore.shared.dataServices?.settingsService.notifyFileFinderResultsEnabled ?? true
            let planReadyEnabled = PlanToCodeCore.shared.dataServices?.settingsService.notifyPlanReadyEnabled ?? true
            let terminalInactivityEnabled = PlanToCodeCore.shared.dataServices?.settingsService.notifyTerminalInactivityEnabled ?? true

            if type == Self.FILE_FINDER_COMPLETE && !fileFinderEnabled {
                completionHandler([])
                return
            }

            if type == Self.IMPLEMENTATION_PLAN_COMPLETE && !planReadyEnabled {
                completionHandler([])
                return
            }

            if type == Self.TERMINAL_INACTIVITY_DETECTED && !terminalInactivityEnabled {
                completionHandler([])
                return
            }

#if canImport(UIKit)
            if type == Self.IMPLEMENTATION_PLAN_COMPLETE,
               let jobId = userInfo["jobId"] as? String,
               PlanToCodeCore.shared.dataServices?.jobsService.isViewingImplementationPlan(jobId: jobId) == true {
                completionHandler([])
                return
            }

            if type == Self.IMPLEMENTATION_PLAN_COMPLETE,
               UIApplication.shared.applicationState == .active {
                completionHandler([])
                return
            }
#endif
        }

        completionHandler([.banner, .sound, .badge])
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        Task {
            // Check if it's a local notification (no "aps" key)
            if userInfo["aps"] == nil {
                // Local notification
                if let type = userInfo["type"] as? String,
                   let sessionId = userInfo["sessionId"] as? String {
                    let projectDirectory = userInfo["projectDirectory"] as? String

                    // Ensure session is loaded first
                    await ensureSessionLoaded(sessionId: sessionId, projectDirectory: projectDirectory)

                    // Set appropriate deep link route
                    switch type {
                    case Self.FILE_FINDER_COMPLETE:
                        AppState.shared.deepLinkRoute = .filesSelected(sessionId: sessionId, projectDirectory: projectDirectory)

                    case Self.IMPLEMENTATION_PLAN_COMPLETE:
                        if let jobId = userInfo["jobId"] as? String {
                            AppState.shared.deepLinkRoute = .openPlan(sessionId: sessionId, projectDirectory: projectDirectory, jobId: jobId)
                        }

                    case Self.TERMINAL_INACTIVITY_DETECTED:
                        let terminalInactivityEnabled = PlanToCodeCore.shared.dataServices?.settingsService.notifyTerminalInactivityEnabled ?? true
                        if terminalInactivityEnabled {
                            AppState.shared.deepLinkRoute = .filesSelected(sessionId: sessionId, projectDirectory: projectDirectory)
                        }

                    default:
                        break
                    }
                }
            } else {
                // Remote notification - use existing logic
                await didReceiveRemoteNotification(userInfo)
            }
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

    public init(success: Bool) {
        self.success = success
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
