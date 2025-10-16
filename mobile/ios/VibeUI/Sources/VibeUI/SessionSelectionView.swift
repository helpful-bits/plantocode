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

                        TextField("Search sessions...", text: $searchText)
                            .textFieldStyle(PlainTextFieldStyle())

                        if !searchText.isEmpty {
                            Button(action: { searchText = "" }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(Color.mutedForeground)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.card)
                    .cornerRadius(Theme.Radii.base)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radii.base)
                            .stroke(Color.border, lineWidth: 1)
                    )

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
                if isLoading && sessions.isEmpty && !(VibeManagerCore.shared.dataServices?.sessionService.hasLoadedOnce ?? false) {
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
                guard let dataServices = VibeManagerCore.shared.dataServices else {
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

                    TextField("e.g., Feature Implementation", text: $sessionName)
                        .textFieldStyle(PlainTextFieldStyle())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color.card)
                        .cornerRadius(Theme.Radii.base)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radii.base)
                                .stroke(Color.border, lineWidth: 1)
                        )
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
                guard let dataServices = VibeManagerCore.shared.dataServices else {
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

        guard let dataServices = VibeManagerCore.shared.dataServices else { return }

        // Monitor session service events for session changes
        dataServices.sessionService.$sessions
            .dropFirst() // Skip initial value
            .sink { [weak self] _ in
                self?.shouldRefresh = true
            }
            .store(in: &cancellables)

        // Monitor plans service events for new/updated plans
        dataServices.plansService.$lastUpdateEvent
            .compactMap { $0 }
            .sink { [weak self] event in
                guard let self = self else { return }
                // Only refresh if event is relevant to current project
                if let eventProjectDir = event.data["projectDirectory"]?.value as? String,
                   eventProjectDir == self.currentProjectDirectory {
                    self.shouldRefresh = true
                } else if event.eventType.hasPrefix("job:") || event.eventType.hasPrefix("Plan") {
                    // Refresh for any plan/job events (they may affect sessions)
                    self.shouldRefresh = true
                }
            }
            .store(in: &cancellables)

        // Note: We intentionally don't monitor jobsService.$jobs here because:
        // - Jobs update frequently during background processing
        // - This causes excessive session list refreshes and flickering
        // - Session metadata (name, taskDescription) doesn't change when jobs complete
        // - Sessions are already monitored via sessionService.$sessions for actual session changes
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