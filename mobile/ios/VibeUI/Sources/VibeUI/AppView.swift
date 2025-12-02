import SwiftUI
import Core

public struct AppView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var container: AppContainer

  public init() {
    guard let serverURL = URL(string: Config.serverURL) else {
      fatalError("Invalid server URL in Config: \(Config.serverURL)")
    }
    let deviceId = DeviceManager.shared.getOrCreateDeviceID()

    // CRITICAL: Initialize core BEFORE creating AppContainer to ensure single DataServicesManager.
    // Without this, AppContainer creates a fallback manager, then core creates another,
    // resulting in multiple TerminalDataService instances that duplicate terminal data.
    if !PlanToCodeCore.shared.isInitialized {
      let cfg = CoreConfiguration(desktopAPIURL: serverURL, deviceId: deviceId)
      PlanToCodeCore.shared.initialize(with: cfg)
    }

    _container = StateObject(wrappedValue: AppContainer(baseURL: serverURL, deviceId: deviceId))
  }

  public var body: some View {
    NavigationStack {
      AuthFlowCoordinator()
    }
    .ignoresSafeArea(.keyboard, edges: .bottom)
    .environmentObject(container)
  }
}
