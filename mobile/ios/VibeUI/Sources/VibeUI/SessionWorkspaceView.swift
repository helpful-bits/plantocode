import SwiftUI
import Core

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
    @State private var showingEnhanceOptions = false
    @State private var showingDeviceSelection = false
    @State private var isOfflineMode = false
    @State private var showingSettings = false

    private let projectDirectory = "/path/to/project"
    let autoPresentDeviceSelection: Bool

    public init(autoPresentDeviceSelection: Bool = true) {
        self.autoPresentDeviceSelection = autoPresentDeviceSelection
    }

    public var body: some View {
        ZStack {
            if let session = currentSession {
                TabView(selection: $selectedTab) {
                    // Tab 1: Task Description (Updated with EnhancedTaskInputView)
                    EnhancedTaskTab(
                        session: session,
                        taskText: $taskText,
                        onSessionChange: { showingSessionSelector = true },
                        showingSettings: $showingSettings
                    )
                    .tabItem {
                        Label("Task", systemImage: "square.and.pencil")
                    }
                    .tag(0)

                    // Tab 2: Files
                    FilesTab(
                        session: session,
                        isOfflineMode: isOfflineMode,
                        showingSettings: $showingSettings
                    )
                    .tabItem {
                        Label("Files", systemImage: "doc.text")
                    }
                    .tag(1)

                    // Tab 3: Plans
                    PlansTab(
                        session: session,
                        taskText: taskText,
                        onCreatePlan: createImplementationPlan,
                        isOfflineMode: isOfflineMode,
                        showingSettings: $showingSettings
                    )
                    .tabItem {
                        Label("Plans", systemImage: "list.bullet.rectangle")
                    }
                    .tag(2)

                    // Tab 4: Jobs (NEW)
                    JobsTab(
                        session: session,
                        isOfflineMode: isOfflineMode,
                        showingSettings: $showingSettings
                    )
                    .tabItem {
                        Label("Jobs", systemImage: "chart.bar.doc.horizontal")
                    }
                    .tag(3)
                }
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
        .sheet(isPresented: $showingSessionSelector) {
            SessionSelectionView(
                projectDirectory: projectDirectory,
                onSessionSelected: { session in
                    loadSession(session)
                    showingSessionSelector = false
                }
            )
        }
        .sheet(isPresented: $showingDeviceSelection) {
            NavigationView {
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
        .sheet(isPresented: $showingSettings) {
            NavigationView {
                Text("Settings")
                    .navigationTitle("Settings")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") {
                                showingSettings = false
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
            if let deviceId = multiConnectionManager.activeDeviceId {
                if let state = multiConnectionManager.connectionStates[deviceId], !state.isConnected {
                    Task {
                        _ = await multiConnectionManager.addConnection(for: deviceId)
                        loadMostRecentSession()
                    }
                } else {
                    loadMostRecentSession()
                }
            } else if autoPresentDeviceSelection {
                showingDeviceSelection = true
            }
        }
    }

    // MARK: - Helper Methods

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
    }

    private func toggleRecording() {
        if voiceDictationService.isRecording {
            voiceDictationService.stopRecording()
        } else {
            Task {
                do {
                    try await voiceDictationService.startRecording()
                    for try await transcribedText in voiceDictationService.transcribe() {
                        await MainActor.run {
                            if taskText.isEmpty {
                                taskText = transcribedText
                            } else {
                                taskText += " " + transcribedText
                            }
                        }
                    }
                } catch {
                    await MainActor.run {
                        errorMessage = error.localizedDescription
                    }
                }
            }
        }
    }

    private func enhanceText() {
        let textToEnhance = taskText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !textToEnhance.isEmpty else { return }

        Task {
            do {
                let enhancedText = try await textEnhancementService.enhance(text: textToEnhance, context: "task_description")
                await MainActor.run {
                    taskText = enhancedText
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Enhancement failed: \(error.localizedDescription)"
                }
            }
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
}

// MARK: - Enhanced Task Tab (Using EnhancedTaskInputView)

struct EnhancedTaskTab: View {
    let session: Session
    @Binding var taskText: String
    let onSessionChange: () -> Void
    @Binding var showingSettings: Bool

    @State private var showingDeviceMenu = false
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Session info bar
                SessionInfoBar(session: session, onTap: onSessionChange)

                // Enhanced Task Input View
                ScrollView {
                    EnhancedTaskInputView(
                        taskDescription: $taskText,
                        placeholder: "Describe your task...",
                        onInteraction: {
                            // Mark session as modified
                            // TODO: Implement auto-save
                        }
                    )
                    .padding()
                }
            }
            .background(Color.background)
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

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .h4()
                    }
                }
            }
            .sheet(isPresented: $showingDeviceMenu) {
                NavigationView {
                    DeviceSelectionView()
                        .navigationTitle("Switch Device")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showingDeviceMenu = false
                                }
                            }
                        }
                }
            }
        }
    }
}

// MARK: - Task Description Tab (Legacy - kept for reference)

struct TaskDescriptionTab: View {
    let session: Session
    @Binding var taskText: String
    let onEnhance: () -> Void
    let onVoiceToggle: () -> Void
    let isRecording: Bool
    let isEnhancing: Bool
    let onSessionChange: () -> Void
    @Binding var showingSettings: Bool

    @FocusState private var isTextEditorFocused: Bool
    @State private var showingDeviceMenu = false
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Session info bar
                SessionInfoBar(session: session, onTap: onSessionChange)

                // Text editor with floating toolbar
                ZStack(alignment: .bottom) {
                    // Main text editor
                    TextEditor(text: $taskText)
                        .paragraph()
                        .padding()
                        .focused($isTextEditorFocused)
                        .onChange(of: taskText) { _ in
                            // Debounced auto-save would go here
                        }

                    // Placeholder
                    if taskText.isEmpty {
                        VStack {
                            HStack {
                                Text("Describe your task...")
                                    .foregroundColor(.secondary)
                                    .padding(.leading, 20)
                                    .padding(.top, 16)
                                Spacer()
                            }
                            Spacer()
                        }
                        .allowsHitTesting(false)
                    }

                    // Floating action bar (thumb-friendly bottom position)
                    HStack(spacing: 16) {
                        // Voice button
                        Button(action: onVoiceToggle) {
                            Image(systemName: isRecording ? "mic.fill" : "mic")
                                .h4()
                                .foregroundColor(isRecording ? .white : Color.primary)
                                .frame(width: 56, height: 56)
                                .background(isRecording ? Color.destructive : Color.card)
                                .clipShape(Circle())
                                .shadow(color: Color.background.opacity(0.1), radius: 8, x: 0, y: 4)
                        }

                        Spacer()

                        // Enhance button
                        Button(action: onEnhance) {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                Text("Enhance")
                            }
                            .paragraph()
                            .foregroundColor(.white)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 16)
                            .background(
                                LinearGradient(
                                    colors: [Color.primary, Color.primary],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .clipShape(Capsule())
                            .shadow(color: Color.primary.opacity(0.3), radius: 8, x: 0, y: 4)
                        }
                        .disabled(taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isEnhancing)
                        .opacity(taskText.isEmpty ? 0.5 : 1.0)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
                }
            }
            .background(Color.background)
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

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .h4()
                    }
                }
            }
            .sheet(isPresented: $showingDeviceMenu) {
                NavigationView {
                    DeviceSelectionView()
                        .navigationTitle("Switch Device")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showingDeviceMenu = false
                                }
                            }
                        }
                }
            }
        }
    }
}

// MARK: - Files Tab

struct FilesTab: View {
    let session: Session
    let isOfflineMode: Bool
    @Binding var showingSettings: Bool

    var body: some View {
        NavigationView {
            if isOfflineMode {
                VStack(spacing: 24) {
                    Spacer()

                    Image(systemName: "wifi.slash")
                        .font(.system(size: 72))
                        .foregroundColor(.secondary)

                    VStack(spacing: 12) {
                        Text("Offline Mode")
                            .h3()

                        Text("File browsing requires a desktop connection")
                            .paragraph()
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .background(Color.background)
                .navigationTitle("Files")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showingSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                                .h4()
                        }
                    }
                }
            } else {
                FileManagementView()
                    .navigationTitle("Files")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button {
                                showingSettings = true
                            } label: {
                                Image(systemName: "gearshape")
                                    .h4()
                            }
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
                .h4()
                .foregroundColor(Color.primary)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(fileName)
                    .paragraph()
                    .foregroundColor(.primary)

                Text(relativePath)
                    .small()
                    .foregroundColor(.secondary)
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
    @Binding var showingSettings: Bool

    var body: some View {
        NavigationView {
            if isOfflineMode {
                VStack(spacing: 24) {
                    Spacer()

                    Image(systemName: "wifi.slash")
                        .font(.system(size: 72))
                        .foregroundColor(.secondary)

                    VStack(spacing: 12) {
                        Text("Offline Mode")
                            .h3()

                        Text("Connect to a desktop device to view implementation plans")
                            .paragraph()
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .background(Color.background)
                .navigationTitle("Plans")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showingSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                                .h4()
                        }
                    }
                }
            } else {
                ImplementationPlansView()
                    .navigationTitle("Plans")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button {
                                showingSettings = true
                            } label: {
                                Image(systemName: "gearshape")
                                    .h4()
                            }
                        }
                    }
            }
        }
    }
}

// MARK: - Jobs Tab

struct JobsTab: View {
    let session: Session
    let isOfflineMode: Bool
    @Binding var showingSettings: Bool

    var body: some View {
        NavigationView {
            if isOfflineMode {
                VStack(spacing: 24) {
                    Spacer()

                    Image(systemName: "wifi.slash")
                        .font(.system(size: 72))
                        .foregroundColor(.secondary)

                    VStack(spacing: 12) {
                        Text("Offline Mode")
                            .h3()

                        Text("Connect to a desktop device to monitor background jobs")
                            .paragraph()
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .background(Color.background)
                .navigationTitle("Jobs")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showingSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                                .h4()
                        }
                    }
                }
            } else {
                JobsMonitoringView()
                    .navigationTitle("Jobs")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button {
                                showingSettings = true
                            } label: {
                                Image(systemName: "gearshape")
                                    .h4()
                            }
                        }
                    }
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
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .small()
                    .foregroundColor(.secondary)
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
        NavigationView {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "tray")
                    .font(.system(size: 72))
                    .foregroundColor(Color.mutedForeground)

                VStack(spacing: 12) {
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
            .navigationBarTitleDisplayMode(.large)
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
                DeviceSelectionView()
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
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Color.warning)

                Text("Disconnected from desktop")
                    .small()
                    .foregroundColor(.primary)

                Spacer()

                Button("Reconnect", action: onReconnect)
                    .small()
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                Button("Help") {
                    showingHelp = true
                }
                .small()
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button(action: { showingDeviceSelection = true }) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .small()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding()
            .background(Color.warning.opacity(0.15))
        }
        .sheet(isPresented: $showingDeviceSelection) {
            DeviceSelectionView()
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
                    .foregroundColor(Color.muted)

                Text("Offline Mode")
                    .small()
                    .foregroundColor(.primary)

                Spacer()

                Button("Go Online", action: onGoOnline)
                    .small()
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            .padding()
            .background(Color.muted.opacity(0.15))
        }
    }
}

#Preview {
    SessionWorkspaceView()
}