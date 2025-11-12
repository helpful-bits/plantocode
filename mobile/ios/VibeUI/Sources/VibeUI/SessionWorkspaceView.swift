import SwiftUI
import Core
import Combine
import UIKit

/// Mobile-optimized workspace view with tab navigation for better UX
/// Uses bottom navigation tabs to separate concerns and reduce scrolling
///
/// External Update Gate: Remote task description updates are deferred while
/// the text field is focused to prevent cursor jumps during active typing.
/// Pending updates are flushed when the keyboard dismisses.
public struct SessionWorkspaceView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var voiceDictationService = VoiceDictationService.shared
    @StateObject private var textEnhancementService = TextEnhancementService.shared
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @ObservedObject private var appState = AppState.shared

    @State private var currentSession: Session?
    @State private var taskText = ""
    @State private var errorMessage: String?
    @State private var showingSessionSelector = false
    @State private var selectedTab = 0
    @State private var showingDeviceSelection = false
    @State private var isOfflineMode = false
    @State private var activeSyncSessionId: String?
    @State private var isReceivingRemoteUpdate = false
    @State private var reconnectionSuccess: Bool?
    @State private var reconnectionMessage: String?
    @State private var isLoadingSession = false
    @State private var showingPaywall = false

    // External update gate for cursor stability (matching desktop behavior)
    @State private var pendingRemoteTaskDescription: String?
    @State private var lastSyncedSessionId: String?

    let autoPresentDeviceSelection: Bool

    private var currentProjectDirectory: String {
        container.currentProject?.directory ?? appState.selectedProjectDirectory ?? ""
    }

    private var mainContentView: some View {
        ZStack {
            sessionContentView
            connectionStatusOverlay
        }
    }

    private var sessionContentView: some View {
        Group {
            if let session = currentSession {
                tabsView(for: session)
            } else {
                EmptySessionView(onSelectSession: { showingSessionSelector = true })
            }
        }
    }

    private func tabsView(for session: Session) -> some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Task Description (Updated with TaskInputView)
            TaskTab(
                session: session,
                taskText: $taskText,
                onSessionChange: { showingSessionSelector = true }
            )
            .tabItem {
                Label("Task", systemImage: "square.and.pencil")
            }
            .tag(0)

            // Tab 2: Files - No lazy loading to ensure onReceive handlers fire
            FilesTab(
                session: session,
                isOfflineMode: isOfflineMode,
                jobsService: container.jobsService
            )
            .tabItem {
                Label("Files", systemImage: "doc.text")
            }
            .tag(1)

            // Tab 3: Plans - No lazy loading to ensure onReceive handlers fire
            PlansTab(
                session: session,
                taskText: taskText,
                onCreatePlan: createImplementationPlan,
                isOfflineMode: isOfflineMode
            )
            .tabItem {
                Label("Plans", systemImage: "list.bullet.rectangle")
            }
            .tag(2)

            // Tab 4: Jobs - No lazy loading to ensure onReceive handlers fire
            JobsTab(
                session: session,
                isOfflineMode: isOfflineMode,
                jobsService: container.jobsService
            )
            .tabItem {
                Label("Jobs", systemImage: "chart.bar.doc.horizontal")
            }
            .tag(3)

            // Tab 5: Settings
            SettingsView()
            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
            .tag(4)
        }
        .tint(Color.primary)
    }

    private var connectionStatusOverlay: some View {
        VStack(spacing: 0) {
            successBannerView
            connectionBannerView
            Spacer()
        }
    }

    @ViewBuilder
    private var successBannerView: some View {
        if let success = reconnectionSuccess, success, let message = reconnectionMessage {
            ReconnectionSuccessBanner(message: message)
                .onAppear {
                    // Auto-dismiss after 2 seconds
                    Task {
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        await MainActor.run {
                            reconnectionSuccess = nil
                            reconnectionMessage = nil
                        }
                    }
                }
        }
    }

    @ViewBuilder
    private var connectionBannerView: some View {
        if isOfflineMode {
            OfflineModeBanner(onGoOnline: {
                isOfflineMode = false
                showingDeviceSelection = true
            })
        } else if let activeDeviceId = multiConnectionManager.activeDeviceId,
           let connectionState = multiConnectionManager.connectionStates[activeDeviceId],
           !connectionState.isConnected {
            ConnectionStatusBanner(
                state: connectionState,
                failureMessage: reconnectionSuccess == false ? reconnectionMessage : nil,
                onReconnect: {
                    Task {
                        // Clear previous messages
                        await MainActor.run {
                            reconnectionSuccess = nil
                            reconnectionMessage = nil
                        }

                        let result = await multiConnectionManager.addConnection(for: activeDeviceId)

                        await MainActor.run {
                            switch result {
                            case .success:
                                reconnectionSuccess = true
                                reconnectionMessage = "Reconnected successfully"

                            case .failure(let error):
                                reconnectionSuccess = false

                                // Generate diagnostic message based on error type
                                if let multiError = error as? MultiConnectionError {
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
                },
                onDismissFailure: {
                    reconnectionSuccess = nil
                    reconnectionMessage = nil
                }
            )
        }
    }

    public init(autoPresentDeviceSelection: Bool = true) {
        self.autoPresentDeviceSelection = autoPresentDeviceSelection
    }

    public var body: some View {
        configuredMainView
    }

    private var configuredMainView: some View {
        mainContentView
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .modifier(SyncLifecycleModifier(
                selectedTab: $selectedTab,
                currentSessionId: currentSession?.id,
                pendingRemoteTaskDescription: $pendingRemoteTaskDescription,
                lastSyncedSessionId: $lastSyncedSessionId,
                startSync: startSyncIfNeeded,
                stopSync: stopCurrentSync
            ))
            .modifier(SheetModifier(
                showingSessionSelector: $showingSessionSelector,
                showingDeviceSelection: $showingDeviceSelection,
                currentProjectDirectory: currentProjectDirectory,
                loadSession: loadSession
            ))
            .modifier(SessionUpdateModifier(
                container: container,
                appState: appState,
                currentSession: $currentSession,
                taskText: $taskText,
                errorMessage: $errorMessage,
                showingDeviceSelection: $showingDeviceSelection,
                isOfflineMode: $isOfflineMode,
                handleDeepLink: handleDeepLink
            ))
            .modifier(ConnectionModifier(
                container: container,
                multiConnectionManager: multiConnectionManager,
                loadMostRecentSession: loadMostRecentSession,
                checkConnectionAndLoad: checkConnectionAndLoad
            ))
            .modifier(TaskSyncModifier(
                container: container,
                currentSession: currentSession,
                taskText: $taskText,
                pendingRemoteTaskDescription: $pendingRemoteTaskDescription
            ))
            .modifier(ProjectChangeModifier(
                container: container,
                currentSession: $currentSession,
                loadMostRecentSession: loadMostRecentSession
            ))
            .onChange(of: selectedTab) { newTab in
                // Gate interactive tabs (Files, Plans, Jobs) - tabs 1, 2, 3
                if [1, 2, 3].contains(newTab) {
                    if !container.subscriptionManager.status.isActive {
                        showingPaywall = true
                    }
                }
            }
            .sheet(isPresented: $showingPaywall) {
                PaywallView()
                    .environmentObject(container)
            }
            .onAppear {
                // Check subscription status on initial load
                Task {
                    await container.subscriptionManager.refreshStatus()
                }
            }
    }

    // MARK: - Helper Methods

    private func checkConnectionAndLoad() {
        if let deviceId = multiConnectionManager.activeDeviceId {
            if let state = multiConnectionManager.connectionStates[deviceId], state.isConnected {
                loadMostRecentSession()
            } else {
                Task {
                    _ = await multiConnectionManager.addConnection(for: deviceId)
                }
            }
        } else if autoPresentDeviceSelection {
            showingDeviceSelection = true
        }
    }

    private func loadMostRecentSession() {
        // Prevent multiple simultaneous loads
        guard !isLoadingSession else {
            return
        }

        // Prevent loading if we already have a session
        guard currentSession == nil else {
            return
        }

        // Wait for initialization to complete
        guard !container.isInitializing else {
            return
        }

        Task {
            await MainActor.run {
                isLoadingSession = true
            }

            defer {
                Task { @MainActor in
                    isLoadingSession = false
                }
            }

            do {
                guard !currentProjectDirectory.isEmpty else {
                    return
                }

                let sessions = try await container.sessionService.fetchSessions(projectDirectory: currentProjectDirectory)

                if let mostRecent = sessions.sorted(by: { $0.updatedAt > $1.updatedAt }).first {
                    await MainActor.run {
                        loadSession(mostRecent)
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to load sessions: \(error.localizedDescription)"
                }
            }
        }
    }

    private func loadSession(_ session: Session) {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)

        currentSession = session
        taskText = session.taskDescription ?? ""
        errorMessage = nil

        let dir = session.projectDirectory
        if container.currentProject?.directory != dir {
            let name = URL(fileURLWithPath: dir).lastPathComponent
            let hash = String(dir.hashValue)
            container.setCurrentProject(ProjectInfo(name: name, directory: dir, hash: hash))
        }

        container.jobsService.setActiveSession(
            sessionId: session.id,
            projectDirectory: session.projectDirectory
        )

        Task {
            do {
                if let fullSession = try await container.sessionService.getSession(id: session.id) {
                    await MainActor.run {
                        currentSession = fullSession
                        taskText = fullSession.taskDescription ?? ""

                        container.sessionService.currentSession = fullSession

                        container.jobsService.setActiveSession(
                            sessionId: fullSession.id,
                            projectDirectory: fullSession.projectDirectory
                        )
                    }
                }
            } catch {
                await MainActor.run {
                    container.sessionService.currentSession = session
                }
            }
        }
    }

    private func handleDeepLink(_ route: AppState.DeepLinkRoute) async {
        switch route {
        case let .filesSelected(sessionId, _):
            // Check if we need to adopt an externally loaded session
            if currentSession?.id != sessionId {
                // Give time for session service to publish
                try? await Task.sleep(nanoseconds: 50_000_000)
                self.currentSession = container.sessionService.currentSession
            }

            // Navigate to Files tab and set filter to Selected
            self.selectedTab = 1
            container.filesService.currentFilterMode = "selected"
            appState.clearDeepLinkRoute()

        case let .openPlan(sessionId, _, jobId):
            // Check if we need to adopt an externally loaded session
            if currentSession?.id != sessionId {
                // Give time for session service to publish
                try? await Task.sleep(nanoseconds: 50_000_000)
                self.currentSession = container.sessionService.currentSession
            }

            // Navigate to Plans tab and set pending plan
            self.selectedTab = 2
            appState.setPendingPlanToOpen(jobId)
            appState.clearDeepLinkRoute()
        }
    }

    private func createImplementationPlan() {
        guard let session = currentSession else { return }

        // Check if in offline mode
        if isOfflineMode {
            errorMessage = "Cannot create plans in offline mode. Connect to a device to continue."
            return
        }

        guard let deviceId = multiConnectionManager.activeDeviceId,
              let relayClient = multiConnectionManager.relayConnection(for: deviceId) else {
            errorMessage = "No active device connection"
            return
        }

        let request = RpcRequest(
            method: "actions.createImplementationPlan",
            params: [
                "sessionId": session.id,
                "taskDescription": taskText,
                "projectDirectory": session.projectDirectory,
                "relevantFiles": session.includedFiles
            ]
        )

        Task {
            do {
                for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                    if let error = response.error {
                        await MainActor.run {
                            errorMessage = "Failed to create plan: \(error.message)"
                        }
                        return
                    }
                    if response.isFinal {
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Failed to create plan: \(error.localizedDescription)"
                }
            }
        }
    }

    // MARK: - Sync Management

    private func startSyncIfNeeded() {
        return
    }

    private func stopCurrentSync() {
        return
    }
}

// MARK: - Task Tab (Using TaskInputView)

struct TaskTab: View {
    @EnvironmentObject private var container: AppContainer
    let session: Session
    @Binding var taskText: String
    let onSessionChange: () -> Void

    @State private var showingDeviceMenu = false
    @State private var showFindFilesSheet: Bool = false
    @State private var isKeyboardVisible = false
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Session info bar - hide when keyboard is open
                if !isKeyboardVisible {
                    SessionInfoBar(session: session, onTap: onSessionChange)
                }

                // Task Input View - fills remaining space
                TaskInputView(
                    taskDescription: $taskText,
                    placeholder: "Describe your task in detail...",
                    onInteraction: {
                        // Mark session as modified
                        // TODO: Implement auto-save
                    },
                    sessionId: session.id,
                    projectDirectory: session.projectDirectory
                )
                .padding(.horizontal)
                .padding(.bottom)
                .padding(.top, isKeyboardVisible ? 0 : 16)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.background)
            .onTapGesture {
                // Dismiss keyboard when tapping outside
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                withAnimation(.easeOut(duration: 0.25)) {
                    isKeyboardVisible = true
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                withAnimation(.easeOut(duration: 0.25)) {
                    isKeyboardVisible = false
                }
            }
            .navigationTitle("Task Description")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Menu {
                        Section("Device") {
                            if let deviceId = multiConnectionManager.activeDeviceId,
                               let state = multiConnectionManager.connectionStates[deviceId] {
                                Label(
                                    state.isConnected ? "Connected" : "Disconnected",
                                    systemImage: state.isConnected ? "checkmark.circle.fill" : "xmark.circle.fill"
                                )
                                .foregroundColor(state.isConnected ? Color.success : Color.destructive)
                            }

                            Button(action: { showingDeviceMenu = true }) {
                                Label("Switch Device", systemImage: "arrow.triangle.2.circlepath")
                            }
                        }

                        Section("Tools") {
                            Button {
                                showFindFilesSheet = true
                            } label: {
                                Label("Find Files", systemImage: "doc.text.magnifyingglass")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 20))
                    }
                }

            }
            .sheet(isPresented: $showingDeviceMenu) {
                NavigationStack {
                    DeviceSelectionView()
                        .navigationTitle("Switch Device")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showingDeviceMenu = false
                                }
                                .buttonStyle(ToolbarButtonStyle())
                            }
                        }
                }
            }
            .sheet(isPresented: $showFindFilesSheet) {
                if let session = container.sessionService.currentSession {
                    FindFilesWorkflowView(sessionId: session.id,
                                          projectDirectory: session.projectDirectory,
                                          taskDescription: taskText)
                    .environmentObject(container)
                } else {
                    Text("No active session")
                }
            }
        }
    }
}


// MARK: - Files Tab

struct FilesTab: View {
    @EnvironmentObject private var container: AppContainer
    let session: Session
    let isOfflineMode: Bool
    let jobsService: JobsDataService

    var body: some View {
        NavigationStack {
            if isOfflineMode {
                VStack(spacing: 24) {
                    Spacer()

                    Image(systemName: "wifi.slash")
                        .font(.system(size: 48))
                        .foregroundColor(Color.mutedForeground)

                    VStack(spacing: 16) {
                        Text("Offline Mode")
                            .h3()

                        Text("File browsing requires a desktop connection")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .background(Color.background)
                .navigationTitle("Files")
                .navigationBarTitleDisplayMode(.inline)
            } else {
                VStack(spacing: 0) {
                    // Finding files indicator
                    if !isOfflineMode && jobsService.sessionActiveWorkflowJobs > 0 {
                        HStack(spacing: 8) {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                                .scaleEffect(0.7)
                            Text("Finding files… (\(jobsService.sessionActiveWorkflowJobs))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.vertical, 6)
                    }

                    FileManagementView(
                        filesService: container.filesService,
                        jobsService: container.jobsService
                    )
                }
                .navigationTitle("Files")
                .navigationBarTitleDisplayMode(.inline)
                .onAppear {
                    if let session = container.sessionService.currentSession {
                        container.jobsService.setActiveSession(
                            sessionId: session.id,
                            projectDirectory: session.projectDirectory
                        )
                    }
                }
            }
        }
    }
}

struct FileRowView: View {
    let filePath: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: fileIcon)
                .font(.system(size: 20))
                .foregroundColor(Color.primary)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(fileName)
                    .paragraph()
                    .foregroundColor(.primary)

                Text(relativePath)
                    .small()
                    .foregroundColor(Color.mutedForeground)
                    .lineLimit(1)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var fileName: String {
        URL(fileURLWithPath: filePath).lastPathComponent
    }

    private var relativePath: String {
        URL(fileURLWithPath: filePath).deletingLastPathComponent().path
    }

    private var fileIcon: String {
        let ext = URL(fileURLWithPath: filePath).pathExtension
        switch ext {
        case "swift": return "doc.text.fill"
        case "js", "ts", "jsx", "tsx": return "doc.text.fill"
        case "json": return "doc.text.fill"
        default: return "doc.text"
        }
    }
}

// MARK: - Plans Tab

struct PlansTab: View {
    @EnvironmentObject private var container: AppContainer
    let session: Session
    let taskText: String
    let onCreatePlan: () -> Void
    let isOfflineMode: Bool

    var body: some View {
        NavigationStack {
            if isOfflineMode {
                VStack(spacing: 24) {
                    Spacer()

                    Image(systemName: "wifi.slash")
                        .font(.system(size: 48))
                        .foregroundColor(Color.mutedForeground)

                    VStack(spacing: 16) {
                        Text("Offline Mode")
                            .h3()

                        Text("Connect to a desktop device to view implementation plans")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .background(Color.background)
                .navigationTitle("Plans")
                .navigationBarTitleDisplayMode(.inline)
            } else {
                // Wrapper that ensures session is synchronized before rendering
                SessionSynchronizedPlansView(session: session)
            }
        }
    }
}

// Wrapper view that synchronizes session before rendering ImplementationPlansView
private struct SessionSynchronizedPlansView: View {
    @EnvironmentObject private var container: AppContainer
    let session: Session

    var body: some View {
        ImplementationPlansView()
            .navigationTitle("Plans")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                // Synchronize session immediately when view appears
                if container.sessionService.currentSession?.id != session.id {
                    await MainActor.run {
                        container.sessionService.currentSession = session
                    }
                }
            }
    }
}

// MARK: - Jobs Tab

struct JobsTab: View {
    let session: Session
    let isOfflineMode: Bool
    let jobsService: JobsDataService

    var body: some View {
        NavigationStack {
            if isOfflineMode {
                VStack(spacing: 24) {
                    Spacer()

                    Image(systemName: "wifi.slash")
                        .font(.system(size: 48))
                        .foregroundColor(Color.mutedForeground)

                    VStack(spacing: 16) {
                        Text("Offline Mode")
                            .h3()

                        Text("Connect to a desktop device to monitor background jobs")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .background(Color.background)
                .navigationTitle("Jobs")
                .navigationBarTitleDisplayMode(.inline)
            } else {
                JobsMonitoringView(jobsService: jobsService)
                    .navigationTitle("Jobs")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }
}

// MARK: - Supporting Views

struct SessionInfoBar: View {
    let session: Session
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.name)
                        .h4()
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Text(projectName)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .small()
                    .foregroundColor(Color.mutedForeground)
            }
            .padding()
            .background(Color.card)
        }
    }

    private var projectName: String {
        URL(fileURLWithPath: session.projectDirectory).lastPathComponent
    }
}

struct EmptySessionView: View {
    let onSelectSession: () -> Void
    @State private var showingSettingsView = false
    @State private var showingDeviceSelection = false
    @State private var showingMenu = false
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var container: AppContainer
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    // Use computed property based on container state instead of local state
    private var isLoadingProject: Bool {
        return container.isInitializing || (!container.hasCompletedInitialLoad && container.currentProject == nil)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                if isLoadingProject {
                    // Loading state while fetching project from desktop
                    VStack(spacing: 16) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                            .scaleEffect(1.2)

                        VStack(spacing: 8) {
                            Text("Loading Project")
                                .h3()
                                .foregroundColor(Color.cardForeground)

                            Text("Fetching project directory from desktop...")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }
                    }
                } else {
                    // Project Selection Section
                    VStack(spacing: 16) {
                        Image(systemName: "folder.badge.gearshape")
                            .font(.system(size: 48))
                            .foregroundColor(Color.mutedForeground)

                        VStack(spacing: 8) {
                            Text("Set Active Project")
                                .h3()
                                .foregroundColor(Color.cardForeground)

                            Text("Select your project directory to load sessions")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }

                        // Inline Project Selection
                        VStack(alignment: .leading, spacing: 12) {
                            if let currentProject = container.currentProject {
                                Text("Current: \(currentProject.name)")
                                    .paragraph()
                                    .foregroundColor(.secondary)
                            } else {
                                Text("No project selected")
                                    .paragraph()
                                    .foregroundColor(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 40)
                    }

                    VStack(spacing: 12) {
                        Button(action: { showingSettingsView = true }) {
                            HStack {
                                Image(systemName: "folder.badge.gearshape")
                                Text("Select Project Directory")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PrimaryButtonStyle())

                        Button(action: onSelectSession) {
                            HStack {
                                Image(systemName: "list.bullet")
                                Text("Browse Sessions")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(.horizontal, 40)
                }

                Spacer()
            }
            .navigationTitle("Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(action: { showingSettingsView = true }) {
                            Label("Settings", systemImage: "gearshape")
                        }

                        Button(action: { showingDeviceSelection = true }) {
                            Label("Switch Device", systemImage: "desktopcomputer")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingSettingsView) {
                SettingsView()
                    .environmentObject(appState)
                    .environmentObject(container)
            }
            .sheet(isPresented: $showingDeviceSelection) {
                NavigationStack {
                    DeviceSelectionView()
                        .navigationTitle("Select Device")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showingDeviceSelection = false
                                }
                                .buttonStyle(ToolbarButtonStyle())
                            }
                        }
                }
            }
        }
    }
}

struct ConnectionStatusBanner: View {
    let state: ConnectionState
    let failureMessage: String?
    let onReconnect: () -> Void
    let onDismissFailure: () -> Void
    @State private var showingDeviceSelection = false
    @State private var showingHelp = false
    @State private var isReconnecting = false
    @ObservedObject private var appState = AppState.shared

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 16) {
                // Alert message
                HStack(alignment: .top, spacing: 12) {
                    if isReconnecting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.appWarning))
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(Color.appWarning)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(isReconnecting ? "Reconnecting..." : "Disconnected from desktop")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Color.appWarningForeground)

                        Text(isReconnecting ? "Please wait while we restore your connection" : "Reconnect to continue working on your tasks")
                            .font(.system(size: 14))
                            .foregroundColor(Color.appMutedForeground)
                    }

                    Spacer()

                    if failureMessage != nil {
                        Button(action: onDismissFailure) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 20))
                                .foregroundColor(Color.mutedForeground)
                        }
                    }
                }

                // Failure diagnostic message
                if let failureMessage = failureMessage {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "info.circle.fill")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Color.destructive)

                        Text(failureMessage)
                            .font(.system(size: 14))
                            .foregroundColor(Color.cardForeground)
                            .multilineTextAlignment(.leading)

                        Spacer()
                    }
                    .padding(12)
                    .background(Color.destructive.opacity(0.1))
                    .cornerRadius(8)
                }

                // Action buttons
                VStack(spacing: 10) {
                    // Primary action - full width
                    Button(action: {
                        isReconnecting = true
                        Task {
                            onReconnect()
                            // Reset reconnecting state after a delay
                            try? await Task.sleep(nanoseconds: 3_000_000_000) // 3 seconds
                            await MainActor.run {
                                isReconnecting = false
                            }
                        }
                    }) {
                        HStack(spacing: 8) {
                            if isReconnecting {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 16, weight: .semibold))
                            }
                            Text(isReconnecting ? "Reconnecting..." : "Reconnect")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isReconnecting)

                    // Secondary actions - side by side
                    HStack(spacing: 10) {
                        Button(action: { showingDeviceSelection = true }) {
                            HStack(spacing: 6) {
                                Image(systemName: "arrow.triangle.2.circlepath")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Switch Device")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(isReconnecting)

                        Button(action: { showingHelp = true }) {
                            HStack(spacing: 6) {
                                Image(systemName: "questionmark.circle")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Help")
                                    .font(.system(size: 14, weight: .medium))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(isReconnecting)
                    }
                }
            }
            .padding(16)
            .background(Color.appWarningBackground)
        }
        .onChange(of: state) { newState in
            // Reset reconnecting state when connection succeeds
            if newState.isConnected {
                isReconnecting = false
            }
        }
        .sheet(isPresented: $showingDeviceSelection) {
            NavigationStack {
                DeviceSelectionView()
                    .navigationTitle("Select Device")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingDeviceSelection = false
                            }
                            .buttonStyle(ToolbarButtonStyle())
                        }
                    }
            }
        }
        .sheet(isPresented: $showingHelp) {
            TroubleshootingView()
        }
    }
}

struct OfflineModeBanner: View {
    let onGoOnline: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "wifi.slash")
                    .foregroundColor(Color.mutedForeground)

                Text("Offline Mode")
                    .small()
                    .foregroundColor(.primary)

                Spacer()

                Button("Go Online", action: onGoOnline)
                    .small()
                    .buttonStyle(SecondaryButtonStyle())
                    .controlSize(.small)
            }
            .padding()
            .background(Color.mutedForeground.opacity(0.15))
        }
    }
}

struct ReconnectionSuccessBanner: View {
    let message: String

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Color.success)

                Text(message)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Color.successForeground)

                Spacer()
            }
            .padding(16)
            .background(Color.successBackground)
        }
    }
}

// MARK: - View Modifiers

struct SyncLifecycleModifier: ViewModifier {
    @Binding var selectedTab: Int
    let currentSessionId: String?
    @Binding var pendingRemoteTaskDescription: String?
    @Binding var lastSyncedSessionId: String?
    let startSync: () -> Void
    let stopSync: () -> Void

    func body(content: Content) -> some View {
        content
            .onAppear {
                startSync()
            }
            .onChange(of: selectedTab) { newTab in
                if newTab == 0 {
                    startSync()
                } else {
                    stopSync()
                }
            }
            .onChange(of: currentSessionId) { newSessionId in
                stopSync()
                lastSyncedSessionId = newSessionId
                if selectedTab == 0 {
                    startSync()
                }
            }
            .onDisappear {
                stopSync()
            }
    }
}

struct SheetModifier: ViewModifier {
    @Binding var showingSessionSelector: Bool
    @Binding var showingDeviceSelection: Bool
    let currentProjectDirectory: String
    let loadSession: (Session) -> Void

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showingSessionSelector) {
                NavigationStack {
                    SessionSelectionView(
                        projectDirectory: currentProjectDirectory,
                        onSessionSelected: { session in
                            loadSession(session)
                            showingSessionSelector = false
                        }
                    )
                }
            }
            .sheet(isPresented: $showingDeviceSelection) {
                NavigationStack {
                    DeviceSelectionView()
                        .navigationTitle("Switch Device")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showingDeviceSelection = false
                                }
                                .buttonStyle(ToolbarButtonStyle())
                            }
                        }
                }
            }
    }
}

struct SessionUpdateModifier: ViewModifier {
    @ObservedObject var container: AppContainer
    @ObservedObject var appState: AppState
    @Binding var currentSession: Session?
    @Binding var taskText: String
    @Binding var errorMessage: String?
    @Binding var showingDeviceSelection: Bool
    @Binding var isOfflineMode: Bool
    let handleDeepLink: (AppState.DeepLinkRoute) async -> Void

    func body(content: Content) -> some View {
        content
            .onReceive(container.sessionService.currentSessionPublisher.compactMap { $0 }) { newSession in
                // Adopt externally switched session
                currentSession = newSession
                let incoming = newSession.taskDescription ?? ""
                if taskText != incoming {
                    taskText = incoming
                }
            }
            .onReceive(appState.$deepLinkRoute.compactMap { $0 }) { route in
                Task { await handleDeepLink(route) }
            }
            .alert("Error", isPresented: .constant(errorMessage != nil), presenting: errorMessage) { message in
                Button("Select Device") {
                    errorMessage = nil
                    showingDeviceSelection = true
                }
                Button("Try Offline") {
                    errorMessage = nil
                    isOfflineMode = true
                }
                Button("Cancel", role: .cancel) {
                    errorMessage = nil
                }
            } message: { message in
                Text(message)
            }
    }
}

struct ConnectionModifier: ViewModifier {
    @ObservedObject var container: AppContainer
    @ObservedObject var multiConnectionManager: MultiConnectionManager
    let loadMostRecentSession: () -> Void
    let checkConnectionAndLoad: () -> Void

    func body(content: Content) -> some View {
        content
            .onAppear {
                checkConnectionAndLoad()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                // Reconnect when app comes back to foreground
                Task {
                    if let deviceId = multiConnectionManager.activeDeviceId {
                        // Add a small delay to allow the network stack to stabilize
                        try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                        _ = await multiConnectionManager.addConnection(for: deviceId)
                    }
                }
            }
            .onReceive(multiConnectionManager.$connectionStates) { states in
                guard let activeId = multiConnectionManager.activeDeviceId,
                      let state = states[activeId] else { return }

                if state.isConnected {
                    loadMostRecentSession()
                }
            }
    }
}

struct TaskSyncModifier: ViewModifier {
    @ObservedObject var container: AppContainer
    let currentSession: Session?
    @Binding var taskText: String
    @Binding var pendingRemoteTaskDescription: String?
    @State private var isKeyboardVisible = false

    func body(content: Content) -> some View {
        content
            .onReceive(container.sessionService.currentSessionPublisher) { updatedSession in
                // External Update Gate: defer updates while user is actively editing
                // This prevents cursor jumps during typing (matching desktop behavior)
                guard let session = updatedSession,
                      session.id == currentSession?.id,
                      let updatedTaskDesc = session.taskDescription,
                      updatedTaskDesc != taskText else {
                    return
                }

                let trimmedReceived = updatedTaskDesc.trimmingCharacters(in: .whitespacesAndNewlines)
                let trimmedCurrent = taskText.trimmingCharacters(in: .whitespacesAndNewlines)

                guard !trimmedReceived.isEmpty, trimmedReceived != trimmedCurrent else {
                    return
                }

                // Check if keyboard is visible to decide whether to queue or apply update
                if isKeyboardVisible {
                    // Queue the update for later to prevent cursor jumps during typing
                    pendingRemoteTaskDescription = trimmedReceived
                } else {
                    // Apply immediately if not actively typing
                    taskText = trimmedReceived
                    container.taskSyncService.updateLastSyncedText(sessionId: session.id, text: trimmedReceived)
                    pendingRemoteTaskDescription = nil
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                isKeyboardVisible = true
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                isKeyboardVisible = false

                // Flush pending remote updates when keyboard dismisses
                if let pending = pendingRemoteTaskDescription,
                   let session = currentSession {
                    let trimmedPending = pending.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmedPending.isEmpty, trimmedPending != taskText.trimmingCharacters(in: .whitespacesAndNewlines) else {
                        pendingRemoteTaskDescription = nil
                        return
                    }

                    taskText = trimmedPending
                    container.taskSyncService.updateLastSyncedText(sessionId: session.id, text: trimmedPending)
                    pendingRemoteTaskDescription = nil
                }
            }
    }
}

struct ProjectChangeModifier: ViewModifier {
    @ObservedObject var container: AppContainer
    @Binding var currentSession: Session?
    let loadMostRecentSession: () -> Void

    func body(content: Content) -> some View {
        content
            .onReceive(container.$currentProject) { newProject in
                // Clear current session when project changes to force re-selection
                if let oldSession = currentSession,
                   oldSession.projectDirectory != newProject?.directory {
                    currentSession = nil
                    Task { @MainActor in
                        container.sessionService.currentSession = nil
                    }
                }
                loadMostRecentSession()
            }
            .onReceive(container.$isInitializing) { initializing in
                // When initialization completes, load session if we don't have one
                if !initializing && container.hasCompletedInitialLoad && currentSession == nil {
                    loadMostRecentSession()
                }
            }
    }
}

#Preview {
    SessionWorkspaceView()
}
