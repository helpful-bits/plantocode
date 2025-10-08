import SwiftUI
import Core

/// ProjectSelectionHeaderView:
/// - Single source for selecting active project (Settings tab only).
/// - Writes AppState.selectedProjectDirectory and sets DataServicesManager.currentProject via AppContainer.
/// - Do not duplicate this UI elsewhere.
public struct ProjectSelectionHeaderView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var container: AppContainer

    @State private var projectDirectoryInput: String = ""
    public var onProjectChanged: (() -> Void)? = nil

    public init(onProjectChanged: (() -> Void)? = nil) {
        self.onProjectChanged = onProjectChanged
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Active Project").font(.headline)
            if let current = container.currentProject {
                Text("Current: \(current.name)").font(.subheadline).foregroundColor(.secondary)
            } else {
                Text("No active project selected").font(.subheadline).foregroundColor(.secondary)
            }

            TextField("Remote project directory", text: $projectDirectoryInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .textContentType(.URL)
                .textFieldStyle(.roundedBorder)

            HStack {
                Button("Set Active Project") {
                    setActiveProject()
                }
                .buttonStyle(PrimaryButtonStyle())

                Spacer()
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .onAppear {
            projectDirectoryInput = appState.selectedProjectDirectory ?? ""
        }
    }

    private func setActiveProject() {
        let dir = projectDirectoryInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !dir.isEmpty else { return }

        appState.setSelectedProjectDirectory(dir)

        let name = URL(fileURLWithPath: dir).lastPathComponent
        let hash = String(dir.hashValue)
        let project = ProjectInfo(name: name, directory: dir, hash: hash)

        container.setCurrentProject(project)

        onProjectChanged?()
    }
}
