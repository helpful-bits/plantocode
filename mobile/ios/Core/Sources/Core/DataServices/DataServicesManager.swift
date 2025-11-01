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
    private var isInitialProjectFetchInProgress = false
    private var lastAppliedConnectedState: Bool? = nil
    private var isPerformingLiveBootstrap = false
    private var lastSwitchDeviceId: UUID?
    private var lastSwitchAt: Date?
    private var orchestratorTriggerInFlight = false
    private var authStateCancellable: AnyCancellable?

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
        // Only update if project actually changed
        guard currentProject?.directory != project.directory else {
            return
        }

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
        sessionService.currentSession = nil
        sessionService.sessions = []

        jobsService.clearJobs()

        plansService.invalidateCache()
        plansService.plans.removeAll()

        filesService.invalidateCache()
        filesService.files = []
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

        plansService.plans.removeAll()

        taskSyncService.tasks.removeAll()
        taskSyncService.conflicts.removeAll()

        NotificationCenter.default.post(name: Notification.Name("connection-hard-reset-completed"), object: nil)
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

    /// Perform live bootstrap - fetch session sequentially, then rely on broadcasting to preload plans/jobs
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

        // Fetch active session - broadcasting will handle plans/jobs/files preload
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
        
        self.plansService.onActiveDeviceChanged(newId)
        if let project = self.currentProject {
            self.plansService.preloadPlans(
                for: project.directory,
                sessionId: self.sessionService.currentSession?.id
            )
        }
        
        // Trigger orchestrator once
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
                    self.logger.info("Received device-status event")
                    Task { @MainActor in
                        await DeviceDiscoveryService.shared.refreshDevices()
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
                    // Handle project directory changes from desktop/other devices
                    if let projectDir = dict["projectDirectory"] as? String, !projectDir.isEmpty {
                        if self.currentProject?.directory == projectDir {
                            break
                        }
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
                     "session-history-synced", "session:auto-files-applied":
                    // Use incremental updates instead of full refetch
                    self.sessionService.applyRelayEvent(event)

                case "session-files-updated":
                    // Use incremental updates
                    self.sessionService.applyRelayEvent(event)
                    // Trigger files refresh after session-files-updated to update the "Selected" area in the Files tab
                    self.filesService.performSearch(query: self.filesService.currentSearchTerm)

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
        if connected {
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                // Early guards: prevent connection handler from running during initial bootstrap
                if AppState.shared.bootstrapState == .running {
                    logger.info("Bootstrap is running - skipping connection state change handler")
                    return
                }
                guard self.hasCompletedInitialLoad else {
                    self.triggerOrchestratorIfNeeded(context: "connection")
                    return
                }

                logger.info("Connection established - starting reconnection sync")

                await self.sessionService.processOfflineQueue()
                // Terminal bootstrap handled by TerminalDataService itself

                // Guard: Skip initial fetch if orchestrator has already set state
                if !self.hasCompletedInitialLoad && self.currentProject == nil {
                    logger.info("Fetching initial project directory from desktop")
                    await self.fetchInitialProjectDirectory()
                    logger.info("Completed fetching initial project directory")
                } else {
                    logger.info("Skipping initial fetch - state already set by orchestrator")
                }

                if let project = self.currentProject {
                    if self.sessionService.hasRecentSessionsFetch(for: project.directory, within: 10.0) {
                        logger.info("Skipping session preload - recently fetched")
                    } else {
                        logger.info("Preloading sessions for project: \(project.name)")
                        try? await self.sessionService.fetchSessions(projectDirectory: project.directory)
                    }
                }

                // Guard session before preloading plans/jobs
                guard let session = self.sessionService.currentSession else {
                    logger.info("Skipping plans/jobs preload - no valid session available")
                    return
                }

                // Ensure JobsDataService accepts job events post-reconnect
                self.jobsService.setActiveSession(sessionId: session.id, projectDirectory: session.projectDirectory)

                // Trigger a one-time snapshot refresh for the active session to reconcile any missed events
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
        if AppState.shared.bootstrapState == .running { return }
        guard !isInitialProjectFetchInProgress else { return }
        isInitialProjectFetchInProgress = true
        defer { isInitialProjectFetchInProgress = false }

        guard MultiConnectionManager.shared.activeDeviceId != nil else {
            logger.info("No active device selected, skipping initial project fetch")
            return
        }

        let startTime = Date()
        let timeout: TimeInterval = 8.0
        var isConnected = false

        while Date().timeIntervalSince(startTime) < timeout {
            if let activeId = MultiConnectionManager.shared.activeDeviceId,
               case .connected = MultiConnectionManager.shared.connectionStates[activeId] {
                isConnected = true
                break
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }

        guard isConnected else {
            logger.info("Connection not established within \(timeout)s, deferring initial project fetch to connection handler")
            return
        }

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
            let errorMessage = error.localizedDescription
            if errorMessage.contains("Not connected") {
                logger.debug("Connection not ready for initial project fetch (transient): \(errorMessage)")
            } else {
                logger.error("Failed to fetch initial project directory: \(errorMessage)")
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
        // Preload plans/jobs ONLY if session is available
        if let sessionId = self.sessionService.currentSession?.id, !sessionId.isEmpty {
            plansService.preloadPlans(
                for: project.directory,
                sessionId: sessionId
            )
            jobsService.listJobs(request: JobListRequest(
                projectDirectory: project.directory,
                sessionId: sessionId
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
