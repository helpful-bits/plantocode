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
    @StateObject private var viewModel = SessionWorkspaceViewModel()
    @ObservedObject private var voiceDictationService = VoiceDictationService.shared
    @ObservedObject private var textEnhancementService = TextEnhancementService.shared
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared
    @ObservedObject private var appState = AppState.shared

    let autoPresentDeviceSelection: Bool


    private var mainContentView: some View {
        VStack(spacing: 0) {
            // Inline connection status banner - keeps workspace visible
            if viewModel.workspaceConnectivityState == .transientReconnecting
                && !viewModel.shouldShowConnectionOverlay {
                HStack {
                    Image(systemName: "wifi.exclamationmark")
                        .foregroundColor(Color.appWarning)
                    Text(statusText)
                        .font(.footnote)
                        .foregroundColor(Color.appWarningForeground)
                }
                .padding(8)
                .frame(maxWidth: .infinity)
                .background(Color.yellow.opacity(0.15))
            }

            // Workspace content with overlay-based connection banners
            ZStack(alignment: .top) {
                taskTabsView
                if viewModel.shouldShowConnectionOverlay {
                    connectionStatusOverlay
                }
            }
        }
    }

    private var statusText: String {
        switch viewModel.workspaceConnectivityState {
        case .healthy:
            return "Connected"
        case .transientReconnecting:
            return "Reconnecting to desktop…"
        case .degradedDisconnected:
            return "Disconnected from desktop"
        case .offlineModeCandidate:
            return "Offline Mode"
        }
    }

    private var taskTabsView: some View {
        sessionContentView
    }

    private var sessionContentView: some View {
        Group {
            if let session = viewModel.currentSession {
                tabsView(for: session)
            } else {
                EmptySessionView(onSelectSession: { viewModel.showingSessionSelector = true })
            }
        }
    }

    private func tabsView(for session: Session) -> some View {
        TabView(selection: $viewModel.selectedTab) {
            // Tab 1: Task Description (Updated with TaskInputView)
            TaskTab(
                session: session,
                taskText: $viewModel.taskText,
                onSessionChange: { viewModel.showingSessionSelector = true }
            )
            .tabItem {
                Label("Task", systemImage: "square.and.pencil")
            }
            .tag(0)

            // Tab 2: Files - No lazy loading to ensure onReceive handlers fire
            FilesTab(
                session: session,
                isOfflineMode: viewModel.isOfflineMode,
                jobsService: container.jobsService
            )
            .tabItem {
                Label("Files", systemImage: "doc.text")
            }
            .tag(1)
            .badge(viewModel.workflowJobCount)

            // Tab 4: Jobs - No lazy loading to ensure onReceive handlers fire
            JobsTab(
                session: session,
                isOfflineMode: viewModel.isOfflineMode,
                jobsService: container.jobsService
            )
            .tabItem {
                Label("Jobs", systemImage: "chart.bar.doc.horizontal")
            }
            .tag(3)
            .badge(viewModel.workflowJobCount)

            // Tab 3: Plans - No lazy loading to ensure onReceive handlers fire
            PlansTab(
                session: session,
                taskText: viewModel.taskText,
                onCreatePlan: { viewModel.createImplementationPlan() },
                isOfflineMode: viewModel.isOfflineMode,
                jobsService: container.jobsService
            )
            .tabItem {
                Label("Plans", systemImage: "list.bullet.rectangle")
            }
            .tag(2)
            .badge(viewModel.implementationPlanCount)

            // Tab 5: Settings
            SettingsView()
            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
            .tag(4)
        }
        .tint(Color.primary)
    }

    @ViewBuilder
    private var connectionStatusOverlay: some View {
        VStack(spacing: 0) {
            successBannerView
            connectionBannerView
        }
    }

    @ViewBuilder
    private var successBannerView: some View {
        if let success = viewModel.reconnectionSuccess, success, let message = viewModel.reconnectionMessage {
            ReconnectionSuccessBanner(message: message)
                .onAppear {
                    Task {
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        await MainActor.run {
                            viewModel.reconnectionSuccess = nil
                            viewModel.reconnectionMessage = nil
                        }
                    }
                }
        }
    }

    @ViewBuilder
    private var connectionBannerView: some View {
        if viewModel.isOfflineMode {
            OfflineModeBanner(onGoOnline: {
                viewModel.goOnline()
            })
        } else if viewModel.showFullConnectionBanner,
                  viewModel.workspaceConnectivityState == .degradedDisconnected
                    || viewModel.workspaceConnectivityState == .transientReconnecting,
                  let activeDeviceId = multiConnectionManager.activeDeviceId,
                  let connectionState = multiConnectionManager.connectionStates[activeDeviceId] {
            ConnectionStatusBanner(
                state: connectionState,
                failureMessage: viewModel.reconnectionSuccess == false ? viewModel.reconnectionMessage : nil,
                onReconnect: {
                    viewModel.reconnect()
                },
                onDismissFailure: {
                    viewModel.dismissFailure()
                }
            )
        }
    }

    public init(autoPresentDeviceSelection: Bool = true) {
        self.autoPresentDeviceSelection = autoPresentDeviceSelection
    }

    public var body: some View {
        mainContentView
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .modifier(SyncLifecycleModifier(
                selectedTab: $viewModel.selectedTab,
                currentSessionId: viewModel.currentSession?.id,
                pendingRemoteTaskDescription: $viewModel.pendingRemoteTaskDescription,
                lastSyncedSessionId: $viewModel.lastSyncedSessionId,
                startSync: { viewModel.startSyncIfNeeded() },
                stopSync: { viewModel.stopCurrentSync() }
            ))
            .modifier(SheetModifier(
                showingSessionSelector: $viewModel.showingSessionSelector,
                showingDeviceSelection: $viewModel.showingDeviceSelection,
                currentProjectDirectory: viewModel.currentProjectDirectory,
                loadSession: { viewModel.loadSession($0) }
            ))
            .modifier(SessionUpdateModifier(
                container: container,
                appState: appState,
                currentSession: $viewModel.currentSession,
                taskText: $viewModel.taskText,
                errorMessage: $viewModel.errorMessage,
                showingDeviceSelection: $viewModel.showingDeviceSelection,
                isOfflineMode: $viewModel.isOfflineMode,
                handleDeepLink: { await viewModel.handleDeepLink($0) }
            ))
            .modifier(ConnectionModifier(
                container: container,
                multiConnectionManager: multiConnectionManager,
                loadMostRecentSession: { viewModel.loadMostRecentSession() },
                checkConnectionAndLoad: { viewModel.checkConnectionAndLoad() }
            ))
            .modifier(TaskSyncModifier(
                container: container,
                currentSession: viewModel.currentSession,
                taskText: $viewModel.taskText,
                pendingRemoteTaskDescription: $viewModel.pendingRemoteTaskDescription
            ))
            .modifier(ProjectChangeModifier(
                container: container,
                currentSession: $viewModel.currentSession,
                loadMostRecentSession: { viewModel.loadMostRecentSession() }
            ))
            .onChange(of: viewModel.selectedTab) { newValue in
                viewModel.handleSelectedTabChange(newValue)
            }
            .sheet(isPresented: $viewModel.showingPaywall) {
                PaywallView()
                    .environmentObject(container)
            }
            .onChange(of: viewModel.workspaceConnectivityState) { newState in
                viewModel.handleWorkspaceConnectivityStateChange(newState)
            }
            .onAppear {
                viewModel.configure(container: container)
                viewModel.onAppear()
                if autoPresentDeviceSelection {
                    viewModel.checkConnectionAndLoad()
                }
            }
            .onDisappear {
                viewModel.onDisappear()
            }
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
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared

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
                .id(session.id)
                .padding(.horizontal)
                .padding(.top, isKeyboardVisible ? 0 : 16)
                .frame(maxWidth: .infinity)
            }
            .background(Color.background)
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
    @ObservedObject var jobsService: JobsDataService

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
                    FileManagementView(
                        filesService: container.filesService,
                        sessionService: container.sessionService,
                        jobsService: jobsService
                    )
                }
                .navigationTitle("Files")
                .navigationBarTitleDisplayMode(.inline)
                // Note: Session sync handled by SessionWorkspaceViewModel.loadSession() → startSessionScopedSync()
                // FileManagementView has its own defensive guards for session context
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
    @ObservedObject var jobsService: JobsDataService

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
                SessionSynchronizedPlansView(session: session, taskText: taskText, jobsService: jobsService)
            }
        }
    }
}

// Wrapper view that synchronizes session before rendering ImplementationPlansView
private struct SessionSynchronizedPlansView: View {
    @EnvironmentObject private var container: AppContainer
    let session: Session
    let taskText: String
    @ObservedObject var jobsService: JobsDataService

    var body: some View {
        ImplementationPlansView(jobsService: jobsService, currentTaskDescription: taskText)
            .navigationTitle("Plans")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                // Synchronize session synchronously when view appears
                // Using onAppear instead of .task to ensure session is set
                // BEFORE ImplementationPlansView.onAppear runs
                if container.sessionService.currentSession?.id != session.id {
                    container.sessionService.currentSession = session
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
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared

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
        let titleText = isReconnecting ? "Reconnecting to desktop" : "Disconnected from desktop"
        let subtitleText = isReconnecting
            ? "Trying to restore your connection. We'll keep retrying in the background."
            : "Reconnect to continue working on your tasks."

        VStack(spacing: 0) {
            VStack(spacing: 14) {
                // Alert message
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.appWarning.opacity(0.15))
                            .frame(width: 36, height: 36)

                        if isReconnecting {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Color.appWarning))
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "wifi.exclamationmark")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(Color.appWarning)
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(titleText)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Color.appWarningForeground)

                        Text(subtitleText)
                            .font(.system(size: 14))
                            .foregroundColor(Color.appMutedForeground)

                        if let failureMessage = failureMessage, !isReconnecting {
                            Text(failureMessage)
                                .font(.footnote)
                                .foregroundColor(Color.appMutedForeground)
                                .multilineTextAlignment(.leading)
                        }
                    }

                    Spacer()
                }

                if let failureMessage = failureMessage, !isReconnecting {
                    Button(action: onDismissFailure) {
                        Text("Dismiss")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(Color.appMutedForeground)
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Action buttons
                VStack(spacing: 10) {
                    // Primary action - full width
                    Button(action: {
                        isReconnecting = true
                        onReconnect()
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
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.appWarningBorder, lineWidth: 1)
            )
            .cornerRadius(12)
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .onAppear {
            switch state {
            case .connecting, .handshaking, .authenticating, .reconnecting:
                isReconnecting = true
            case .connected, .failed, .disconnected, .closing:
                isReconnecting = false
            }
        }
        .onChange(of: state) { newState in
            switch newState {
            case .connecting, .handshaking, .authenticating, .reconnecting:
                isReconnecting = true
            case .connected, .failed, .disconnected, .closing:
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
                let previousSessionId = currentSession?.id
                currentSession = newSession

                // Only update taskText when switching to a DIFFERENT session.
                // For same-session updates (e.g., relay events), rely on TaskInputView's
                // history-state merge logic to handle conflicts properly.
                guard previousSessionId != newSession.id else {
                    return
                }

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
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                // Reconnect when app comes back to foreground
                Task {
                    if let deviceId = multiConnectionManager.activeDeviceId {
                        // Add a small delay to allow the network stack to stabilize
                        try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
                        _ = await multiConnectionManager.addConnection(for: deviceId)

                        // Refresh data that may have changed while in background
                        await MainActor.run {
                            // Refresh workflow job counts
                            container.jobsService.onConnectionRestored()
                            // Refresh session to get latest file selections
                            container.sessionService.onConnectionRestored()
                        }
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

    func body(content: Content) -> some View {
        // Task description sync is now handled entirely by TaskInputView via history-state merge logic.
        // This modifier previously tried to sync taskText from session updates, but that bypassed
        // the proper 3-way merge and caused user edits to be overwritten by desktop's version.
        // The pendingRemoteTaskDescription binding is kept for API compatibility but no longer used.
        content
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
