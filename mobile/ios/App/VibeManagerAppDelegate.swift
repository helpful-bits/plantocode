import UIKit
import UserNotifications
import Core

class VibeManagerAppDelegate: NSObject, UIApplicationDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
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
