import SwiftUI
import Core

public struct AppView: View {
  @ObservedObject private var appState = AppState.shared

  public init() {}

  public var body: some View {
    Group {
      if appState.isAuthenticated {
        TaskView()
      } else {
        AuthFlowCoordinator()
      }
    }
  }
}
