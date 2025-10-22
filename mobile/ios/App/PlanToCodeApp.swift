import SwiftUI
import VibeUI
import Core

@main
struct PlanToCodeApp: App {
  @UIApplicationDelegateAdaptor(PlanToCodeAppDelegate.self) var appDelegate

  var body: some Scene {
    WindowGroup {
      AppView()
        .environmentObject(AppState.shared)
    }
  }
}
