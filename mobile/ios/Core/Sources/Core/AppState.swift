import Foundation
import Combine

public struct Region: Equatable {
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
  @Published public private(set) var activeRegion: Region? = nil
  @Published public var hasSelectedRegionOnce: Bool = false {
    didSet {
      UserDefaults.standard.set(hasSelectedRegionOnce, forKey: "hasSelectedRegionOnce")
    }
  }
  @Published public private(set) var authBootstrapCompleted: Bool = false
  @Published public var selectedProjectDirectory: String? {
    didSet {
      UserDefaults.standard.set(selectedProjectDirectory, forKey: "ActiveProjectDirectory")
    }
  }

  // MARK: - Bootstrap Presentation State
  public struct MissingConfig: Equatable {
    public let projectMissing: Bool
    public let sessionsEmpty: Bool
    public let activeSessionMissing: Bool

    public init(projectMissing: Bool, sessionsEmpty: Bool, activeSessionMissing: Bool) {
      self.projectMissing = projectMissing
      self.sessionsEmpty = sessionsEmpty
      self.activeSessionMissing = activeSessionMissing
    }
  }

  public enum BootstrapState: Equatable {
    case idle
    case running
    case ready
    case needsConfiguration(MissingConfig)
    case failed(String)
  }

  @Published public private(set) var bootstrapState: BootstrapState = .idle

  // MARK: - Deep Link Routing
  public enum DeepLinkRoute: Equatable {
    case filesSelected(sessionId: String, projectDirectory: String?)
    case openPlan(sessionId: String, projectDirectory: String?, jobId: String)

    public static func == (lhs: DeepLinkRoute, rhs: DeepLinkRoute) -> Bool {
      switch (lhs, rhs) {
      case let (.filesSelected(lSession, lProject), .filesSelected(rSession, rProject)):
        return lSession == rSession && lProject == rProject
      case let (.openPlan(lSession, lProject, lJobId), .openPlan(rSession, rProject, rJobId)):
        return lSession == rSession && lProject == rProject && lJobId == rJobId
      default:
        return false
      }
    }
  }

  @Published public var deepLinkRoute: DeepLinkRoute? = nil
  @Published public var pendingPlanJobIdToOpen: String? = nil

  public func clearDeepLinkRoute() {
    self.deepLinkRoute = nil
  }

  public func setPendingPlanToOpen(_ jobId: String?) {
    self.pendingPlanJobIdToOpen = jobId
  }

  // MARK: - Debug toggles for validation
  @Published public var isEventsWebSocketEnabled: Bool = false

  // MARK: - Validation counters
  @Published public private(set) var fileSearchesPerformed: Int = 0
  @Published public private(set) var planSavesCount: Int = 0
  @Published public private(set) var terminalExecuteCount: Int = 0
  @Published public private(set) var voiceTranscriptionAttempts: Int = 0

  public let availableRegions: [Region] = [
    Region(id: "us", name: "United States", baseURL: URL(string: "https://api-us.plantocode.com")!),
    Region(id: "eu", name: "European Union", baseURL: URL(string: "https://api-eu.plantocode.com")!)
  ]

  public let authService = AuthService.shared
  private let regionRepository = RegionSettingsRepository.shared
  private var cancellables = Set<AnyCancellable>()

  private init() {
    // Initialize from AuthService to avoid startup race
    self.isAuthenticated = authService.isAuthenticated
    self.currentUser = authService.currentUser
    self.authError = authService.authError

    // Initialize active region from repository
    let activeRegionName = regionRepository.getActiveRegion()
    self.activeRegion = availableRegions.first { $0.name == activeRegionName }

    // Load hasSelectedRegionOnce from UserDefaults
    self.hasSelectedRegionOnce = UserDefaults.standard.bool(forKey: "hasSelectedRegionOnce")

    // Load selectedProjectDirectory from UserDefaults
    self.selectedProjectDirectory = UserDefaults.standard.string(forKey: "ActiveProjectDirectory")

    authService.$isAuthenticated
      .receive(on: DispatchQueue.main)
      .removeDuplicates()
      .sink { [weak self] value in
        Task { @MainActor in
          self?.isAuthenticated = value
        }
      }
      .store(in: &cancellables)

    authService.$currentUser
      .receive(on: DispatchQueue.main)
      .sink { [weak self] value in
        Task { @MainActor in
          self?.currentUser = value
        }
      }
      .store(in: &cancellables)

    authService.$authError
      .receive(on: DispatchQueue.main)
      .sink { [weak self] value in
        Task { @MainActor in
          self?.authError = value
        }
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
    Task { @MainActor in
      self.activeRegion = region
    }
    // Persist to database asynchronously
    regionRepository.setActiveRegion(region: region.name)
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

  // MARK: - Validation counter methods

  public func incrementFileSearchCount() {
    fileSearchesPerformed += 1
  }

  public func incrementPlanSaveCount() {
    planSavesCount += 1
  }

  public func incrementTerminalExecuteCount() {
    terminalExecuteCount += 1
  }

  public func incrementVoiceTranscriptionCount() {
    voiceTranscriptionAttempts += 1
  }

  public func resetValidationCounters() {
    fileSearchesPerformed = 0
    planSavesCount = 0
    terminalExecuteCount = 0
    voiceTranscriptionAttempts = 0
  }

  public func getValidationCounters() -> (fileSearches: Int, planSaves: Int, terminalExecutes: Int, voiceTranscriptions: Int) {
    return (fileSearchesPerformed, planSavesCount, terminalExecuteCount, voiceTranscriptionAttempts)
  }

  // MARK: - Onboarding and Auth Bootstrap methods

  public func markRegionSelectionCompleted() {
    Task { @MainActor in
      hasSelectedRegionOnce = true
    }
  }

  public func markAuthBootstrapCompleted() {
    Task { @MainActor in
      authBootstrapCompleted = true
    }
  }

  public func setSelectedProjectDirectory(_ path: String?) {
    Task { @MainActor in
      self.selectedProjectDirectory = path
    }
  }

  public func setBootstrapRunning() {
    Task { @MainActor in
      self.bootstrapState = .running
    }
  }

  public func setBootstrapReady() {
    Task { @MainActor in
      self.bootstrapState = .ready
    }
  }

  public func setBootstrapNeedsConfig(_ missing: MissingConfig) {
    Task { @MainActor in
      self.bootstrapState = .needsConfiguration(missing)
    }
  }

  public func setBootstrapFailed(_ message: String) {
    Task { @MainActor in
      self.bootstrapState = .failed(message)
    }
  }

  // URL handling is no longer needed with Auth0.swift 2.13+
  // The SDK handles callbacks automatically
}
