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
  @ObservedObject private var deviceDiscovery = DeviceDiscoveryService.shared
  @EnvironmentObject private var container: AppContainer

  private enum FlowRoute {
    case loading, regionSelection, login, onboarding, paywall, deviceSelection, projectFolderSelection, workspace, missingConfiguration
  }
  @State private var route: FlowRoute = .loading
  @State private var subscriptionStatusObserver: Task<Void, Never>?

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
      case .onboarding:
        OnboardingFlowView(
          onSkip: {
            UserDefaults.standard.set(true, forKey: "onboarding_completed_v2")
            withAnimation { updateRoute() }
          },
          onComplete: {
            UserDefaults.standard.set(true, forKey: "onboarding_completed_v2")
            withAnimation { updateRoute() }
          }
        )
      case .paywall:
        PaywallView(allowsDismiss: false)
          .environmentObject(container)
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
      Task {
        await bootstrapAndRoute()
        // Start observing subscription status after initial bootstrap
        startSubscriptionObserver()
      }
    }
    .onDisappear {
      subscriptionStatusObserver?.cancel()
    }
    .onChange(of: appState.hasSelectedRegionOnce) { _ in withAnimation { updateRoute() } }
    .onChange(of: appState.isAuthenticated) { _ in withAnimation { updateRoute() } }
    .onChange(of: multiConnectionManager.activeDeviceId) { _ in withAnimation { updateRoute() } }
    .onChange(of: multiConnectionManager.connectionHealth) { _ in
      withAnimation {
        updateRoute()
      }
    }
    .onChange(of: appState.activeRegion) { newRegion in
      if newRegion != nil {
        withAnimation { updateRoute() }
      }
    }
    .onChange(of: appState.bootstrapState) { _ in withAnimation { updateRoute() } }
    .onChange(of: appState.selectedProjectDirectory) { _ in withAnimation { updateRoute() } }
    .onChange(of: deviceDiscovery.devices) { _ in
      withAnimation { updateRoute() }
    }
  }

  private func startSubscriptionObserver() {
    subscriptionStatusObserver = Task {
      var lastStatus = container.subscriptionManager.status.isActive
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 500_000_000) // Check every 0.5s
        let currentStatus = container.subscriptionManager.status.isActive
        if currentStatus != lastStatus {
          lastStatus = currentStatus
          await MainActor.run {
            withAnimation { updateRoute() }
          }
        }
      }
    }
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

  private var isActiveDeviceAvailable: Bool {
    guard let id = multiConnectionManager.activeDeviceId else { return false }
    return deviceDiscovery.devices.contains(where: { $0.deviceId == id && $0.status.isAvailable })
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

  private func shouldAllowWorkspaceAccess() -> Bool {
    guard appState.isAuthenticated else { return false }

    if container.hasCompletedInitialLoad {
      // After initial load: allow workspace as long as the active device is not effectively dead
      return multiConnectionManager.activeDeviceId != nil
        && !multiConnectionManager.activeDeviceIsEffectivelyDead
    } else {
      // Before bootstrap: be stricter; require a fully connected, available device
      return multiConnectionManager.activeDeviceIsFullyConnected
    }
  }

  @MainActor
  private func updateRoute() {
    // TEMPORARY: Force onboarding screen for testing purposes
    // TODO: Remove this to restore normal flow
//     route = .onboarding
//     return

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

    // 3. Onboarding check (only after login)
    if !UserDefaults.standard.bool(forKey: "onboarding_completed_v2") {
      route = .onboarding
      return
    }

    // 4. Subscription check via SubscriptionGate
    let gate = container.subscriptionGate

    if gate.shouldShowPaywallForWorkspaceEntry(
      bootstrapState: appState.bootstrapState,
      authBootstrapCompleted: appState.authBootstrapCompleted
    ) {
      route = .paywall
      return
    }

    // 5. Bootstrap state checks
    switch appState.bootstrapState {
    case .idle, .running:
      route = .loading
      return
    case .failed:
      route = .deviceSelection
      return
    case .needsConfiguration(let missing):
      if missing.projectMissing {
        // For folder selection, we need a FULLY CONNECTED device to browse folders
        if multiConnectionManager.activeDeviceIsFullyConnected {
          route = .projectFolderSelection
        } else {
          route = .deviceSelection
        }
        return
      } else {
        route = .missingConfiguration
        return
      }
    case .ready:
      if shouldAllowWorkspaceAccess() {
        if appState.selectedProjectDirectory == nil {
          // For folder selection, we need a FULLY CONNECTED device to browse folders
          if multiConnectionManager.activeDeviceIsFullyConnected {
            route = .projectFolderSelection
          } else {
            route = .deviceSelection
          }
        } else {
          route = .workspace
        }
      } else {
        route = .deviceSelection
      }
      return
    }
  }
}

#Preview {
  AuthFlowCoordinator()
}