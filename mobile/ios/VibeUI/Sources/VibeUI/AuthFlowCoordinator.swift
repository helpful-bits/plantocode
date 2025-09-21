import SwiftUI
import Core

public struct AuthFlowCoordinator: View {
  @ObservedObject private var appState = AppState.shared
  @State private var isChecking = true

  public init() {}

  public var body: some View {
    Group {
      if isChecking {
        ProgressView("Loading…")
          .transition(.opacity.animation(.easeInOut))
      } else if appState.activeRegion == nil {
        ServerSelectionView()
          .transition(.opacity.animation(.easeInOut))
      } else if !appState.isAuthenticated {
        LoginView()
          .transition(.opacity.animation(.easeInOut))
      } else if appState.selectedDeviceId == nil && !appState.isInMainApp {
        DeviceSelectionView()
          .transition(.opacity.animation(.easeInOut))
      } else {
        TaskView()
          .transition(.opacity.animation(.easeInOut))
      }
    }
    .onAppear {
      Task {
        await checkInitialState()
      }
    }
  }

  private func checkInitialState() async {
    // Check if region is already selected
    if await appState.getActiveRegion() == nil {
      withAnimation { isChecking = false }
      return
    }

    // If authenticated but no device selected, stay on device selection
    // If already in main app, stay there
    withAnimation { isChecking = false }
  }
}

#Preview {
  AuthFlowCoordinator()
}