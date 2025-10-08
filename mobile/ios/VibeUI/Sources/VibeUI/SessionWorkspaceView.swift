import SwiftUI
import Core
import Combine
import UIKit

/// Mobile-optimized workspace view with tab navigation for better UX
/// Uses bottom navigation tabs to separate concerns and reduce scrolling
public struct SessionWorkspaceView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var voiceDictationService = VoiceDictationService.shared
    @StateObject private var textEnhancementService = TextEnhancementService.shared
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    @State private var currentSession: Session?
    @State private var taskText = ""
    @State private var errorMessage: String?
    @State private var showingSessionSelector = false
    @State private var selectedTab = 0
    @State private var showingDeviceSelection = false
    @State private var isOfflineMode = false
    @State private var activeSyncSessionId: String?
    @State private var isReceivingRemoteUpdate = false

    private let projectDirectory = "/path/to/project"
    let autoPresentDeviceSelection: Bool

    public init(autoPresentDeviceSelection: Bool = true) {
        self.autoPresentDeviceSelection = autoPresentDeviceSelection
    }

    public var body: some View {
        ZStack {
            if let session = currentSession {
                TabView(selection: $selectedTab) {
                    // Tab 1: Task Description (Updated with TaskInputView)
                    Group {
                        if selectedTab == 0 {
                            TaskTab(
                                session: session,
                                taskText: $taskText,
                                onSessionChange: { showingSessionSelector = true }
                            )
                        }
                    }
                    .tabItem {
                        Label("Task", systemImage: "square.and.pencil")
                    }
                    .tag(0)

                    // Tab 2: Files
                    Group {
                        if selectedTab == 1 {
                            FilesTab(
                                session: session,
                                isOfflineMode: isOfflineMode
                            )
                        }
                    }
                    .tabItem {
                        Label("Files", systemImage: "doc.text")
                    }
                    .tag(1)

                    // Tab 3: Plans
                    Group {
                        if selectedTab == 2 {
                            PlansTab(
                                session: session,
                                taskText: taskText,
                                onCreatePlan: createImplementationPlan,
                                isOfflineMode: isOfflineMode
                            )
                        }
                    }
                    .tabItem {
                        Label("Plans", systemImage: "list.bullet.rectangle")
                    }
                    .tag(2)

                    // Tab 4: Jobs
                    Group {
                        if selectedTab == 3 {
                            JobsTab(
                                session: session,
                                isOfflineMode: isOfflineMode
                            )
                        }
                    }
                    .tabItem {
                        Label("Jobs", systemImage: "chart.bar.doc.horizontal")
                    }
                    .tag(3)

                    // Tab 5: Settings
                    Group {
                        if selectedTab == 4 {
                            SettingsView()
                        }
                    }
                    .tabItem {
                        Label("Settings", systemImage: "gearshape")
                    }
                    .tag(4)
                }
                .tint(Color.primary)
            } else {
                // Empty state - no session
                EmptySessionView(onSelectSession: { showingSessionSelector = true })
            }

            // Connection status overlay
            VStack(spacing: 0) {
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
                        onReconnect: {
                            Task {
                                _ = await multiConnectionManager.addConnection(for: activeDeviceId)
                            }
                        }
                    )
                }
                Spacer()
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onAppear {
            startSyncIfNeeded()
        }
        .onChange(of: selectedTab) { newTab in
            if newTab == 0 {
                startSyncIfNeeded()
            } else {
                stopCurrentSync()
            }
        }
        .onChange(of: currentSession?.id) { newSessionId in
            stopCurrentSync()
            if selectedTab == 0 {
                startSyncIfNeeded()
            }
        }
        .onDisappear {
            stopCurrentSync()
        }
        .sheet(isPresented: $showingSessionSelector) {
            NavigationStack {
                SessionSelectionView(
                    projectDirectory: projectDirectory,
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
                        }
                    }
            }
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
        .onAppear {
            checkConnectionAndLoad()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            // Reconnect when app comes back to foreground
            Task {
                if let deviceId = multiConnectionManager.activeDeviceId {
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
        // REMOVED: Direct persistence now handled by TaskSyncDataService
        // .onChange(of: taskText) { newValue in
        //     taskTextDebounceTimer?.invalidate()
        //     taskTextDebounceTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { _ in
        //         guard let session = currentSession else { return }
        //         Task {
        //             do {
        //                 try await container.sessionService.updateTaskDescription(
        //                     sessionId: session.id,
        //                     content: newValue
        //                 )
        //             } catch {
        //                 print("Failed to sync task description: \(error)")
        //             }
        //         }
        //     }
        // }
        .onReceive(container.sessionService.$currentSession) { updatedSession in
            // Update taskText when session changes from desktop (echo prevention)
            if let session = updatedSession,
               session.id == currentSession?.id,
               let updatedTaskDesc = session.taskDescription,
               !updatedTaskDesc.isEmpty,
               updatedTaskDesc != taskText {
                let trimmedReceived = updatedTaskDesc.trimmingCharacters(in: .whitespacesAndNewlines)
                let trimmedCurrent = taskText.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmedReceived != trimmedCurrent {
                    // Update local text AND sync service hash to prevent echo
                    taskText = updatedTaskDesc
                    container.taskSyncService.updateLastSyncedText(sessionId: session.id, text: updatedTaskDesc)
                }
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
        Task {
            do {
                let sessions = try await container.sessionService.fetchSessions(projectDirectory: projectDirectory)
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
        currentSession = session
        taskText = session.taskDescription ?? ""
        errorMessage = nil

        // Set current session in SessionDataService for global access
        container.sessionService.currentSession = session

        // Set current project in AppContainer for proper scoping
        let dir = session.projectDirectory
        let name = URL(fileURLWithPath: dir).lastPathComponent
        let hash = String(dir.hashValue)
        container.setCurrentProject(ProjectInfo(name: name, directory: dir, hash: hash))
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
                "sessionId": AnyCodable(session.id),
                "taskDescription": AnyCodable(taskText),
                "projectDirectory": AnyCodable(projectDirectory),
                "relevantFiles": AnyCodable(session.includedFiles)
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
        guard let session = currentSession else { return }

        // Only start if not already syncing this session
        if activeSyncSessionId != session.id {
            container.taskSyncService.startTaskDescriptionSync(
                sessionId: session.id,
                textBinding: $taskText,
                pollIntervalSeconds: 4.0
            )
            activeSyncSessionId = session.id
        }
    }

    private func stopCurrentSync() {
        guard let sessionId = activeSyncSessionId else { return }
        container.taskSyncService.stopTaskDescriptionSync(sessionId: sessionId)
        activeSyncSessionId = nil
    }
}

// MARK: - Task Tab (Using TaskInputView)

struct TaskTab: View {
    let session: Session
    @Binding var taskText: String
    let onSessionChange: () -> Void

    @State private var showingDeviceMenu = false
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Session info bar
                SessionInfoBar(session: session, onTap: onSessionChange)

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
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.background)
            .onTapGesture {
                // Dismiss keyboard when tapping outside
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
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
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .h4()
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
        }
    }
}


// MARK: - Files Tab

struct FilesTab: View {
    @EnvironmentObject private var container: AppContainer
    let session: Session
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
                FileManagementView(filesService: container.filesService)
                    .navigationTitle("Files")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }
}

struct FileRowView: View {
    let filePath: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: fileIcon)
                .h4()
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
                ImplementationPlansView()
                    .navigationTitle("Plans")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }
}

// MARK: - Jobs Tab

struct JobsTab: View {
    let session: Session
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
                JobsMonitoringView()
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
    @State private var showingAccountView = false
    @State private var showingDeviceSelection = false
    @State private var showingMenu = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "tray")
                    .font(.system(size: 48))
                    .foregroundColor(Color.mutedForeground)

                VStack(spacing: 16) {
                    Text("No Session Selected")
                        .h3()
                        .foregroundColor(Color.cardForeground)

                    Text("Select an existing session or create a new one to start working")
                        .paragraph()
                        .foregroundColor(Color.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                VStack(spacing: 12) {
                    Button(action: onSelectSession) {
                        HStack {
                            Image(systemName: "list.bullet")
                            Text("Browse Sessions")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button(action: onSelectSession) {
                        HStack {
                            Image(systemName: "plus.circle")
                            Text("Create New Session")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.horizontal, 40)

                Spacer()
            }
            .navigationTitle("Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(action: { showingAccountView = true }) {
                            Label("Account", systemImage: "person.circle")
                        }

                        Button(action: { showingDeviceSelection = true }) {
                            Label("Switch Device", systemImage: "desktopcomputer")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showingAccountView) {
                AccountView()
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
    let onReconnect: () -> Void
    @State private var showingDeviceSelection = false
    @State private var showingHelp = false
    @ObservedObject private var appState = AppState.shared

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                StatusAlertView(
                    variant: .warning,
                    title: "Disconnected from desktop",
                    message: "Reconnect to continue working on your tasks"
                )

                HStack(spacing: 8) {
                    Button(action: onReconnect) {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.clockwise")
                            Text("Reconnect")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button(action: { showingDeviceSelection = true }) {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                            Text("Switch Device")
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button(action: { showingHelp = true }) {
                        HStack(spacing: 6) {
                            Image(systemName: "questionmark.circle")
                            Text("Help")
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Spacer()
                }
            }
            .padding(12)
            .background(Color.appWarningBackground)
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

#Preview {
    SessionWorkspaceView()
}