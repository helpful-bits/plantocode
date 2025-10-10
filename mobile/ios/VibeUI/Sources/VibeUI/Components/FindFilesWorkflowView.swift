import SwiftUI
import Core

public struct FindFilesWorkflowView: View {
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    private let sessionId: String
    private let projectDirectory: String
    private let taskDescription: String
    private let initiallySelected: Set<String>

    @State private var progress: Double? = nil
    @State private var progressMessage: String? = nil
    @State private var suggestions: [FindFilesSuggestion] = []
    @State private var selected: Set<String> = []
    @State private var isRunning: Bool = true
    @State private var errorMessage: String? = nil
    @State private var infoMessage: String? = nil

    public init(sessionId: String,
                projectDirectory: String,
                taskDescription: String,
                initiallySelected: Set<String> = []) {
        self.sessionId = sessionId
        self.projectDirectory = projectDirectory
        self.taskDescription = taskDescription
        self.initiallySelected = initiallySelected
    }

    public var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                if let p = progress {
                    HStack {
                        ProgressView(value: p)
                            .progressViewStyle(.linear)
                        Text(progressMessage ?? "Analyzing…")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                if let info = infoMessage {
                    Text(info)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                if let err = errorMessage {
                    StatusAlertView(variant: .destructive, title: "Error", message: err)
                }
                List {
                    Section("Suggested files") {
                        ForEach(suggestions, id: \.path) { s in
                            Button {
                                toggleSelection(s.path)
                            } label: {
                                HStack {
                                    Image(systemName: selected.contains(s.path) ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(selected.contains(s.path) ? .accentColor : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(URL(fileURLWithPath: s.path).lastPathComponent)
                                            .font(.body)
                                        Text(s.path)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                        if let why = s.reason, !why.isEmpty {
                                            Text(why)
                                                .font(.caption2)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    Spacer()
                                    if let score = s.score {
                                        Text(String(format: "%.2f", score))
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)

                HStack {
                    Button("Close") { dismiss() }
                        .buttonStyle(.bordered)

                    Spacer()

                    Button("Include Selected") {
                        applySelection()
                    }
                    .disabled(selected.isEmpty || isRunning)
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
            .navigationTitle("Find Files")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task {
            await runWorkflow()
        }
        .onAppear {
            self.selected = initiallySelected
        }
    }

    private func toggleSelection(_ path: String) {
        if selected.contains(path) { selected.remove(path) } else { selected.insert(path) }
    }

    private func applySelection() {
        Task {
            try? await container.sessionService.updateSessionFiles(sessionId: sessionId,
                                                        addIncluded: Array(selected),
                                                        removeIncluded: nil,
                                                        addExcluded: nil,
                                                        removeExcluded: Array(selected))
        }
        dismiss()
    }

    private func runWorkflow() async {
        do {
            let stream = container.filesService.startFindFiles(sessionId: sessionId,
                                                               taskDescription: taskDescription,
                                                               projectDirectory: projectDirectory,
                                                               excludedPaths: container.sessionService.currentSession?.forceExcludedFiles ?? [],
                                                               timeoutMs: 120_000)
            for try await event in stream {
                switch event {
                case .progress(let value, let message):
                    self.progress = value
                    self.progressMessage = message
                case .suggestions(let list):
                    let existingSet = Set(suggestions.map { $0.path })
                    let newOnes = list.filter { !existingSet.contains($0.path) }
                    self.suggestions.append(contentsOf: newOnes)
                case .info(let msg):
                    self.infoMessage = msg
                case .error(let msg):
                    self.errorMessage = msg
                    self.isRunning = false
                case .completed:
                    self.isRunning = false
                }
            }
        } catch {
            self.errorMessage = error.localizedDescription
            self.isRunning = false
        }
    }
}
