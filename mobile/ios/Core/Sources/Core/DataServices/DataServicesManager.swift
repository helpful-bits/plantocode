import Foundation
import Combine


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

    // MARK: - Connection Management
    @Published public var connectionStatus: ConnectionStatus = .disconnected
    @Published public var currentProject: ProjectInfo?
    public var activeDesktopDeviceId: UUID?

    // MARK: - Private Properties
    private let apiClient: APIClient
    private let desktopAPIClient: DesktopAPIClient
    private let desktopServerAPIClient: DesktopServerAPIClient
    private let taskWebSocketClient: WebSocketClient
    private let cacheManager: CacheManager
    private let deviceId: String
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(baseURL: URL, deviceId: String) {
        self.deviceId = deviceId
        self.apiClient = APIClient(baseURL: baseURL)
        self.cacheManager = CacheManager.shared

        let webSocketURL = DataServicesManager.makeWebSocketURL(from: baseURL)
        self.desktopAPIClient = DesktopAPIClient(serverURL: webSocketURL)
        self.desktopServerAPIClient = DesktopServerAPIClient(desktopAPIClient: desktopAPIClient)
        let wsDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.taskWebSocketClient = WebSocketClient(serverURL: webSocketURL, sessionDelegate: wsDelegate)

        // Initialize services
        self.sessionService = SessionDataService()
        _ = self.sessionService.ensureSession()
        self.jobsService = JobsDataService(
            desktopAPIClient: desktopAPIClient,
            apiClient: apiClient,
            cacheManager: cacheManager
        )
        self.plansService = PlansDataService(
            desktopAPIClient: desktopAPIClient,
            apiClient: apiClient,
            cacheManager: cacheManager
        )
        self.filesService = FilesDataService(apiClient: apiClient, cacheManager: cacheManager)
        self.taskSyncService = TaskSyncDataService(
            desktopServerAPIClient: desktopServerAPIClient,
            webSocketClient: taskWebSocketClient,
            deviceId: deviceId,
            cacheManager: cacheManager,
            apiClient: apiClient
        )
        self.sqliteService = SQLiteDataService(
            desktopAPIClient: desktopAPIClient,
            cacheManager: cacheManager
        )
        self.terminalService = TerminalDataService()
        self.serverFeatureService = ServerFeatureService()
        self.speechTextServices = SpeechTextServices()

        setupConnectionMonitoring()
    }

    // MARK: - Public Methods

    /// Get current active desktop clients via MultiConnectionManager
    public var activeDesktopClients: (api: DesktopAPIClient, ws: WebSocketClient, server: DesktopServerAPIClient)? {
        guard let deviceId = activeDesktopDeviceId else { return nil }
        // Note: MultiConnectionManager returns ServerRelayClient, not the tuple we need
        // This property might need to be reworked based on the new architecture
        return nil
    }

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
        // Simple ping test using job list API
        let request = JobListRequest(
            projectDirectory: nil,
            pageSize: 1
        )

        return jobsService.listJobs(request: request)
            .map { _ in true }
            .catch { _ in Just(false) }
            .handleEvents(receiveOutput: { [weak self] isConnected in
                Task { @MainActor in
                    self?.updateConnectionStatus(connected: isConnected)
                }
            })
            .eraseToAnyPublisher()
    }

    /// Establish the authenticated desktop WebSocket connection.
    public func connectDesktop(jwtToken: String) -> AnyPublisher<Void, DesktopAPIError> {
        return desktopAPIClient
            .connect(jwtToken: jwtToken)
            .handleEvents(receiveOutput: { [weak self] in
                self?.connectTaskStream()
            })
            .eraseToAnyPublisher()
    }

    /// Disconnect desktop bridge and associated real-time channels.
    public func disconnectDesktop() {
        desktopAPIClient.disconnect()
        taskWebSocketClient.disconnect()
    }

    /// Connect the task synchronization WebSocket channel.
    public func connectTaskStream() {
        taskWebSocketClient.connect()
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
                self.handleConnectionStateChange(connected: isConnected)
            }
            .store(in: &cancellables)

        subscribeToRelayEvents()
    }

    private func subscribeToRelayEvents() {
        guard let deviceId = activeDesktopDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return
        }

        relayClient.events
            .sink { [weak self] event in
                guard let self = self else { return }
                let eventType = event.eventType

                let sessionEvents = [
                    "session-created",
                    "session-updated",
                    "session-deleted",
                    "session-files-updated",
                    "session-history-synced",
                    "session:auto-files-applied"
                ]

                if sessionEvents.contains(eventType) {
                    Task { @MainActor in
                        if let project = self.currentProject {
                            try? await self.sessionService.fetchSessions(projectDirectory: project.directory)
                        }
                    }
                }
            }
            .store(in: &cancellables)
    }

    private func handleConnectionStateChange(connected: Bool) {
        if connected {
            Task { [weak self] in
                guard let self = self else { return }

                await self.sessionService.processOfflineQueue()

                if let project = self.currentProject {
                    try? await self.sessionService.fetchSessions(projectDirectory: project.directory)
                }
            }
        }
    }

    private func preloadProjectData(_ project: ProjectInfo) {
        // Preload jobs
        let jobRequest = JobListRequest(
            projectDirectory: project.directory,
            pageSize: 20
        )
        jobsService.listJobs(request: jobRequest)
            .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
            .store(in: &cancellables)

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

private extension DataServicesManager {
    static func makeWebSocketURL(from baseURL: URL) -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return baseURL
        }
        if components.scheme == "https" {
            components.scheme = "wss"
        } else if components.scheme == "http" {
            components.scheme = "ws"
        }

        if components.path.isEmpty || components.path == "/" {
            components.path = "/ws"
        }

        return components.url ?? baseURL
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
