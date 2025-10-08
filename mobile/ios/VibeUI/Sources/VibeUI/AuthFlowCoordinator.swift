import SwiftUI
import Core

/*
 AuthFlowCoordinator routes:

 First-time: loading → regionSelection → login → deviceSelection → workspace
 Returning (valid token): loading (restore connections) → workspace OR deviceSelection
 Logout: → login (region preserved)
 Region change: next route derives from region/auth state

 Coordinator drives screen transitions; feature views avoid hard navigation.
*/

public struct AuthFlowCoordinator: View {
  @ObservedObject private var appState = AppState.shared
  @StateObject private var multiConnectionManager = MultiConnectionManager.shared

  private enum FlowRoute {
    case loading, regionSelection, login, deviceSelection, workspace
  }
  @State private var route: FlowRoute = .loading

  public init() {}

  public var body: some View {
    Group {
      switch route {
      case .loading:
        ProgressView()
      case .regionSelection:
        ServerSelectionView(isModal: false)
      case .login:
        LoginView()
      case .deviceSelection:
        DeviceSelectionView()
      case .workspace:
        SessionWorkspaceView(autoPresentDeviceSelection: false)
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
  }

  @MainActor
  private func bootstrapAndRoute() async {
    withAnimation { route = .loading }
    while appState.authBootstrapCompleted == false {
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
    await multiConnectionManager.restoreConnections()
    withAnimation { updateRoute() }
  }

  @MainActor
  private func updateRoute() {
    guard appState.hasSelectedRegionOnce else { route = .regionSelection; return }
    guard appState.isAuthenticated else { route = .login; return }

    // If we have an active device, stay in workspace even if temporarily disconnected
    // The workspace view will handle showing connection status
    if multiConnectionManager.activeDeviceId != nil {
      route = .workspace
    } else {
      route = .deviceSelection
    }
  }
}

#Preview {
  AuthFlowCoordinator()
}