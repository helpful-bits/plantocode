import Foundation
import Combine
import OSLog


/// Central manager for all data services
@MainActor
public class DataServicesManager: ObservableObject {

    // MARK: - Services
    public let jobsService: JobsDataService
    public let filesService: FilesDataService
    public let taskSyncService: TaskSyncDataService
    public let sqliteService: SQLiteDataService
    public let terminalService: TerminalDataService
    public let serverFeatureService: ServerFeatureService
    public let sessionService: SessionDataService
    public let speechTextServices: SpeechTextServices
    public let settingsService: SettingsDataService
    public let subscriptionManager: SubscriptionManager
    public let onboardingService: OnboardingContentService
    public let accountService: AccountDataService

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
    private var lastAppliedConnectedState: Bool? = nil
    private var isPerformingLiveBootstrap = false
    private var lastSwitchDeviceId: UUID?
    private var lastSwitchAt: Date?
    private var orchestratorTriggerInFlight = false
    private var authStateCancellable: AnyCancellable?
    private var lastReconnectionSyncAt: Date?
    private var lastBroadcastedSessionId: String? = nil

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
        self.onboardingService = OnboardingContentService()
        self.accountService = AccountDataService()

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
        // Only update if project actually changed
        guard currentProject?.directory != project.directory else {
            return
        }

        // Since we're already @MainActor, update directly for immediate UI update
        self.currentProject = project
        self.objectWillChange.send()

        // Clear project-scoped session state thoroughly
        sessionService.resetState()

        // Invalidate caches
        filesService.invalidateCache()
        filesService.files = []
        jobsService.clearJobs()

        // Clear task sync state (tasks, conflicts, syncStatus)
        taskSyncService.tasks.removeAll()
        taskSyncService.conflicts.removeAll()
        taskSyncService.syncStatus = .disconnected

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

    /// Reset all service state when switching to a new active device
    @MainActor
    public func onActiveDeviceSwitch(newId: UUID?) {
        logger.info("Resetting all state for device switch to: \(newId?.uuidString ?? "nil")")

        // Reset bootstrap flags
        hasCompletedInitialLoad = false
        isInitializing = true

        // Clear project
        currentProject = nil

        // Invalidate all caches
        invalidateAllCaches()

        // Reset per-service state
        sessionService.resetState()
        jobsService.reset()
        filesService.reset()

        terminalService.cleanForDeviceSwitch()

        // Cancel relay events subscription
        relayEventsCancellable?.cancel()
        relayEventsCancellable = nil

        // Reset AppState routing markers
        AppState.shared.setSelectedProjectDirectory(nil)
        AppState.shared.setBootstrapRunning()

        logger.info("State reset complete for device switch")
    }

    /// Reset all state for device connection reliability
    @MainActor
    public func resetAllState() {
        terminalService.cleanForDeviceSwitch()

        sessionService.currentSession = nil
        sessionService.sessions = []

        filesService.files = []

        jobsService.clearJobs()

        taskSyncService.tasks.removeAll()
        taskSyncService.conflicts.removeAll()

        // Reset account service state
        accountService.clearError()

        NotificationCenter.default.post(name: Notification.Name("connection-hard-reset-completed"), object: nil)
    }

    /// Test connection to desktop app
    public func testConnection() -> AnyPublisher<Bool, Never> {
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
                    for try await response in CommandRouter.systemPing() {
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

    /// Perform live bootstrap - fetch session sequentially, then rely on broadcasting to preload jobs
    @MainActor
    public func performLiveBootstrap() async {
        if let projectDir = currentProject?.directory,
           sessionService.hasRecentSessionsFetch(for: projectDir, within: 10.0) {
            logger.info("Skipping live bootstrap - session data already fresh")
            return
        }

        isPerformingLiveBootstrap = true
        defer { isPerformingLiveBootstrap = false }

        #if DEBUG
        let bootstrapStart = Date()
        logger.debug("Starting live bootstrap")
        #endif

        // Ensure connectivity is established
        guard MultiConnectionManager.shared.activeDeviceId != nil else {
            logger.warning("Cannot perform live bootstrap - no active device connection")
            return
        }

        // Fetch active session - broadcasting will handle jobs/files preload
        #if DEBUG
        let sessionStart = Date()
        #endif

        do {
            _ = try await self.sessionService.fetchActiveSession()
            #if DEBUG
            let duration = Date().timeIntervalSince(sessionStart) * 1000
            self.logger.debug("Session fetch completed in \(duration, format: .fixed(precision: 2))ms")
            #endif
        } catch {
            self.logger.error("Live bootstrap: Session fetch failed - \(error.localizedDescription)")
        }

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

    @MainActor
    private func triggerOrchestratorIfNeeded(context: String) {
        if orchestratorTriggerInFlight { return }
        if hasCompletedInitialLoad { return }
        if AppState.shared.bootstrapState == .running { return }
        guard AuthService.shared.isAuthenticated else { return }
        guard let activeId = MultiConnectionManager.shared.activeDeviceId,
              isConnected(deviceId: activeId) else { return }

        orchestratorTriggerInFlight = true
        Task { @MainActor in
            defer { self.orchestratorTriggerInFlight = false }
            await InitializationOrchestrator.shared.run()
        }
    }

    private func isConnected(deviceId: UUID) -> Bool {
        if let st = MultiConnectionManager.shared.connectionStates[deviceId], case .connected = st {
            return true
        }
        return false
    }

    private func setupConnectionMonitoring() {
        // Removed redundant 30-second polling timer that called terminal.getDefaultShell
        // Connection status is already monitored via MultiConnectionManager.$connectionStates publisher below

        // Subscribe to auth state changes
        authStateCancellable = AuthService.shared.$isAuthenticated
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isAuthed in
                guard let self = self else { return }
                if isAuthed {
                    self.triggerOrchestratorIfNeeded(context: "auth")
                }
            }

        // Direct observation of activeDeviceId for deterministic device assignment/switch detection
        MultiConnectionManager.shared.$activeDeviceId
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newActive in
                guard let self else { return }
                
                // Initial assignment
                if self.activeDesktopDeviceId == nil, let newActive {
                    self.handleInitialDeviceAssigned(newActive)
                } else if let newActive, newActive != self.activeDesktopDeviceId {
                    // Device switch
                    self.handleDeviceSwitch(to: newActive)
                }
            }
            .store(in: &cancellables)

        MultiConnectionManager.shared.$connectionStates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] states in
                guard let self = self else { return }
                let isConnected = states.values.contains { state in
                    if case .connected = state {
                        return true
                    }
                    return false
                }

                // Only handle connection state changes on transitions
                if self.lastAppliedConnectedState != isConnected {
                    self.lastAppliedConnectedState = isConnected
                    self.handleConnectionStateChange(connected: isConnected)
                }

                // Re-subscribe to relay events when connection state changes
                self.subscribeToRelayEvents()
            }
            .store(in: &cancellables)

        subscribeToRelayEvents()
    }
    
    private func handleInitialDeviceAssigned(_ newActive: UUID) {
        // Debounce: if already the same, return early
        if newActive == self.activeDesktopDeviceId { return }
        self.activeDesktopDeviceId = newActive
        self.logger.info("Initial device assigned: \(newActive.uuidString)")
        
        // Guard by authentication before triggering orchestrator
        guard AuthService.shared.isAuthenticated else { return }
        
        // Trigger orchestrator once if not already running
        if !orchestratorTriggerInFlight {
            orchestratorTriggerInFlight = true
            Task { [weak self] in
                defer { 
                    Task { @MainActor in
                        self?.orchestratorTriggerInFlight = false
                    }
                }
                await InitializationOrchestrator.shared.run()
            }
        }
    }
    
    private func handleDeviceSwitch(to newId: UUID) {
        // Debounce repeated signals for the same device in a short time window
        if let last = lastSwitchDeviceId,
           last == newId,
           let ts = lastSwitchAt,
           Date().timeIntervalSince(ts) < 2.0 {
            return
        }

        // Execute switch logic
        self.onActiveDeviceSwitch(newId: newId)
        self.activeDesktopDeviceId = newId

        // Update debounce tracking
        self.lastSwitchDeviceId = newId
        self.lastSwitchAt = Date()

        // Clear UI state immediately
        self.filesService.onActiveDeviceChanged()
        self.jobsService.onActiveDeviceChanged()
        self.sessionService.onActiveDeviceChanged()

        // Trigger orchestrator to handle all initialization
        if !orchestratorTriggerInFlight {
            orchestratorTriggerInFlight = true
            Task { [weak self] in
                defer {
                    Task { @MainActor in
                        self?.orchestratorTriggerInFlight = false
                    }
                }
                await InitializationOrchestrator.shared.run()
            }
        }
    }

    private func setupSessionBroadcasting() {
        sessionService.currentSessionPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] session in
                guard let self = self,
                      self.isApplyingRemoteActiveSession == false,
                      let s = session else { return }

                guard !self.isPerformingLiveBootstrap else { return }

                // Guard to prevent repeated preloads for the same session
                if s.id == self.lastBroadcastedSessionId {
                    return
                }
                self.lastBroadcastedSessionId = s.id

                // Defensive guard: ensure JobsDataService has correct session context
                // Primary sync happens via startSessionScopedSync() in SessionWorkspaceViewModel.loadSession()
                self.jobsService.setActiveSession(sessionId: s.id, projectDirectory: s.projectDirectory)

                // Unified preloads for immediacy across tabs
                self.filesService.performSearch(query: self.filesService.currentSearchTerm)

                #if DEBUG
                self.logger.info("Session changed → preloads: files/jobs initialized for session \(s.id)")
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
        // Cancel previous subscription to avoid duplicates
        relayEventsCancellable?.cancel()
        relayEventsCancellable = nil

        // Get active device and relay client
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return
        }

        // Subscribe to relay events with proper AnyCodable decoding
        relayEventsCancellable = relayClient.events
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self = self else { return }
                let eventType = event.eventType
                let dict = event.data.mapValues { $0.value }

                switch eventType {
                case "device-status":
                    // Handle device status changes
                    let statusStr = dict["status"] as? String ?? "unknown"
                    let deviceIdStr = dict["deviceId"] as? String
                    self.logger.info("Received device-status event: device=\(deviceIdStr ?? "nil"), status=\(statusStr)")

                    Task { @MainActor in
                        // If this is an offline status for our active device, disconnect immediately
                        if statusStr == "offline",
                           let deviceIdStr = deviceIdStr,
                           let deviceId = UUID(uuidString: deviceIdStr),
                           MultiConnectionManager.shared.activeDeviceId == deviceId {
                            self.logger.warning("Active device went offline, disconnecting")
                            MultiConnectionManager.shared.removeConnection(deviceId: deviceId)
                        }

                        // Always refresh device list to update statuses
                        await DeviceDiscoveryService.shared.refreshDevices()

                        // Also check if active device was removed from list
                        if let activeId = MultiConnectionManager.shared.activeDeviceId {
                            let ids = DeviceDiscoveryService.shared.devices.map { $0.deviceId }
                            if !ids.contains(activeId) {
                                MultiConnectionManager.shared.removeConnection(deviceId: activeId)
                            }
                        }
                    }

                case "device-unlinked":
                    // Handle device unlinked - refresh list and potentially disconnect if it's active device
                    if let deviceIdStr = dict["deviceId"] as? String,
                       let deviceId = UUID(uuidString: deviceIdStr) {
                        self.logger.info("Device \(deviceIdStr) was unlinked")

                        // If it's the currently active device, handle disconnection
                        if MultiConnectionManager.shared.activeDeviceId == deviceId {
                            MultiConnectionManager.shared.removeConnection(deviceId: deviceId)
                        }

                        // Refresh device list
                        Task { @MainActor in
                            await DeviceDiscoveryService.shared.refreshDevices()
                        }
                    }

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
                    if let projectDir = dict["projectDirectory"] as? String, !projectDir.isEmpty {
                        if self.currentProject?.directory == projectDir {
                            break
                        }
                        let name = URL(fileURLWithPath: projectDir).lastPathComponent
                        let hash = String(projectDir.hashValue)
                        let project = ProjectInfo(name: name, directory: projectDir, hash: hash)
                        self.setCurrentProject(project)
                        AppState.shared.setSelectedProjectDirectory(projectDir)
                    }

                case "session-created", "session-updated", "session-deleted",
                     "session-history-synced", "session:auto-files-applied":
                    self.sessionService.applyRelayEvent(event)

                case "session-files-updated":
                    self.sessionService.applyRelayEvent(event)
                    self.filesService.performSearch(query: self.filesService.currentSearchTerm)

                case "active-session-changed":
                    if let sessionId = dict["sessionId"] as? String,
                       let projectDir = dict["projectDirectory"] as? String {
                        if self.sessionService.currentSession?.id == sessionId { return }
                        Task {
                            await self.loadSessionFromDesktop(sessionId: sessionId, projectDirectory: projectDir)

                            // Start session-scoped sync (sets active session, fetches jobs, starts validation timer)
                            self.jobsService.startSessionScopedSync(sessionId: sessionId, projectDirectory: projectDir)
                        }
                    }

                case "PlanCreated", "PlanModified", "PlanDeleted":
                    self.jobsService.applyRelayEvent(event)

                default:
                    if eventType.hasPrefix("job:") {
                        // Extract event sessionId to seed JobsDataService if needed
                        let eventSessionId = dict["sessionId"] as? String
                            ?? (dict["job"] as? [String: Any])?["sessionId"] as? String

                        // Seed JobsDataService active session if unset and event matches current session
                        if self.jobsService.activeSessionId == nil,
                           let eventSessionId = eventSessionId,
                           eventSessionId == self.sessionService.currentSession?.id,
                           let projectDir = self.sessionService.currentSession?.projectDirectory {
                            self.jobsService.setActiveSession(sessionId: eventSessionId, projectDirectory: projectDir)
                        }

                        self.jobsService.applyRelayEvent(event)
                    }
                }
            }
    }

    private func handleConnectionStateChange(connected: Bool) {
        // CRITICAL: Update connection status immediately so UI reflects actual state
        Task { @MainActor [weak self] in
            self?.updateConnectionStatus(connected: connected)
        }

        if connected {
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                if let last = lastReconnectionSyncAt,
                   Date().timeIntervalSince(last) < 3.0 {
                    return
                }
                lastReconnectionSyncAt = Date()

                // Early guards: prevent connection handler from running during initial bootstrap
                if AppState.shared.bootstrapState == .running {
                    logger.info("Bootstrap is running - skipping connection state change handler")
                    return
                }

                // If initial load not completed, trigger orchestrator instead of handling here
                guard self.hasCompletedInitialLoad else {
                    self.triggerOrchestratorIfNeeded(context: "connection")
                    return
                }

                logger.info("Connection established - starting reconnection sync")

                await self.sessionService.processOfflineQueue()
                // Terminal bootstrap handled by TerminalDataService itself

                if let project = self.currentProject {
                    if self.sessionService.hasRecentSessionsFetch(for: project.directory, within: 10.0) {
                        logger.info("Skipping session preload - recently fetched")
                    } else {
                        logger.info("Preloading sessions for project: \(project.name)")
                        try? await self.sessionService.fetchSessions(projectDirectory: project.directory)
                    }
                }

                // Guard session before preloading jobs
                guard let session = self.sessionService.currentSession else {
                    logger.info("Skipping jobs preload - no valid session available")
                    return
                }

                // Start session-scoped sync to reconcile any missed events post-reconnect
                self.jobsService.startSessionScopedSync(sessionId: session.id, projectDirectory: session.projectDirectory)
                self.filesService.performSearch(query: self.filesService.currentSearchTerm)
                if let projectDirectory = self.currentProject?.directory {
                    self.taskSyncService.getActiveTasks(request: GetActiveTasksRequest(
                        sessionIds: nil,
                        deviceId: self.deviceId,
                        projectDirectory: projectDirectory,
                        includeInactive: false
                    ))
                    .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
                    .store(in: &self.cancellables)
                }

                // Explicitly refresh data to catch any missed events while in background
                self.jobsService.onConnectionRestored()
                self.sessionService.onConnectionRestored()
            }
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

    private func preloadProjectData(_ project: ProjectInfo) {
        // Preload jobs ONLY if session is available
        if let sessionId = self.sessionService.currentSession?.id, !sessionId.isEmpty {
            // Check if sessionId starts with "mobile-session-"
            let isMobileSession = sessionId.hasPrefix("mobile-session-")

            // Set effectiveSessionId to nil for mobile sessions, otherwise use the real session ID
            let effectiveSessionId: String? = isMobileSession ? nil : sessionId

            jobsService.listJobs(request: JobListRequest(
                projectDirectory: project.directory,
                sessionId: effectiveSessionId
            ))
            .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
            .store(in: &cancellables)
        }

        // Always allow file preloads
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
        connectionStatus = ConnectionStatus(
            mode: connected ? .direct(url: apiClient.endpoint) : .offline,
            isConnected: connected,
            lastConnectedAt: connected ? Date() : connectionStatus.lastConnectedAt,
            latencyMs: nil
        )
    }

    private func gatherProjectData(_ project: ProjectInfo) async throws -> ProjectExportData {
        // This would gather data from all services for export
        return ProjectExportData(
            project: project,
            jobs: [],
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

    public var subscriptionGate: SubscriptionGate {
        SubscriptionGate(manager: subscriptionManager)
    }

    public func ensureFreshSubscriptionStatus() async {
        await subscriptionManager.refreshStatus()
    }

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
    public let sqliteConnected: Bool
    public let lastChecked: Date

    public var allConnected: Bool {
        jobsConnected && tasksConnected && filesConnected && sqliteConnected
    }

    public var connectedServicesCount: Int {
        [jobsConnected, tasksConnected, filesConnected, sqliteConnected].filter { $0 }.count
    }

    public var totalServicesCount: Int { 4 }
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
    public let tasks: [TaskDescription]
    public let exportedAt: Date
}
