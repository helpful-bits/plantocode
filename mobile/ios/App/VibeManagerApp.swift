import SwiftUI
import VibeUI
import Core

@main
struct VibeManagerApp: App {
  @UIApplicationDelegateAdaptor(VibeManagerAppDelegate.self) var appDelegate

  var body: some Scene {
    WindowGroup {
      AppView()
      // No onOpenURL needed - Auth0.swift 2.13+ handles callbacks automatically
    }
  }
}
