import Foundation
import Combine
import OSLog


/// Central manager for all data services
@MainActor
public class DataServicesManager: ObservableObject {

    // MARK: - Services
    public let jobsService: JobsDataService
    public let plansService: PlansDataService
    public let filesService: FilesDataService
    public let taskSyncService: TaskSyncDataService
    public let sqliteService: SQLiteDataService
    public let terminalService: TerminalDataService
    public let serverFeatureService: ServerFeatureService
    public let sessionService: SessionDataService
    public let speechTextServices: SpeechTextServices
    public let settingsService: SettingsDataService

    // MARK: - Connection Management
    @Published public var connectionStatus: ConnectionStatus = .disconnected
    @Published public var currentProject: ProjectInfo?
    public var activeDesktopDeviceId: UUID?
    @Published public var isJobsViewActive: Bool = false

    // MARK: - Private Properties
    private let apiClient: APIClient
    private let cacheManager: CacheManager
    private let deviceId: String
    private var cancellables = Set<AnyCancellable>()
    private var relayEventsCancellable: AnyCancellable?
    private let logger = Logger(subsystem: "VibeManager", category: "DataServicesManager")
    private var isApplyingRemoteActiveSession = false

    // MARK: - Initialization
    public init(baseURL: URL, deviceId: String) {
        self.deviceId = deviceId
        self.apiClient = APIClient(baseURL: baseURL)
        self.cacheManager = CacheManager.shared

        // Initialize services
        self.sessionService = SessionDataService()
        _ = self.sessionService.ensureSession()
        self.jobsService = JobsDataService(
            apiClient: apiClient,
            cacheManager: cacheManager
        )
        self.plansService = PlansDataService(
            apiClient: apiClient,
            cacheManager: cacheManager,
            jobsService: self.jobsService
        )
        self.filesService = FilesDataService(apiClient: apiClient, cacheManager: cacheManager)
        self.taskSyncService = TaskSyncDataService(
            deviceId: deviceId,
            cacheManager: cacheManager,
            apiClient: apiClient
        )
        self.sqliteService = SQLiteDataService(
            apiClient: apiClient,
            cacheManager: cacheManager
        )
        self.terminalService = TerminalDataService()
        self.serverFeatureService = ServerFeatureService()
        self.speechTextServices = SpeechTextServices()
        self.settingsService = SettingsDataService()

        setupConnectionMonitoring()
        setupSessionBroadcasting()
    }

    // MARK: - Public Methods

    /// Set the current project and preload relevant data
    @MainActor
    public func setCurrentProject(_ project: ProjectInfo) {
        currentProject = project

        // Preload data for the project
        preloadProjectData(project)
    }

    /// Refresh all data for the current project
    @MainActor
    public func refreshCurrentProject() {
        guard let project = currentProject else { return }

        // Clear caches
        invalidateAllCaches()

        // Reload data
        preloadProjectData(project)
    }

    /// Test connection to desktop app
    public func testConnection() -> AnyPublisher<Bool, Never> {
        // Use terminal default shell as lightweight connectivity probe
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Just(false)
                .handleEvents(receiveOutput: { [weak self] isConnected in
                    Task { @MainActor in
                        self?.updateConnectionStatus(connected: isConnected)
                    }
                })
                .eraseToAnyPublisher()
        }

        return Future<Bool, Never> { promise in
            Task {
                do {
                    for try await response in CommandRouter.terminalGetDefaultShell() {
                        if response.error != nil {
                            promise(.success(false))
                            return
                        }
                        if response.isFinal {
                            promise(.success(true))
                            return
                        }
                    }
                    promise(.success(false))
                } catch {
                    promise(.success(false))
                }
            }
        }
        .handleEvents(receiveOutput: { [weak self] isConnected in
            Task { @MainActor in
                self?.updateConnectionStatus(connected: isConnected)
            }
        })
        .eraseToAnyPublisher()
    }

    /// Set whether the Jobs view is currently active
    public func setJobsViewActive(_ active: Bool) {
        self.isJobsViewActive = active
    }

    /// Get sync status across all services
    public func getAllSyncStatuses() -> AnyPublisher<ServicesSyncStatus, DataServiceError> {
        let jobSyncPublisher = testConnection().map { $0 }
        let taskSyncPublisher = taskSyncService.getSyncStatus()
            .map { _ in true }
            .catch { _ in Just(false) }

        return Publishers.CombineLatest(jobSyncPublisher, taskSyncPublisher)
            .map { jobsConnected, tasksConnected in
                ServicesSyncStatus(
                    jobsConnected: jobsConnected,
                    tasksConnected: tasksConnected,
                    filesConnected: jobsConnected, // Files use same connection as jobs
                    plansConnected: jobsConnected, // Plans use same connection as jobs
                    sqliteConnected: jobsConnected, // SQLite uses same connection as jobs
                    lastChecked: Date()
                )
            }
            .setFailureType(to: DataServiceError.self)
            .eraseToAnyPublisher()
    }

    /// Clear all caches
    public func invalidateAllCaches() {
        cacheManager.clear()
    }

    /// Export project data
    public func exportProjectData(_ project: ProjectInfo, format: ExportFormat = .json) -> AnyPublisher<URL, DataServiceError> {
        return Future<URL, DataServiceError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.invalidState("Service manager deallocated")))
                return
            }

            Task {
                do {
                    let exportData = try await self.gatherProjectData(project)
                    let fileURL = try await self.writeExportData(exportData, format: format, project: project)
                    promise(.success(fileURL))
                } catch {
                    promise(.failure(.fileSystemError(error)))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    // MARK: - Private Methods

    private func setupConnectionMonitoring() {
        Timer.publish(every: 30, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self else { return }
                self.testConnection()
                    .sink { _ in }
                    .store(in: &self.cancellables)
            }
            .store(in: &cancellables)

        MultiConnectionManager.shared.$connectionStates
            .sink { [weak self] states in
                guard let self = self else { return }
                let isConnected = states.values.contains { state in
                    if case .connected = state {
                        return true
                    }
                    return false
                }

                // Detect active device change and propagate
                let newActive = MultiConnectionManager.shared.activeDeviceId
                if newActive != self.activeDesktopDeviceId {
                    self.activeDesktopDeviceId = newActive
                    self.plansService.onActiveDeviceChanged(newActive)
                    if let project = self.currentProject {
                        self.plansService.preloadPlans(for: project.directory)
                    }
                    Task { @MainActor in
                        await self.terminalService.bootstrapFromRemote()
                    }
                }

                self.handleConnectionStateChange(connected: isConnected)

                // Re-subscribe to relay events when connection state changes
                self.subscribeToRelayEvents()
            }
            .store(in: &cancellables)

        subscribeToRelayEvents()
    }

    private func setupSessionBroadcasting() {
        sessionService.$currentSession
            .dropFirst()
            .sink { [weak self] session in
                guard let self = self,
                      self.isApplyingRemoteActiveSession == false,
                      let s = session else { return }

                // Enable background event processing for jobs
                self.jobsService.setActiveSession(sessionId: s.id, projectDirectory: s.projectDirectory)

                Task {
                    try? await self.sessionService.broadcastActiveSessionChanged(
                        sessionId: s.id,
                        projectDirectory: s.projectDirectory
                    )
                }
            }
            .store(in: &cancellables)
    }

    private func subscribeToRelayEvents() {
        // Cancel previous subscription
        relayEventsCancellable?.cancel()

        // Get active device and relay client
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return
        }

        // Subscribe to relay events with proper AnyCodable decoding
        relayEventsCancellable = relayClient.events
            .sink { [weak self] event in
                guard let self = self else { return }
                let eventType = event.eventType
                let dict = event.data.mapValues { $0.value }

                switch eventType {
                case "session-file-browser-state-updated":
                    if let sid = dict["sessionId"] as? String {
                        self.filesService.applyRemoteBrowserState(
                            sessionId: sid,
                            searchTerm: dict["searchTerm"] as? String,
                            sortBy: dict["sortBy"] as? String,
                            sortOrder: dict["sortOrder"] as? String,
                            filterMode: dict["filterMode"] as? String
                        )
                    }

                case "session-created", "session-updated", "session-deleted",
                     "session-files-updated", "session-history-synced", "session:auto-files-applied":
                    // Use incremental updates instead of full refetch
                    self.sessionService.applyRelayEvent(event)

                case "active-session-changed":
                    if let sessionId = dict["sessionId"] as? String,
                       let projectDir = dict["projectDirectory"] as? String {
                        if self.sessionService.currentSession?.id == sessionId { return }
                        self.isApplyingRemoteActiveSession = true
                        Task {
                            defer { self.isApplyingRemoteActiveSession = false }
                            try? await self.sessionService.loadSessionById(sessionId: sessionId, projectDirectory: projectDir)
                        }
                    }

                default:
                    if eventType.hasPrefix("job:") {
                        // Process job events continuously in background (like desktop)
                        // This ensures jobs data is always fresh when user navigates to Jobs tab

                        // Gate by current session
                        guard let currentSessionId = self.sessionService.currentSession?.id else { return }

                        // Parse and verify session ID
                        if let sessionId = dict["sessionId"] as? String {
                            guard sessionId == currentSessionId else { return }
                        } else if let jobData = dict["job"] as? [String: Any],
                                  let sessionId = jobData["sessionId"] as? String {
                            guard sessionId == currentSessionId else { return }
                        }
                        // If only jobId present, allow forwarding - JobsDataService will handle it

                        self.jobsService.applyRelayEvent(event)
                    }
                }
            }
    }

    private func handleConnectionStateChange(connected: Bool) {
        if connected {
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                await self.sessionService.processOfflineQueue()
                await self.terminalService.bootstrapFromRemote()

                if let project = self.currentProject {
                    try? await self.sessionService.fetchSessions(projectDirectory: project.directory)
                }
            }
        }
    }

    private func preloadProjectData(_ project: ProjectInfo) {
        // Preload plans
        plansService.preloadPlans(for: project.directory)

        // Preload files
        filesService.preloadProjectFiles(projectDirectory: project.directory)

        // Preload active tasks
        let taskRequest = GetActiveTasksRequest(
            sessionIds: nil,
            deviceId: deviceId,
            projectDirectory: project.directory,
            includeInactive: false
        )
        taskSyncService.getActiveTasks(request: taskRequest)
            .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
            .store(in: &cancellables)
    }

    @MainActor
    private func updateConnectionStatus(connected: Bool) {
        let newStatus = ConnectionStatus(
            mode: connected ? .direct(url: apiClient.endpoint) : .offline,
            isConnected: connected,
            lastConnectedAt: connected ? Date() : connectionStatus.lastConnectedAt,
            latencyMs: nil // Would measure actual latency
        )
        connectionStatus = newStatus
    }

    private func gatherProjectData(_ project: ProjectInfo) async throws -> ProjectExportData {
        // This would gather data from all services for export
        return ProjectExportData(
            project: project,
            jobs: [],
            plans: [],
            tasks: [],
            exportedAt: Date()
        )
    }

    private func writeExportData(_ data: ProjectExportData, format: ExportFormat, project: ProjectInfo) async throws -> URL {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = .prettyPrinted

        let jsonData = try encoder.encode(data)

        let fileName = "project_export_\(project.name)_\(Int(Date().timeIntervalSince1970)).\(format.fileExtension)"
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let fileURL = documentsPath.appendingPathComponent(fileName)

        switch format {
        case .json:
            try jsonData.write(to: fileURL)
        case .csv:
            // Would convert to CSV format
            let csvData = "Project Export\n".data(using: .utf8)!
            try csvData.write(to: fileURL)
        }

        return fileURL
    }
}

// MARK: - Supporting Types

public struct ProjectInfo: Codable, Identifiable {
    public let id = UUID()
    public let name: String
    public let directory: String
    public let hash: String
    public let lastAccessed: Date

    public init(name: String, directory: String, hash: String, lastAccessed: Date = Date()) {
        self.name = name
        self.directory = directory
        self.hash = hash
        self.lastAccessed = lastAccessed
    }
}

public struct ServicesSyncStatus {
    public let jobsConnected: Bool
    public let tasksConnected: Bool
    public let filesConnected: Bool
    public let plansConnected: Bool
    public let sqliteConnected: Bool
    public let lastChecked: Date

    public var allConnected: Bool {
        jobsConnected && tasksConnected && filesConnected && plansConnected && sqliteConnected
    }

    public var connectedServicesCount: Int {
        [jobsConnected, tasksConnected, filesConnected, plansConnected, sqliteConnected].filter { $0 }.count
    }

    public var totalServicesCount: Int { 5 }
}

public enum ExportFormat: String, CaseIterable {
    case json
    case csv

    public var fileExtension: String {
        return rawValue
    }

    public var displayName: String {
        switch self {
        case .json: return "JSON"
        case .csv: return "CSV"
        }
    }
}

public struct ProjectExportData: Codable {
    public let project: ProjectInfo
    public let jobs: [BackgroundJob]
    public let plans: [PlanSummary]
    public let tasks: [TaskDescription]
    public let exportedAt: Date
}
