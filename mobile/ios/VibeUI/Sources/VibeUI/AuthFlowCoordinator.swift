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
    case loading, regionSelection, login, deviceSelection, workspace, missingConfiguration
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
    guard appState.hasSelectedRegionOnce else { route = .regionSelection; return }
    guard appState.isAuthenticated else { route = .login; return }

    switch appState.bootstrapState {
    case .idle, .running:
      route = .loading
      return
    case .failed:
      route = .deviceSelection
      return
    case .needsConfiguration:
      route = .missingConfiguration
      return
    case .ready:
      route = (multiConnectionManager.activeDeviceId != nil) ? .workspace : .deviceSelection
      return
    }
  }
}

#Preview {
  AuthFlowCoordinator()
}