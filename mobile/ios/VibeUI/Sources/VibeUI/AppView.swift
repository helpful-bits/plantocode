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
    _container = StateObject(wrappedValue: AppContainer(baseURL: serverURL, deviceId: deviceId))
  }

  public var body: some View {
    NavigationStack {
      AuthFlowCoordinator()
    }
    .ignoresSafeArea(.keyboard, edges: .bottom)
    .environmentObject(container)
    .onAppear {
      if !PlanToCodeCore.shared.isInitialized {
        if let url = URL(string: Config.serverURL) {
          let cfg = CoreConfiguration(desktopAPIURL: url, deviceId: DeviceManager.shared.getOrCreateDeviceID())
          PlanToCodeCore.shared.initialize(with: cfg)
        }
      }
    }
  }
}
