import SwiftUI
import Core
import Combine

/// Session selection modal that allows users to browse and select existing sessions or create new ones
/// Similar to the desktop's SessionManager component
public struct SessionSelectionView: View {
    let projectDirectory: String
    let onSessionSelected: (Session) -> Void

    @State private var sessions: [Session] = []
    @State private var searchText = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingNewSessionForm = false
    @State private var newSessionName = ""
    @Environment(\.presentationMode) var presentationMode
    @Environment(\.dismiss) private var dismiss

    @State private var showingRenameAlert = false
    @State private var sessionToRename: Session?
    @State private var newNameForRename = ""

    @State private var showingDeleteAlert = false
    @State private var sessionToDelete: Session?

    // Observe data services for real-time updates
    @StateObject private var eventMonitor = SessionListEventMonitor()

    public init(projectDirectory: String, onSessionSelected: @escaping (Session) -> Void) {
        self.projectDirectory = projectDirectory
        self.onSessionSelected = onSessionSelected
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Header with search and new button
                VStack(spacing: 12) {
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(Color.mutedForeground)
                            .frame(width: 20)

                        DismissableTextField("Search sessions...", text: $searchText)
                            .frame(height: 22)

                        if !searchText.isEmpty {
                            Button(action: { searchText = "" }) {
                                Image(systemName: "xmark.circle.fill")
                            }
                            .buttonStyle(CompactIconButtonStyle())
                        }
                    }
                    .padding(Theme.Spacing.cardPadding)
                    .background(Color.inputBackground)
                    .cornerRadius(10)

                    // Action buttons
                    HStack(spacing: 12) {
                        Button(action: { loadSessions() }) {
                            HStack(spacing: 8) {
                                if isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: Color.primaryForeground))
                                        .scaleEffect(0.8)
                                } else {
                                    Image(systemName: "arrow.clockwise")
                                }
                                Text("Refresh")
                            }
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(isLoading)
                        .accessibilityLabel("Refresh")
                        .accessibilityHint("Reloads the list of sessions")

                        Spacer()

                        Button(action: { showingNewSessionForm = true }) {
                            HStack(spacing: 8) {
                                Image(systemName: "plus.circle")
                                Text("New Session")
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(isLoading)
                        .accessibilityLabel("New Session")
                        .accessibilityHint("Creates a new work session")
                    }
                }
                .padding()
                .background(Color.background)

                Divider()

                // Loading State
                if isLoading && sessions.isEmpty && !(PlanToCodeCore.shared.dataServices?.sessionService.hasLoadedOnce ?? false) {
                    VStack {
                        Spacer()
                        HStack {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                                .scaleEffect(0.8)
                            Text("Loading sessions...")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                        }
                        Spacer()
                    }
                }
                // Error Message
                else if let errorMessage = errorMessage {
                    VStack {
                        Spacer()
                        StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                        Button("Try Again") {
                            loadSessions()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .padding(.top)
                        Spacer()
                    }
                    .padding()
                }
                // Sessions List
                else if !filteredSessions.isEmpty {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(filteredSessions) { session in
                                SessionSelectionCard(session: session) {
                                    onSessionSelected(session)
                                }
                                .contextMenu {
                                    Button {
                                        sessionToRename = session
                                        newNameForRename = session.name
                                        showingRenameAlert = true
                                    } label: {
                                        Label("Rename", systemImage: "pencil")
                                    }

                                    Button {
                                        duplicateSession(session)
                                    } label: {
                                        Label("Duplicate", systemImage: "plus.square.on.square")
                                    }

                                    Button(role: .destructive) {
                                        sessionToDelete = session
                                        showingDeleteAlert = true
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                        .padding()
                    }
                    .scrollDismissesKeyboard(.immediately)
                }
                // Empty State
                else {
                    VStack(spacing: 16) {
                        Spacer()

                        Image(systemName: "folder.badge.gearshape")
                            .font(.system(size: 48))
                            .foregroundColor(Color.mutedForeground)

                        VStack(spacing: 8) {
                            Text(searchText.isEmpty ? "No Sessions" : "No Matching Sessions")
                                .h3()
                                .foregroundColor(Color.cardForeground)

                            Text(searchText.isEmpty ?
                                "Create a new session to get started" :
                                "Try adjusting your search terms")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                                .multilineTextAlignment(.center)
                        }

                        if searchText.isEmpty {
                            Button("Create Session") {
                                showingNewSessionForm = true
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .padding(.top)
                        }

                        Spacer()
                    }
                    .padding()
                }
            }
                .background(Color.background)
                .ignoresSafeArea(.keyboard, edges: .bottom)
                .navigationTitle("Select Session")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
                        .fontWeight(.semibold)
                    }
                }
                .sheet(isPresented: $showingNewSessionForm) {
                NewSessionFormView(
                    projectDirectory: projectDirectory,
                    onSessionCreated: { session in
                        showingNewSessionForm = false
                        sessions.insert(session, at: 0)
                        onSessionSelected(session)
                    },
                    onCancel: {
                        showingNewSessionForm = false
                    }
                )
            }
            .alert("Rename Session", isPresented: $showingRenameAlert) {
                TextField("New Session Name", text: $newNameForRename)
                Button("Rename", action: {
                    if let session = sessionToRename {
                        renameSession(session, newName: newNameForRename)
                    }
                })
                Button("Cancel", role: .cancel) {}
            }
            .alert("Delete Session", isPresented: $showingDeleteAlert, presenting: sessionToDelete) { session in
                Button("Delete", role: .destructive, action: {
                    deleteSession(session)
                })
                Button("Cancel", role: .cancel) {}
            } message: { session in
                Text("Are you sure you want to delete \"\(session.name)\"? This action cannot be undone.")
            }
            .onAppear {
                eventMonitor.startMonitoring(projectDirectory: projectDirectory)
                loadSessions()
            }
            .onDisappear {
                eventMonitor.stopMonitoring()
            }
            .onChange(of: projectDirectory) { _ in
                eventMonitor.startMonitoring(projectDirectory: projectDirectory)
                loadSessions()
            }
            .onChange(of: eventMonitor.shouldRefresh) { shouldRefresh in
                if shouldRefresh {
                    loadSessions()
                    eventMonitor.didRefresh()
                }
            }
        }
    }

    private var filteredSessions: [Session] {
        if searchText.isEmpty {
            return sessions
        } else {
            return sessions.filter { session in
                session.name.localizedCaseInsensitiveContains(searchText) ||
                session.projectDirectory.localizedCaseInsensitiveContains(searchText) ||
                (session.taskDescription?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }
    }

    private func loadSessions() {
        // Guard against empty project directory
        guard !projectDirectory.isEmpty else {
            errorMessage = "No project directory set. Please select a project first."
            isLoading = false
            return
        }

        Task {
            guard let dataServices = PlanToCodeCore.shared.dataServices else {
                await MainActor.run {
                    errorMessage = "App not initialized"
                    isLoading = false
                }
                return
            }

            // Check if we have a recent fetch
            if dataServices.sessionService.hasRecentSessionsFetch(for: projectDirectory, within: 10.0) {
                await MainActor.run {
                    self.sessions = dataServices.sessionService.sessions.sorted { $0.updatedAt > $1.updatedAt }
                    self.isLoading = false
                    self.errorMessage = nil
                }
                return
            }

            await MainActor.run {
                isLoading = true
                errorMessage = nil
            }

            // Cache-first loading: render cached sessions immediately
            let cached = dataServices.sessionService.sessions
            if !cached.isEmpty {
                await MainActor.run {
                    self.sessions = cached.sorted { $0.updatedAt > $1.updatedAt }
                    // Keep loading true to show we're fetching fresh data
                }
            }

            do {
                let sessionsList = try await dataServices.sessionService.fetchSessions(projectDirectory: projectDirectory)
                await MainActor.run {
                    sessions = sessionsList.sorted { $0.updatedAt > $1.updatedAt }
                    errorMessage = nil
                    isLoading = false
                }
            } catch DataServiceError.offline {
                // Offline - use cached sessions from service
                await MainActor.run {
                    let serviceSessions = dataServices.sessionService.sessions
                    if !serviceSessions.isEmpty {
                        sessions = serviceSessions.sorted { $0.updatedAt > $1.updatedAt }
                        errorMessage = nil // Don't show error if we have cached data
                    } else if sessions.isEmpty {
                        errorMessage = "Offline - no cached sessions available"
                    }
                    isLoading = false
                }
            } catch {
                // Other errors - still try to show service's sessions if available
                await MainActor.run {
                    let serviceSessions = dataServices.sessionService.sessions
                    if !serviceSessions.isEmpty && sessions.isEmpty {
                        sessions = serviceSessions.sorted { $0.updatedAt > $1.updatedAt }
                    }
                    // Only show error if we have no sessions to display
                    if sessions.isEmpty {
                        errorMessage = error.localizedDescription
                    }
                    isLoading = false
                }
            }
        }
    }

    private func renameSession(_ session: Session, newName: String) {
        Task {
            do {
                guard let dataServices = PlanToCodeCore.shared.dataServices else { return }
                try await dataServices.sessionService.renameSession(id: session.id, newName: newName)
                loadSessions()
            } catch {
                errorMessage = "Failed to rename session: \(error.localizedDescription)"
            }
        }
    }

    private func duplicateSession(_ session: Session) {
        Task {
            do {
                guard let dataServices = PlanToCodeCore.shared.dataServices else { return }
                _ = try await dataServices.sessionService.duplicateSession(id: session.id, newName: nil)
                loadSessions()
            } catch {
                errorMessage = "Failed to duplicate session: \(error.localizedDescription)"
            }
        }
    }

    private func deleteSession(_ session: Session) {
        Task {
            do {
                guard let dataServices = PlanToCodeCore.shared.dataServices else { return }
                try await dataServices.sessionService.deleteSession(id: session.id)
                sessions.removeAll { $0.id == session.id }
            } catch {
                errorMessage = "Failed to delete session: \(error.localizedDescription)"
            }
        }
    }
}

// MARK: - Session Selection Card

struct SessionSelectionCard: View {
    let session: Session
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.name)
                            .h4()
                            .foregroundColor(Color.cardForeground)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)

                        Text(projectName)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                }

                // Task Description
                if let taskDescription = session.taskDescription, !taskDescription.isEmpty {
                    Text(taskDescription)
                        .paragraph()
                        .foregroundColor(Color.cardForeground.opacity(0.8))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                // Footer
                HStack {
                    Label(session.formattedDate, systemImage: "calendar")
                        .small()
                        .foregroundColor(Color.mutedForeground)

                    Spacer()

                    if !session.includedFiles.isEmpty {
                        Label("\(session.includedFiles.count) files", systemImage: "doc.text")
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radii.base)
                    .fill(Color.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radii.base)
                            .stroke(Color.border, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("\(session.name), project \(projectName)")
        .accessibilityHint("Opens this session")
    }

    private var projectName: String {
        return URL(fileURLWithPath: session.projectDirectory).lastPathComponent
    }
}

// MARK: - New Session Form

struct NewSessionFormView: View {
    let projectDirectory: String
    let onSessionCreated: (Session) -> Void
    let onCancel: () -> Void

    @State private var sessionName = ""
    @State private var isCreating = false
    @State private var errorMessage: String?
    @Environment(\.presentationMode) var presentationMode
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared

    init(projectDirectory: String, onSessionCreated: @escaping (Session) -> Void, onCancel: @escaping () -> Void) {
        self.projectDirectory = projectDirectory
        self.onSessionCreated = onSessionCreated
        self.onCancel = onCancel
    }

    private var isConnected: Bool {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let state = multiConnectionManager.connectionStates[deviceId] else {
            return false
        }
        return state.isConnected
    }

    private var isReconnecting: Bool {
        multiConnectionManager.isActivelyReconnecting
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Session Name")
                        .h4()
                        .foregroundColor(Color.cardForeground)

                    DismissableTextField("e.g., Feature Implementation", text: $sessionName)
                        .frame(height: 22)
                        .padding(Theme.Spacing.cardPadding)
                        .background(Color.inputBackground)
                        .cornerRadius(10)
                }

                if isReconnecting {
                    StatusAlertView(variant: .warning, title: "Reconnecting", message: "Restoring connection to desktop...")
                } else if let errorMessage = errorMessage {
                    StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                }

                Button(action: createSession) {
                    if isCreating {
                        HStack {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Color.primaryForeground))
                                .scaleEffect(0.8)
                            Text("Creating...")
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Text("Create Session")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(sessionName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreating || isReconnecting)

                Spacer()
            }
            .padding()
            .background(Color.background)
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .navigationTitle("New Session")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                trailing: Button("Cancel") {
                    onCancel()
                }
                .buttonStyle(ToolbarButtonStyle())
                .disabled(isCreating)
            )
            .onChange(of: isConnected) { connected in
                // Clear error when connection is restored
                if connected && errorMessage != nil {
                    errorMessage = nil
                }
            }
        }
    }

    private func createSession() {
        let trimmedName = sessionName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        isCreating = true
        errorMessage = nil

        Task {
            do {
                guard let dataServices = PlanToCodeCore.shared.dataServices else {
                    await MainActor.run {
                        errorMessage = "App not initialized"
                        isCreating = false
                    }
                    return
                }
                let session = try await dataServices.sessionService.createSession(
                    name: trimmedName,
                    projectDirectory: projectDirectory,
                    taskDescription: nil
                )

                await MainActor.run {
                    isCreating = false
                    onSessionCreated(session)
                }
            } catch {
                await MainActor.run {
                    errorMessage = Self.userFriendlyErrorMessage(for: error)
                    isCreating = false
                }
            }
        }
    }

    /// Convert error to user-friendly message with actionable guidance
    private static func userFriendlyErrorMessage(for error: Error) -> String {
        let nsError = error as NSError

        // Check for network-related errors
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet:
                return "No internet connection. Please check your network and try again."
            case NSURLErrorNetworkConnectionLost:
                return "Connection lost. Please check your network and try again."
            case NSURLErrorTimedOut:
                return "Request timed out. Please check your connection to the desktop app."
            case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost:
                return "Cannot reach the server. Please ensure the desktop app is running."
            default:
                return "Network error. Please check your connection and try again."
            }
        }

        // Check for relay/connection errors
        if let relayError = error as? ServerRelayError {
            return ConnectivityDiagnostics.userFriendlyMessage(for: relayError)
        }

        // Check for data service errors
        if let dataError = error as? DataServiceError {
            switch dataError {
            case .offline:
                return "You're offline. Please connect to a network and try again."
            case .networkError:
                return "Network error. Please check your connection and try again."
            case .serverError(let message):
                return "Server error: \(message)"
            case .validation(let message):
                return message
            default:
                return dataError.localizedDescription
            }
        }

        // Fallback: check for common network error patterns in the description
        let description = error.localizedDescription.lowercased()
        if description.contains("network") || description.contains("connection") || description.contains("offline") {
            return "Connection issue. Please check your network and try again."
        }

        return error.localizedDescription
    }
}

// MARK: - Event Monitor

/// Monitors relay events to trigger automatic session list refreshes when plans or jobs are updated
@MainActor
class SessionListEventMonitor: ObservableObject {
    @Published var shouldRefresh = false
    private var cancellables = Set<AnyCancellable>()
    private var currentProjectDirectory: String?

    func startMonitoring(projectDirectory: String) {
        self.currentProjectDirectory = projectDirectory
        cancellables.removeAll()

        guard let dataServices = PlanToCodeCore.shared.dataServices else { return }

        // Monitor jobs service for new/updated jobs (including plans)
        // We monitor the jobs array changes which indicates relay events have been processed
        dataServices.jobsService.$jobs
            .receive(on: DispatchQueue.main)
            .sink { [weak self] jobs in
                guard let self = self else { return }
                // Check if any jobs are relevant to current project (plans or job events)
                let hasRelevantJobs = jobs.contains { job in
                    job.taskType.hasPrefix("implementation_plan")
                }

                // Only trigger refresh if we have relevant jobs (indicates activity)
                if hasRelevantJobs {
                    self.shouldRefresh = true
                }
            }
            .store(in: &cancellables)

        // Note: We intentionally don't monitor sessionService.$sessions here because:
        // - These update frequently during background processing and when this view calls loadSessions()
        // - This causes excessive session list refreshes and flickering (reactive loop)
        // - Session list updates are triggered by server events via jobs changes
        // - Direct user actions (create/delete session) update the UI immediately without needing refresh
    }

    func stopMonitoring() {
        cancellables.removeAll()
    }

    func didRefresh() {
        shouldRefresh = false
    }
}

#Preview {
    SessionSelectionView(
        projectDirectory: "/path/to/project",
        onSessionSelected: { _ in }
    )
}
