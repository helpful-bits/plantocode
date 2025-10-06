import SwiftUI
import Core
import Combine

public struct SessionsView: View {
    @State private var searchText = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var sessions: [Session] = []
    @State private var showingSessionDetail = false
    @State private var selectedSession: Session?

    public init() {}

    public var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Header
                AppHeaderBar(
                    title: "Sessions",
                    subtitle: "Manage your desktop development sessions"
                )

                // Search Bar
                VStack(spacing: 12) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(Color.mutedForeground)

                        TextField("Search sessions...", text: $searchText)
                            .textFieldStyle(PlainTextFieldStyle())
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.card)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.border, lineWidth: 1)
                    )
                }

                // Loading State
                if isLoading {
                    HStack {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                            .scaleEffect(0.8)
                        Text("Loading sessions...")
                            .foregroundColor(Color.mutedForeground)
                    }
                    .padding()
                }

                // Error Message
                if let errorMessage = errorMessage {
                    StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                }

                // Sessions List
                if !filteredSessions.isEmpty {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(filteredSessions) { session in
                                Button(action: {
                                    selectedSession = session
                                    showingSessionDetail = true
                                }) {
                                    SessionCard(session: session)
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                        .padding(.vertical)
                    }
                }

                // Empty State
                if filteredSessions.isEmpty && !isLoading {
                    VStack(spacing: 16) {
                        Image(systemName: "folder.badge.gearshape")
                            .font(.system(size: 48))
                            .foregroundColor(Color.mutedForeground)

                        VStack(spacing: 8) {
                            Text(searchText.isEmpty ? "No Sessions" : "No Matching Sessions")
                                .h4()
                                .foregroundColor(Color.cardForeground)

                            Text(searchText.isEmpty ?
                                "Sessions from your desktop will appear here once you start creating tasks." :
                                "Try adjusting your search terms to find sessions.")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                                .multilineTextAlignment(.center)
                        }

                        if searchText.isEmpty {
                            Button("Refresh") {
                                loadSessions()
                            }
                            .buttonStyle(SecondaryButtonStyle())
                        }
                    }
                    .padding()
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Sessions")
        .refreshable {
            await refreshSessions()
        }
        .onAppear {
            loadSessions()
        }
        .sheet(isPresented: $showingSessionDetail) {
            if let session = selectedSession,
               let dataServices = VibeManagerCore.shared.dataServices {
                SessionDetailView(session: session, sessionService: dataServices.sessionService)
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
        isLoading = true
        errorMessage = nil

        guard let dataServices = VibeManagerCore.shared.dataServices else {
            self.errorMessage = "App not initialized"
            self.isLoading = false
            return
        }

        guard let projectDir = dataServices.currentProject?.directory else {
            self.sessions = []
            self.errorMessage = "No active project"
            self.isLoading = false
            return
        }

        Task {
            do {
                let sessionsList = try await dataServices.sessionService.fetchSessions(projectDirectory: projectDir)
                await MainActor.run {
                    sessions = sessionsList.sorted { $0.createdAt > $1.createdAt }
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

    private func refreshSessions() async {
        guard let dataServices = VibeManagerCore.shared.dataServices else {
            await MainActor.run {
                self.errorMessage = "App not initialized"
            }
            return
        }

        guard let projectDir = dataServices.currentProject?.directory else {
            await MainActor.run {
                self.sessions = []
                self.errorMessage = "No active project"
            }
            return
        }

        do {
            let sessionsList = try await dataServices.sessionService.fetchSessions(projectDirectory: projectDir)
            await MainActor.run {
                sessions = sessionsList.sorted { $0.createdAt > $1.createdAt }
            }
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
            }
        }
    }
}

// MARK: - SessionCard Component

struct SessionCard: View {
    let session: Session

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.name)
                        .h4()
                        .foregroundColor(Color.cardForeground)
                        .lineLimit(2)

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
                    .foregroundColor(Color.cardForeground)
                    .lineLimit(3)
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
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.card)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.border, lineWidth: 1)
                )
        )
    }

    private var projectName: String {
        return URL(fileURLWithPath: session.projectDirectory).lastPathComponent
    }
}

// MARK: - SessionDetailView

struct SessionDetailView: View {
    let session: Session
    let sessionService: SessionDataService
    @Environment(\.presentationMode) var presentationMode

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Session Info
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Session Details")
                            .h4()
                            .foregroundColor(Color.cardForeground)

                        VStack(spacing: 8) {
                            InfoRow(label: "Name", value: session.name)
                            InfoRow(label: "Project", value: projectName)
                            InfoRow(label: "Created", value: session.formattedDate)

                            if let taskDescription = session.taskDescription, !taskDescription.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Task Description")
                                        .small()
                                        .foregroundColor(Color.mutedForeground)
                                    Text(taskDescription)
                                        .paragraph()
                                        .foregroundColor(Color.cardForeground)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(16)
                    .background(Color.card)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.border, lineWidth: 1)
                    )

                    // Included Files
                    if !session.includedFiles.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Included Files (\(session.includedFiles.count))")
                                .h4()
                                .foregroundColor(Color.cardForeground)

                            LazyVStack(spacing: 4) {
                                ForEach(session.includedFiles, id: \.self) { filePath in
                                    HStack {
                                        Image(systemName: "doc.text")
                                            .small()
                                            .foregroundColor(Color.mutedForeground)

                                        Text(filePath)
                                            .small()
                                            .foregroundColor(Color.cardForeground)
                                            .lineLimit(1)

                                        Spacer()
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                        .padding(16)
                        .background(Color.card)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.border, lineWidth: 1)
                        )
                    }

                    Spacer(minLength: 20)
                }
                .padding()
            }
            .navigationTitle(session.name)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(trailing: Button("Done") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }

    private var projectName: String {
        return URL(fileURLWithPath: session.projectDirectory).lastPathComponent
    }
}

// MARK: - Supporting Views

private struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .small()
                .foregroundColor(Color.mutedForeground)

            Spacer()

            Text(value)
                .small()
                .foregroundColor(Color.cardForeground)
                .multilineTextAlignment(.trailing)
        }
    }
}

#Preview {
    SessionsView()
}