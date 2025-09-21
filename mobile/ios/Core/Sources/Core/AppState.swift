import Foundation
import Combine

public struct Region {
  public let id: String
  public let name: String
  public let baseURL: URL

  public init(id: String, name: String, baseURL: URL) {
    self.id = id
    self.name = name
    self.baseURL = baseURL
  }
}

@MainActor
public final class AppState: ObservableObject {
  public static let shared = AppState()

  @Published public private(set) var isAuthenticated: Bool = false
  @Published public private(set) var currentUser: User? = nil
  @Published public private(set) var authError: String? = nil
  @Published public var selectedDeviceId: UUID? = nil
  @Published public var isInMainApp: Bool = false

  public let availableRegions: [Region] = [
    Region(id: "us", name: "United States", baseURL: URL(string: "https://api.us.vibemanager.app")!),
    Region(id: "eu", name: "European Union", baseURL: URL(string: "https://api.eu.vibemanager.app")!)
  ]

  public let authService = AuthService.shared
  private let regionRepository = RegionSettingsRepository.shared
  private var cancellables = Set<AnyCancellable>()

  private init() {
    // Initialize from AuthService to avoid startup race
    self.isAuthenticated = authService.isAuthenticated
    self.currentUser = authService.currentUser
    self.authError = authService.authError

    authService.$isAuthenticated
      .receive(on: DispatchQueue.main)
      .removeDuplicates()
      .sink { [weak self] value in
        self?.isAuthenticated = value
      }
      .store(in: &cancellables)

    authService.$currentUser
      .receive(on: DispatchQueue.main)
      .sink { [weak self] value in
        self?.currentUser = value
      }
      .store(in: &cancellables)

    authService.$authError
      .receive(on: DispatchQueue.main)
      .sink { [weak self] value in
        self?.authError = value
      }
      .store(in: &cancellables)
  }

  public func signIn(providerHint: String? = nil) async throws {
    try await authService.login(providerHint: providerHint)
  }

  public func signOut() async {
    await authService.logout()
  }

  public func getActiveRegion() -> String {
    return regionRepository.getActiveRegion()
  }

  public func setActiveRegion(region: String) {
    regionRepository.setActiveRegion(region: region)
  }

  public func setActiveRegion(_ region: Region) {
    regionRepository.setActiveRegion(region: region.name)
  }

  public var activeRegion: Region? {
    let activeRegionName = regionRepository.getActiveRegion()
    return availableRegions.first { $0.name == activeRegionName }
  }

  public func getActiveRegion() async -> Region? {
    return activeRegion
  }

  public func getAvailableRegions() -> [(region: String, baseURL: String)] {
    return regionRepository.getAvailableRegions()
  }

  // Device Selection and Navigation
  public func navigateToMainApp() {
    isInMainApp = true
  }

  public func navigateToDeviceSelection() {
    isInMainApp = false
    selectedDeviceId = nil
  }

  public func resetToLogin() {
    isInMainApp = false
    selectedDeviceId = nil
  }

  // URL handling is no longer needed with Auth0.swift 2.13+
  // The SDK handles callbacks automatically
}
