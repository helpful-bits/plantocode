import Foundation
import Combine
import Core
import UIKit

@MainActor
final class SessionWorkspaceViewModel: ObservableObject {
    @Published var currentSession: Session?
    @Published var taskText = ""
    @Published var errorMessage: String?
    @Published var showingSessionSelector = false
    @Published var selectedTab = 0
    @Published var showingDeviceSelection = false
    @Published var isOfflineMode = false
    @Published var activeSyncSessionId: String?
    @Published var isReceivingRemoteUpdate = false
    @Published var isLoadingSession = false
    @Published var showingPaywall = false

    @Published var reconnectionSuccess: Bool?
    @Published var reconnectionMessage: String?
    @Published var showFullConnectionBanner: Bool = false
    @Published var previousWorkspaceConnectivityState: WorkspaceConnectivityState? = nil

    @Published var pendingRemoteTaskDescription: String?
    @Published var lastSyncedSessionId: String?

    @Published var workflowJobCount: Int = 0
    @Published var implementationPlanCount: Int = 0

    private var container: AppContainer?
    private var multiConnectionManager = MultiConnectionManager.shared
    private var appState = AppState.shared
    private var cancellables = Set<AnyCancellable>()

    var currentProjectDirectory: String {
        container?.currentProject?.directory ?? appState.selectedProjectDirectory ?? ""
    }

    var workspaceConnectivityState: WorkspaceConnectivityState {
        multiConnectionManager.workspaceConnectivityState(forOfflineMode: isOfflineMode)
    }

    var shouldShowInlineBanner: Bool {
        switch workspaceConnectivityState {
        case .healthy:
            return false
        case .transientReconnecting:
            return true
        case .degradedDisconnected:
            return true
        case .offlineModeCandidate:
            return true
        }
    }

    var shouldShowConnectionOverlay: Bool {
        reconnectionSuccess != nil || isOfflineMode || showFullConnectionBanner
    }

    func configure(container: AppContainer) {
        self.container = container

        container.jobsService.$sessionActiveWorkflowJobs
            .assign(to: &$workflowJobCount)

        container.jobsService.$sessionActiveImplementationPlans
            .assign(to: &$implementationPlanCount)

        container.sessionService.currentSessionPublisher
            .compactMap { $0 }
            .sink { [weak self] newSession in
                self?.handleSessionUpdate(newSession)
            }
            .store(in: &cancellables)

        appState.$deepLinkRoute
            .compactMap { $0 }
            .sink { [weak self] route in
                Task { await self?.handleDeepLink(route) }
            }
            .store(in: &cancellables)

        multiConnectionManager.$connectionStates
            .sink { [weak self] states in
                self?.handleConnectionStatesChange(states)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.handleAppWillEnterForeground()
            }
            .store(in: &cancellables)

        container.$currentProject
            .sink { [weak self] newProject in
                self?.handleProjectChange(newProject)
            }
            .store(in: &cancellables)

        container.$isInitializing
            .sink { [weak self] initializing in
                self?.handleInitializationChange(initializing)
            }
            .store(in: &cancellables)
    }

    func onAppear() {
        Task {
            await container?.subscriptionManager.refreshStatus()
        }
    }

    func onDisappear() {
        stopCurrentSync()
    }

    func handleSelectedTabChange(_ newTab: Int) {
        guard let container = container else { return }
        let gate = container.subscriptionGate

        if [1, 2, 3].contains(newTab),
           gate.shouldShowPaywallForFeatureAccess() {
            selectedTab = 0
            showingPaywall = true
        }
    }

    func handleWorkspaceConnectivityStateChange(_ newState: WorkspaceConnectivityState) {
        let oldState = previousWorkspaceConnectivityState
        previousWorkspaceConnectivityState = newState

        switch (oldState, newState) {
        case (.some(.healthy), .transientReconnecting),
             (.some(.offlineModeCandidate), .transientReconnecting),
             (nil, .transientReconnecting):
            handleEnterTransientReconnecting()
        case (_, .healthy):
            handleEnterHealthy()
        case (.some(.transientReconnecting), .degradedDisconnected):
            handleEscalateToDegraded()
        case (_, .degradedDisconnected):
            handleEnterDegraded()
        case (_, .offlineModeCandidate):
            handleEnterOfflineMode()
        default:
            break
        }
    }

    private func handleSessionUpdate(_ newSession: Session) {
        currentSession = newSession
        let incoming = newSession.taskDescription ?? ""
        if taskText != incoming {
            taskText = incoming
        }
    }

    private func handleConnectionStatesChange(_ states: [UUID: ConnectionState]) {
        guard let activeId = multiConnectionManager.activeDeviceId,
              let state = states[activeId] else { return }

        if state.isConnected {
            loadMostRecentSession()
        }
    }

    private func handleAppWillEnterForeground() {
        Task {
            if let deviceId = multiConnectionManager.activeDeviceId {
                try? await Task.sleep(nanoseconds: 500_000_000)
                _ = await multiConnectionManager.addConnection(for: deviceId)

                container?.jobsService.onConnectionRestored()
                container?.sessionService.onConnectionRestored()
            }
        }
    }

    private func handleProjectChange(_ newProject: ProjectInfo?) {
        if let oldSession = currentSession,
           oldSession.projectDirectory != newProject?.directory {
            currentSession = nil
            Task { @MainActor in
                container?.sessionService.currentSession = nil
            }
            taskText = ""
            pendingRemoteTaskDescription = nil
            lastSyncedSessionId = nil
        }
        loadMostRecentSession()
    }

    private func handleInitializationChange(_ initializing: Bool) {
        if !initializing && container?.hasCompletedInitialLoad == true && currentSession == nil {
            loadMostRecentSession()
        }
    }

    private func handleEnterHealthy() {
        showFullConnectionBanner = false
    }

    private func handleEnterTransientReconnecting() {
        let capturedDeviceId = multiConnectionManager.activeDeviceId
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard capturedDeviceId == multiConnectionManager.activeDeviceId,
                  workspaceConnectivityState == .transientReconnecting else { return }
            showFullConnectionBanner = true
        }
    }

    private func handleEnterDegraded() {
        showFullConnectionBanner = true
    }

    private func handleEscalateToDegraded() {
        handleEnterDegraded()
    }

    private func handleEnterOfflineMode() {
        showFullConnectionBanner = true
    }

    func checkConnectionAndLoad() {
        if let deviceId = multiConnectionManager.activeDeviceId {
            if let state = multiConnectionManager.connectionStates[deviceId], state.isConnected {
                loadMostRecentSession()
            } else {
                Task {
                    _ = await multiConnectionManager.addConnection(for: deviceId)
                }
            }
        } else {
            showingDeviceSelection = true
        }
    }

    func loadMostRecentSession() {
        guard !isLoadingSession else {
            return
        }

        guard currentSession == nil else {
            return
        }

        guard container?.isInitializing == false else {
            return
        }

        Task {
            isLoadingSession = true

            defer {
                Task { @MainActor in
                    isLoadingSession = false
                }
            }

            do {
                guard !currentProjectDirectory.isEmpty else {
                    return
                }

                guard let sessions = try await container?.sessionService.fetchSessions(projectDirectory: currentProjectDirectory) else {
                    return
                }

                if let mostRecent = sessions.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
                    loadSession(mostRecent)
                }
            } catch {
                errorMessage = "Failed to load sessions: \(error.localizedDescription)"
            }
        }
    }

    func loadSession(_ session: Session) {
        currentSession = session
        taskText = session.taskDescription ?? ""
        errorMessage = nil

        let dir = session.projectDirectory
        if container?.currentProject?.directory != dir {
            let name = URL(fileURLWithPath: dir).lastPathComponent
            let hash = String(dir.hashValue)
            container?.setCurrentProject(ProjectInfo(name: name, directory: dir, hash: hash))
        }

        container?.jobsService.setActiveSession(
            sessionId: session.id,
            projectDirectory: session.projectDirectory
        )

        // Preload model settings for Plans tab - runs in background
        Task {
            await preloadModelSettings(projectDirectory: session.projectDirectory)
        }

        Task {
            do {
                if let fullSession = try await container?.sessionService.getSession(id: session.id) {
                    currentSession = fullSession
                    taskText = fullSession.taskDescription ?? ""

                    container?.sessionService.currentSession = fullSession

                    container?.jobsService.setActiveSession(
                        sessionId: fullSession.id,
                        projectDirectory: fullSession.projectDirectory
                    )
                }
            } catch {
                container?.sessionService.currentSession = session
            }
        }
    }

    /// Preloads model providers and project settings for the Plans tab
    private func preloadModelSettings(projectDirectory: String) async {
        guard let settingsService = container?.settingsService else { return }

        do {
            // Fetch providers and project settings in parallel
            async let providersTask: () = settingsService.fetchProviders()
            async let settingsTask: () = settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDirectory)
            _ = try await (providersTask, settingsTask)
        } catch {
            // Preloading failed - Plans tab will fetch on demand
        }
    }

    func handleDeepLink(_ route: AppState.DeepLinkRoute) async {
        switch route {
        case let .filesSelected(sessionId, _):
            if currentSession?.id != sessionId {
                try? await Task.sleep(nanoseconds: 50_000_000)
                self.currentSession = container?.sessionService.currentSession
            }

            self.selectedTab = 1
            container?.filesService.currentFilterMode = "selected"
            appState.clearDeepLinkRoute()

        case let .openPlan(sessionId, _, jobId):
            if currentSession?.id != sessionId {
                try? await Task.sleep(nanoseconds: 50_000_000)
                self.currentSession = container?.sessionService.currentSession
            }

            self.selectedTab = 2
            appState.setPendingPlanToOpen(jobId)
            appState.clearDeepLinkRoute()
        }
    }

    func createImplementationPlan() {
        guard let session = currentSession else { return }

        if isOfflineMode {
            errorMessage = "Cannot create plans in offline mode. Connect to a device to continue."
            return
        }

        Task {
            do {
                let stream = CommandRouter.actionsCreateImplementationPlan(
                    sessionId: session.id,
                    taskDescription: taskText,
                    projectDirectory: session.projectDirectory,
                    relevantFiles: session.includedFiles
                )

                for try await response in stream {
                    if let error = response.error {
                        errorMessage = "Failed to create plan: \(error.message)"
                        return
                    }
                    if response.isFinal {
                        break
                    }
                }
            } catch {
                if let relayError = error as? ServerRelayError {
                    switch relayError {
                    case .notConnected:
                        errorMessage = "No active device connection"
                    default:
                        errorMessage = error.localizedDescription
                    }
                } else {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    func startSyncIfNeeded() {
        return
    }

    func stopCurrentSync() {
        return
    }

    func reconnect() {
        Task {
            reconnectionSuccess = nil
            reconnectionMessage = nil

            guard let activeDeviceId = multiConnectionManager.activeDeviceId else {
                return
            }

            let result = await multiConnectionManager.addConnection(for: activeDeviceId)

            switch result {
            case .success:
                reconnectionSuccess = true
                reconnectionMessage = "Reconnected successfully"

            case .failure(let error):
                reconnectionSuccess = false

                if let relayError = error as? ServerRelayError {
                    reconnectionMessage = ConnectivityDiagnostics.userFriendlyMessage(for: relayError)
                } else if let multiError = error as? MultiConnectionError {
                    switch multiError {
                    case .authenticationRequired:
                        reconnectionMessage = "Authentication required. Please sign in again."
                    case .invalidConfiguration:
                        reconnectionMessage = "Invalid server configuration. Check your settings."
                    case .connectionFailed(let reason):
                        reconnectionMessage = "Connection failed: \(reason). Ensure desktop app is running."
                    case .deviceNotFound:
                        reconnectionMessage = "Device not found. Try selecting a different device."
                    }
                } else {
                    reconnectionMessage = "Connection failed: \(error.localizedDescription). Check network and desktop app."
                }
            }
        }
    }

    func dismissFailure() {
        reconnectionSuccess = nil
        reconnectionMessage = nil
    }

    func goOnline() {
        isOfflineMode = false
        showingDeviceSelection = true
    }
}
