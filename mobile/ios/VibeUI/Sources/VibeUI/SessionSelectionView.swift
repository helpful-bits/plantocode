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
                        .buttonStyle(ToolbarButtonStyle())
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

        isLoading = true
        errorMessage = nil

        Task {
            do {
                guard let dataServices = PlanToCodeCore.shared.dataServices else {
                    await MainActor.run {
                        errorMessage = "App not initialized"
                        isLoading = false
                    }
                    return
                }

                // Cache-first loading: render cached sessions immediately
                let cached = dataServices.sessionService.sessions
                if !cached.isEmpty {
                    await MainActor.run {
                        self.sessions = cached
                        self.isLoading = false
                    }
                }

                let sessionsList = try await dataServices.sessionService.fetchSessions(projectDirectory: projectDirectory)
                await MainActor.run {
                    sessions = sessionsList.sorted { $0.updatedAt > $1.updatedAt }
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
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

    init(projectDirectory: String, onSessionCreated: @escaping (Session) -> Void, onCancel: @escaping () -> Void) {
        self.projectDirectory = projectDirectory
        self.onSessionCreated = onSessionCreated
        self.onCancel = onCancel
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

                if let errorMessage = errorMessage {
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
                .disabled(sessionName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreating)

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
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
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
