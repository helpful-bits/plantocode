import SwiftUI
import Core

/// ProjectSelectionHeaderView:
/// - Single source for selecting active project (Settings tab only).
/// - Writes AppState.selectedProjectDirectory and sets DataServicesManager.currentProject via AppContainer.
/// - Do not duplicate this UI elsewhere.
public struct ProjectSelectionHeaderView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var container: AppContainer

    @State private var showingFolderPicker = false
    public var onProjectChanged: (() -> Void)? = nil

    public init(onProjectChanged: (() -> Void)? = nil) {
        self.onProjectChanged = onProjectChanged
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Current project display
            if let current = container.currentProject {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "folder.fill")
                            .foregroundColor(Color.accent)

                        Text(current.name)
                            .paragraph()
                            .foregroundColor(Color.cardForeground)
                            .fontWeight(.semibold)

                        Spacer()
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(current.directory)
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(Color.mutedForeground)
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                    }
                }
                .padding(12)
                .background(Color.card)
                .cornerRadius(Theme.Radii.base)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radii.base)
                        .stroke(Color.border, lineWidth: 1)
                )
            } else {
                HStack {
                    Image(systemName: "folder.badge.questionmark")
                        .foregroundColor(Color.mutedForeground)

                    Text("No project selected")
                        .paragraph()
                        .foregroundColor(Color.mutedForeground)

                    Spacer()
                }
                .padding(12)
                .background(Color.card)
                .cornerRadius(Theme.Radii.base)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radii.base)
                        .stroke(Color.border, lineWidth: 1)
                )
            }

            // Select folder button
            Button(action: { showingFolderPicker = true }) {
                HStack {
                    Image(systemName: "folder.badge.gearshape")
                    Text(container.currentProject == nil ? "Select Project Folder" : "Change Project Folder")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .sheet(isPresented: $showingFolderPicker) {
            FolderPickerView(onFolderSelected: { selectedPath in
                setActiveProject(path: selectedPath)
            })
        }
    }

    private func setActiveProject(path: String) {
        let dir = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !dir.isEmpty else { return }

        Task { @MainActor in
            appState.setSelectedProjectDirectory(dir)

            let name = URL(fileURLWithPath: dir).lastPathComponent
            let hash = String(dir.hashValue)
            let project = ProjectInfo(name: name, directory: dir, hash: hash)

            // Set project locally first for immediate UI update
            container.setCurrentProject(project)

            // Sync project directory to desktop via RPC and wait for confirmation
            do {
                for try await response in CommandRouter.appSetProjectDirectory(dir) {
                    if let error = response.error {
                        print("[ProjectSelection] Desktop sync error: \(error.message)")
                    } else if response.isFinal {
                        print("[ProjectSelection] Desktop sync confirmed")
                    }
                }
            } catch {
                print("[ProjectSelection] Failed to sync project directory to desktop: \(error)")
            }

            // Refresh sessions for new project
            do {
                try await container.sessionService.fetchSessions(projectDirectory: dir)
            } catch {
                print("[ProjectSelection] Failed to fetch sessions: \(error)")
            }

            onProjectChanged?()
        }
    }
}
