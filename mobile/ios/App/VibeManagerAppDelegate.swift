import UIKit
import UserNotifications
import Core

class VibeManagerAppDelegate: NSObject, UIApplicationDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    // Configure TabBar appearance
    configureTabBarAppearance()

    // Initialize VibeManagerCore early
    let deviceId = DeviceManager.shared.getOrCreateDeviceID()
    guard let serverURL = URL(string: Config.serverURL) else {
        print("Invalid serverURL")
        return true
    }
    let config = CoreConfiguration(desktopAPIURL: serverURL, deviceId: deviceId)
    if !VibeManagerCore.shared.isInitialized {
        VibeManagerCore.shared.initialize(with: config)
    }
    print("Core initialized: \(VibeManagerCore.shared.isInitialized)")

    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if granted {
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      }
    }
    return true
  }

  private func configureTabBarAppearance() {
    let appearance = UITabBarAppearance()
    appearance.configureWithDefaultBackground()

    // Set proper background with blur effect
    appearance.backgroundColor = UIColor.systemBackground

    // Configure normal (unselected) item appearance with proper font and spacing
    let normalItemAppearance = UITabBarItemAppearance()
    normalItemAppearance.normal.iconColor = UIColor.systemGray
    normalItemAppearance.normal.titleTextAttributes = [
      .foregroundColor: UIColor.systemGray,
      .font: UIFont.systemFont(ofSize: 10, weight: .medium)
    ]

    // Configure selected item appearance with teal color
    normalItemAppearance.selected.iconColor = UIColor(red: 0.06, green: 0.49, blue: 0.55, alpha: 1.0) // Teal
    normalItemAppearance.selected.titleTextAttributes = [
      .foregroundColor: UIColor(red: 0.06, green: 0.49, blue: 0.55, alpha: 1.0),
      .font: UIFont.systemFont(ofSize: 10, weight: .semibold)
    ]

    appearance.stackedLayoutAppearance = normalItemAppearance
    appearance.inlineLayoutAppearance = normalItemAppearance
    appearance.compactInlineLayoutAppearance = normalItemAppearance

    // Apply appearance to all tab bars
    UITabBar.appearance().standardAppearance = appearance
    if #available(iOS 15.0, *) {
      UITabBar.appearance().scrollEdgeAppearance = appearance
    }
  }

  func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    // URL handling not needed with polling-based auth
    return false
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    PushNotificationManager.shared.register(token: deviceToken)
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    PushNotificationManager.shared.didFailToRegisterForRemoteNotifications(withError: error)
  }

  func application(_ application: UIApplication,
                   didReceiveRemoteNotification userInfo: [AnyHashable : Any],
                   fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    Task { @MainActor in
      await PushNotificationManager.shared.didReceiveRemoteNotification(userInfo)
      completionHandler(.newData)
    }
  }
}
