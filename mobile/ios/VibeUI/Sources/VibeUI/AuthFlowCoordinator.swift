import SwiftUI
import Core

/*
 AuthFlowCoordinator routes:

 First-time: loading → regionSelection → login → deviceSelection → projectFolderSelection → workspace
 Returning (valid token): loading (restore connections) → workspace OR deviceSelection OR projectFolderSelection
 Logout: → login (region preserved)
 Region change: next route derives from region/auth state

 Coordinator drives screen transitions; feature views avoid hard navigation.
*/

public struct AuthFlowCoordinator: View {
  @ObservedObject private var appState = AppState.shared
  @StateObject private var multiConnectionManager = MultiConnectionManager.shared

  private enum FlowRoute {
    case loading, regionSelection, login, deviceSelection, projectFolderSelection, workspace, missingConfiguration
  }
  @State private var route: FlowRoute = .loading

  public init() {}

  public var body: some View {
    Group {
      switch route {
      case .loading:
        VStack(spacing: 16) {
          ProgressView()
            .scaleEffect(1.2)
          Text(loadingMessage)
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(.secondary)
        }
      case .regionSelection:
        ServerSelectionView(isModal: false)
      case .login:
        LoginView()
      case .deviceSelection:
        DeviceSelectionView()
      case .projectFolderSelection:
        ProjectFolderSelectionView()
      case .workspace:
        SessionWorkspaceView(autoPresentDeviceSelection: false)
      case .missingConfiguration:
        MissingConfigurationView()
      }
    }
    .transition(.opacity)
    .animation(.easeInOut(duration: 0.2), value: route)
    .onAppear {
      Task { await bootstrapAndRoute() }
    }
    .onChange(of: appState.hasSelectedRegionOnce) { _ in withAnimation { updateRoute() } }
    .onChange(of: appState.isAuthenticated) { _ in withAnimation { updateRoute() } }
    .onChange(of: multiConnectionManager.activeDeviceId) { _ in withAnimation { updateRoute() } }
    .onChange(of: multiConnectionManager.connectionStates) { _ in withAnimation { updateRoute() } }
    .onChange(of: appState.activeRegion) { newRegion in
      if newRegion != nil {
        withAnimation { updateRoute() }
      }
    }
    .onChange(of: appState.bootstrapState) { _ in withAnimation { updateRoute() } }
    .onChange(of: appState.selectedProjectDirectory) { _ in withAnimation { updateRoute() } }
  }

  private var loadingMessage: String {
    // Check for failed connection state first
    if let activeId = multiConnectionManager.activeDeviceId,
       let state = multiConnectionManager.connectionStates[activeId],
       case .failed = state {
      return "Connection failed. Please check your network and try again."
    }

    if !appState.authBootstrapCompleted {
      return "Initializing..."
    }

    switch appState.bootstrapState {
    case .idle:
      return "Starting..."
    case .running:
      if let deviceId = multiConnectionManager.activeDeviceId,
         let state = multiConnectionManager.connectionStates[deviceId] {
        switch state {
        case .connecting, .handshaking:
          return "Connecting to desktop..."
        case .connected:
          return "Loading workspace..."
        default:
          return "Connecting..."
        }
      }
      return "Connecting..."
    case .ready:
      return "Almost ready..."
    case .failed(let message):
      return "Failed: \(message)"
    case .needsConfiguration:
      return "Configuration needed..."
    }
  }

  @MainActor
  private func bootstrapAndRoute() async {
    withAnimation { route = .loading }
    while appState.authBootstrapCompleted == false {
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
    if appState.bootstrapState == .idle {
      await InitializationOrchestrator.shared.run()
    }
    withAnimation { updateRoute() }
  }

  @MainActor
  private func updateRoute() {
    // 1. Region check
    guard appState.hasSelectedRegionOnce else {
      route = .regionSelection
      return
    }

    // 2. Auth check
    guard appState.isAuthenticated else {
      route = .login
      return
    }

    // 3. Bootstrap state checks
    switch appState.bootstrapState {
    case .idle, .running:
      route = .loading
      return
    case .failed:
      route = .deviceSelection
      return
    case .needsConfiguration(let missing):
      // Map needsConfiguration with projectMissing to onboarding flow
      if missing.projectMissing {
        // Check device connection first
        if multiConnectionManager.activeDeviceId == nil {
          route = .deviceSelection
          return
        }
        // Check if device is actually connected
        if let deviceId = multiConnectionManager.activeDeviceId,
           let state = multiConnectionManager.connectionStates[deviceId],
           case .connected = state {
          // Device connected, show project selection
          route = .projectFolderSelection
          return
        } else {
          // Device not connected, back to device selection
          route = .deviceSelection
          return
        }
      } else {
        // Other configuration missing
        route = .missingConfiguration
        return
      }
    case .ready:
      // 4. Device connection check (always before project check)
      if multiConnectionManager.activeDeviceId == nil {
        route = .deviceSelection
        return
      }

      // Check if device is actually connected
      if let deviceId = multiConnectionManager.activeDeviceId,
         let state = multiConnectionManager.connectionStates[deviceId],
         case .connected = state {
        // Device connected, check project
        if appState.selectedProjectDirectory == nil {
          route = .projectFolderSelection
          return
        } else {
          route = .workspace
          return
        }
      } else {
        // Device not connected
        route = .deviceSelection
        return
      }
    }
  }
}

#Preview {
  AuthFlowCoordinator()
}