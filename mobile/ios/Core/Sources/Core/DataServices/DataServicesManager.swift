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
    public let subscriptionManager: SubscriptionManager

    // MARK: - Connection Management
    @Published public var connectionStatus: ConnectionStatus = .disconnected
    @Published public var currentProject: ProjectInfo?
    public var activeDesktopDeviceId: UUID?
    @Published public var isJobsViewActive: Bool = false
    @Published public var isInitializing: Bool = false
    @Published public var hasCompletedInitialLoad: Bool = false

    // MARK: - Private Properties
    private let apiClient: APIClient
    private let cacheManager: CacheManager
    private let deviceId: String
    private var cancellables = Set<AnyCancellable>()
    private var relayEventsCancellable: AnyCancellable?
    private let logger = Logger(subsystem: "PlanToCode", category: "DataServicesManager")
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
        self.subscriptionManager = SubscriptionManager()

        Task { [weak settingsService] in
            try? await settingsService?.loadNotificationSettings()
        }

        setupConnectionMonitoring()
        setupSessionBroadcasting()

        // Load subscription products and status
        Task {
            try? await subscriptionManager.loadProducts()
            await subscriptionManager.refreshStatus()
        }
    }

    // MARK: - Public Methods

    /// Set the current project and preload relevant data
    @MainActor
    public func setCurrentProject(_ project: ProjectInfo) {
        // Since we're already @MainActor, update directly for immediate UI update
        self.currentProject = project
        self.objectWillChange.send()

        // Clear project-scoped state to prevent cross-project leakage
        sessionService.currentSession = nil
        sessionService.sessions = []

        // Invalidate caches
        plansService.invalidateCache()
        plansService.plans.removeAll()
        filesService.invalidateCache()
        filesService.files = []
        jobsService.clearJobs()

        // Preload data for the new project
        preloadProjectData(project)

        logger.info("Project changed to: \(project.name), caches invalidated")
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

    /// Perform live bootstrap - fetch session, plans, and jobs data in parallel
    @MainActor
    public func performLiveBootstrap() async {
        #if DEBUG
        let bootstrapStart = Date()
        logger.debug("Starting live bootstrap")
        #endif

        // Ensure connectivity is established
        guard MultiConnectionManager.shared.activeDeviceId != nil else {
            logger.warning("Cannot perform live bootstrap - no active device connection")
            return
        }

        // Launch three concurrent tasks
        async let sessionTask: Void = Task { @MainActor in
            #if DEBUG
            let start = Date()
            #endif

            // Fetch active session if method is available
            do {
                _ = try await self.sessionService.fetchActiveSession()
                #if DEBUG
                let duration = Date().timeIntervalSince(start) * 1000
                self.logger.debug("Session fetch completed in \(duration, format: .fixed(precision: 2))ms")
                #endif
            } catch {
                self.logger.error("Live bootstrap: Session fetch failed - \(error.localizedDescription)")
            }
        }.value

        async let plansTask: Void = Task { @MainActor in
            #if DEBUG
            let start = Date()
            #endif

            let request = PlanListRequest(
                projectDirectory: self.currentProject?.directory,
                sessionId: self.sessionService.currentSession?.id,
                page: 0,
                pageSize: 20
            )

            // Use Combine to async/await bridge
            do {
                let response = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<PlanListResponse, Error>) in
                    var cancellable: AnyCancellable?
                    cancellable = self.plansService.listPlans(request: request)
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    continuation.resume(throwing: error)
                                }
                                cancellable?.cancel()
                            },
                            receiveValue: { response in
                                continuation.resume(returning: response)
                            }
                        )
                }

                // Publish results immediately (already published by listPlans)
                self.logger.info("Live bootstrap: Fetched \(response.plans.count) plans")

            } catch {
                self.logger.error("Live bootstrap: Plans fetch failed - \(error.localizedDescription)")
            }

            #if DEBUG
            let duration = Date().timeIntervalSince(start) * 1000
            self.logger.debug("Plans fetch completed in \(duration, format: .fixed(precision: 2))ms")
            #endif
        }.value

        async let jobsTask: Void = Task { @MainActor in
            #if DEBUG
            let start = Date()
            #endif

            let request = JobListRequest(
                projectDirectory: self.currentProject?.directory,
                sessionId: self.sessionService.currentSession?.id,
                pageSize: 100
            )

            // Use Combine to async/await bridge
            do {
                let response = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<JobListResponse, Error>) in
                    var cancellable: AnyCancellable?
                    cancellable = self.jobsService.listJobs(request: request)
                        .sink(
                            receiveCompletion: { completion in
                                if case .failure(let error) = completion {
                                    continuation.resume(throwing: error)
                                }
                                cancellable?.cancel()
                            },
                            receiveValue: { response in
                                continuation.resume(returning: response)
                            }
                        )
                }

                // Publish results immediately (already published by listJobs)
                self.logger.info("Live bootstrap: Fetched \(response.jobs.count) jobs")

            } catch {
                self.logger.error("Live bootstrap: Jobs fetch failed - \(error.localizedDescription)")
            }

            #if DEBUG
            let duration = Date().timeIntervalSince(start) * 1000
            self.logger.debug("Jobs fetch completed in \(duration, format: .fixed(precision: 2))ms")
            #endif
        }.value

        // Wait for all tasks to complete (they publish results as they complete)
        await sessionTask
        await plansTask
        await jobsTask

        #if DEBUG
        let totalDuration = Date().timeIntervalSince(bootstrapStart) * 1000
        logger.debug("Live bootstrap completed in \(totalDuration, format: .fixed(precision: 2))ms")
        #endif
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
        // Removed redundant 30-second polling timer that called terminal.getDefaultShell
        // Connection status is already monitored via MultiConnectionManager.$connectionStates publisher below

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
                        self.plansService.preloadPlans(
                            for: project.directory,
                            sessionId: self.sessionService.currentSession?.id
                        )
                    }
                    Task { @MainActor in
                        await self.terminalService.bootstrapFromRemote()

                        // Fetch initial project directory from desktop when device changes
                        await self.fetchInitialProjectDirectory()
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
                // setActiveSession() already does an internal fetch, no need for duplicate request
                self.jobsService.setActiveSession(sessionId: s.id, projectDirectory: s.projectDirectory)

                // Unified preloads for immediacy across tabs
                self.plansService.preloadPlans(for: s.projectDirectory, sessionId: s.id)
                self.filesService.performSearch(query: self.filesService.currentSearchTerm)

                #if DEBUG
                self.logger.info("Session changed → preloads: plans/files/jobs initialized for session \(s.id)")
                #endif

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

                case "project-directory-updated":
                    // Handle project directory changes from desktop/other devices
                    if let projectDir = dict["projectDirectory"] as? String, !projectDir.isEmpty {
                        let name = URL(fileURLWithPath: projectDir).lastPathComponent
                        let hash = String(projectDir.hashValue)
                        let project = ProjectInfo(name: name, directory: projectDir, hash: hash)
                        self.setCurrentProject(project)
                        // Also update AppState for consistency
                        Task { @MainActor in
                            AppState.shared.setSelectedProjectDirectory(projectDir)
                        }
                    }

                case "session-created", "session-updated", "session-deleted",
                     "session-files-updated", "session-history-synced", "session:auto-files-applied":
                    // Use incremental updates instead of full refetch
                    self.sessionService.applyRelayEvent(event)

                case "active-session-changed":
                    if let sessionId = dict["sessionId"] as? String,
                       let projectDir = dict["projectDirectory"] as? String {
                        if self.sessionService.currentSession?.id == sessionId { return }
                        Task {
                            await self.loadSessionFromDesktop(sessionId: sessionId, projectDirectory: projectDir)
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

                logger.info("Connection established - starting reconnection sync")

                await self.sessionService.processOfflineQueue()
                await self.terminalService.bootstrapFromRemote()

                // Guard: Skip initial fetch if orchestrator has already set state
                if !self.hasCompletedInitialLoad && self.currentProject == nil {
                    logger.info("Fetching initial project directory from desktop")
                    await self.fetchInitialProjectDirectory()
                    logger.info("Completed fetching initial project directory")
                } else {
                    logger.info("Skipping initial fetch - state already set by orchestrator")
                }

                if let project = self.currentProject {
                    logger.info("Preloading sessions for project: \(project.name)")
                    try? await self.sessionService.fetchSessions(projectDirectory: project.directory)
                }

                guard let session = self.sessionService.currentSession,
                      !session.id.isEmpty else {
                    logger.info("Skipping jobs list - no valid session available")
                    return
                }

                if let projectDirectory = self.currentProject?.directory {
                    self.jobsService.listJobs(request: JobListRequest(
                        projectDirectory: projectDirectory,
                        sessionId: session.id,
                        pageSize: 100,
                        sortBy: .createdAt,
                        sortOrder: .desc
                    ))
                    .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
                    .store(in: &self.cancellables)
                }

                guard let project = self.currentProject else {
                    logger.info("Skipping plans preload - no project directory")
                    return
                }

                self.plansService.preloadPlans(
                    for: project.directory,
                    sessionId: self.sessionService.currentSession?.id
                )
                self.filesService.performSearch(query: self.filesService.currentSearchTerm)
                self.taskSyncService.getActiveTasks(request: GetActiveTasksRequest(
                    sessionIds: nil,
                    deviceId: self.deviceId,
                    projectDirectory: project.directory,
                    includeInactive: false
                ))
                .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
                .store(in: &self.cancellables)
            }
        }
    }

    /// Fetch the initial project directory from desktop when connecting
    private func fetchInitialProjectDirectory() async {
        await MainActor.run {
            self.isInitializing = true
        }

        guard self.currentProject == nil else {
            await MainActor.run { self.hasCompletedInitialLoad = true }
            return
        }
        guard self.hasCompletedInitialLoad == false else { return }

        defer {
            Task { @MainActor in
                self.isInitializing = false
                self.hasCompletedInitialLoad = true
            }
        }

        do {
            for try await response in CommandRouter.appGetProjectDirectory() {
                if let result = response.result?.value as? [String: Any],
                   let projectDir = result["projectDirectory"] as? String,
                   !projectDir.isEmpty {

                    // Check if desktop-reported project differs from current mobile project
                    if let currentProj = self.currentProject, currentProj.directory != projectDir {
                        logger.info("Detected project directory mismatch - Mobile: \(currentProj.directory), Desktop: \(projectDir)")
                        logger.info("Updating mobile project to match desktop")

                        let name = URL(fileURLWithPath: projectDir).lastPathComponent
                        let hash = String(projectDir.hashValue)
                        let project = ProjectInfo(name: name, directory: projectDir, hash: hash)
                        await MainActor.run {
                            self.setCurrentProject(project)
                            AppState.shared.setSelectedProjectDirectory(projectDir)
                        }
                        logger.info("Updated project directory to: \(projectDir)")
                    } else if self.currentProject == nil {
                        // Only initialize if we don't already have a project set
                        let name = URL(fileURLWithPath: projectDir).lastPathComponent
                        let hash = String(projectDir.hashValue)
                        let project = ProjectInfo(name: name, directory: projectDir, hash: hash)
                        await MainActor.run {
                            self.setCurrentProject(project)
                            AppState.shared.setSelectedProjectDirectory(projectDir)
                        }
                        logger.info("Initialized project directory from desktop: \(projectDir)")
                    } else {
                        logger.info("Project directory already synchronized: \(projectDir)")
                    }

                    // After setting project directory, fetch and load the active session
                    await fetchAndLoadActiveSession(projectDirectory: projectDir)
                }
                if response.isFinal {
                    break
                }
            }
        } catch {
            logger.error("Failed to fetch initial project directory: \(error.localizedDescription)")
        }
    }

    /// Load a session by ID from desktop, preventing broadcast loops
    private func loadSessionFromDesktop(sessionId: String, projectDirectory: String) async {
        self.isApplyingRemoteActiveSession = true
        defer { self.isApplyingRemoteActiveSession = false }

        do {
            try await self.sessionService.loadSessionById(sessionId: sessionId, projectDirectory: projectDirectory)
            logger.info("Successfully loaded session from desktop: \(sessionId)")
        } catch {
            logger.error("Failed to load session \(sessionId): \(error.localizedDescription)")
        }
    }

    /// Fetch the active session ID from desktop and load that session
    private func fetchAndLoadActiveSession(projectDirectory: String) async {
        do {
            var foundActiveSession = false

            // First, fetch the active session ID from desktop
            for try await response in CommandRouter.appGetActiveSessionId() {
                if let result = response.result?.value as? [String: Any],
                   let sessionId = result["sessionId"] as? String,
                   !sessionId.isEmpty {

                    logger.info("Desktop reports active session ID: \(sessionId)")
                    await loadSessionFromDesktop(sessionId: sessionId, projectDirectory: projectDirectory)
                    foundActiveSession = true
                }

                if response.isFinal {
                    break
                }
            }

            // Fallback: If no active session found on desktop, load the most recent session
            if !foundActiveSession {
                logger.info("No active session ID found on desktop, loading most recent session as fallback")
                do {
                    let sessions = try await self.sessionService.fetchSessions(projectDirectory: projectDirectory)
                    if let mostRecent = sessions.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
                        logger.info("Loading most recent session: \(mostRecent.id)")
                        await loadSessionFromDesktop(sessionId: mostRecent.id, projectDirectory: projectDirectory)
                    } else {
                        logger.info("No sessions found for project directory: \(projectDirectory)")
                    }
                } catch {
                    logger.error("Failed to fetch sessions for fallback: \(error.localizedDescription)")
                }
            }
        } catch {
            logger.error("Failed to fetch active session ID: \(error.localizedDescription)")
        }
    }

    private func preloadProjectData(_ project: ProjectInfo) {
        // Preload plans
        plansService.preloadPlans(
            for: project.directory,
            sessionId: sessionService.currentSession?.id
        )

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

    // MARK: - Subscription

    public func hasActiveSubscription() -> Bool {
        subscriptionManager.hasActiveSubscription()
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
