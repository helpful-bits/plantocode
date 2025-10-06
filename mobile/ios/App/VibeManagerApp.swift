import SwiftUI
import VibeUI
import Core

@main
struct VibeManagerApp: App {
  @UIApplicationDelegateAdaptor(VibeManagerAppDelegate.self) var appDelegate

  var body: some Scene {
    WindowGroup {
      AppView()
        .environmentObject(AppState.shared)
    }
  }
}
