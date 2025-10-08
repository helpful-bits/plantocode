import SwiftUI
import Core

public struct AISettingsView: View {
    @ObservedObject var dataService: SettingsDataService
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var container: AppContainer
    @State private var selectedTaskKey: String?
    @State private var isLoading = false
    @State private var loadError: String?

    public init(dataService: SettingsDataService) {
        self.dataService = dataService
    }

    private var effectiveDir: String? {
        if let d = container.currentProject?.directory, !d.isEmpty { return d }
        if let d = container.sessionService.currentSession?.projectDirectory, !d.isEmpty { return d }
        if let d = appState.selectedProjectDirectory, !d.isEmpty { return d }
        return nil
    }

    public var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                        Text("Loading AI Settings...")
                            .font(.subheadline)
                            .foregroundColor(Color.appMutedForeground)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.appBackground)
                } else if let error = loadError {
                    ScrollView {
                        VStack(spacing: 16) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 48))
                                .foregroundColor(Color.appWarning)
                                .padding(.top, 32)

                            Text("Failed to load settings")
                                .font(.headline)
                                .foregroundColor(Color.appForeground)

                            Text(error)
                                .font(.callout)
                                .foregroundColor(Color.appMutedForeground)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 32)

                            Button {
                                Task {
                                    await loadSettings()
                                }
                            } label: {
                                HStack {
                                    Image(systemName: "arrow.clockwise")
                                    Text("Retry")
                                }
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .padding(.top, 8)
                        }
                        .padding()
                    }
                    .background(Color.appBackground)
                } else if dataService.projectTaskSettings.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 48))
                            .foregroundColor(Color.appMutedForeground)
                            .padding(.top, 32)

                        Text("No settings available")
                            .font(.headline)
                            .foregroundColor(Color.appForeground)

                        if !container.connectionStatus.mode.isOnline {
                            Label("Desktop app is not connected", systemImage: "wifi.slash")
                                .font(.callout)
                                .foregroundColor(Color.appWarning)
                                .padding(.horizontal, 32)
                        } else {
                            Text("Select a project in the Sessions tab")
                                .font(.callout)
                                .foregroundColor(Color.appMutedForeground)
                                .padding(.horizontal, 32)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.appBackground)
                } else {
                    taskTypesList
                }
            }
            .navigationTitle("AI Settings")
            .onAppear {
                Task {
                    await loadSettings()
                }
            }
        }
    }

    // MARK: - Task Types List

    private var taskTypesList: some View {
        List {
            ForEach(Array(groupedTaskTypes.keys.sorted()), id: \.self) { category in
                Section(header: Text(category).font(.subheadline).foregroundColor(Color.appMutedForeground)) {
                    ForEach(groupedTaskTypes[category] ?? [], id: \.self) { taskKey in
                        taskTypeRow(for: taskKey)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func taskTypeRow(for taskKey: String) -> some View {
        NavigationLink {
            taskDetailView(for: taskKey)
        } label: {
            HStack(spacing: 12) {
                // Icon
                Image(systemName: iconName(for: taskKey))
                    .font(.system(size: 20))
                    .foregroundColor(Color.appPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color.appAccent)
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                // Task name
                VStack(alignment: .leading, spacing: 2) {
                    Text(TaskTypeFormatter.displayName(for: taskKey))
                        .font(.body)
                        .foregroundColor(Color.appForeground)

                    if let category = TaskTypeFormatter.category(for: taskKey) {
                        Text(category)
                            .font(.caption)
                            .foregroundColor(Color.appMutedForeground)
                    }
                }

                Spacer()

                // Chevron
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color.appMutedForeground)
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private func taskDetailView(for taskKey: String) -> some View {
        if let dir = effectiveDir,
           let settings = dataService.projectTaskSettings[taskKey] {
            TaskSettingsEditorView(
                projectDirectory: dir,
                taskKey: taskKey,
                dataService: dataService,
                settings: Binding(
                    get: { dataService.projectTaskSettings[taskKey] ?? settings },
                    set: { dataService.projectTaskSettings[taskKey] = $0 }
                ),
                providers: dataService.providers
            )
            .navigationTitle(TaskTypeFormatter.displayName(for: taskKey))
            .navigationBarTitleDisplayMode(.inline)
        } else {
            VStack {
                Text("Settings not available")
                    .foregroundColor(Color.appMutedForeground)
            }
        }
    }

    // MARK: - Helpers

    private var groupedTaskTypes: [String: [String]] {
        // Filter out hidden tasks (matching desktop behavior)
        let taskKeys = Array(dataService.projectTaskSettings.keys.sorted())
            .filter { !TaskTypeFormatter.isHidden($0) }
        return TaskTypeFormatter.groupByCategory(taskKeys)
    }

    private func iconName(for taskKey: String) -> String {
        switch taskKey {
        case "implementationPlan", "implementation_plan":
            return "doc.text.fill"
        case "implementationPlanMerge", "implementation_plan_merge":
            return "doc.on.doc.fill"
        case "voiceTranscription", "voice_transcription":
            return "waveform"
        case "textImprovement", "text_improvement":
            return "text.quote"
        case "pathCorrection", "path_correction":
            return "arrow.triangle.2.circlepath"
        case "taskRefinement", "task_refinement":
            return "sparkles"
        case "fileRelevanceAssessment", "file_relevance_assessment":
            return "doc.badge.gearshape"
        case "extendedPathFinder", "extended_path_finder":
            return "folder.badge.questionmark"
        case "videoAnalysis", "video_analysis":
            return "video.fill"
        case "webSearchPromptsGeneration", "web_search_prompts_generation":
            return "magnifyingglass.circle.fill"
        case "webSearchExecution", "web_search_execution":
            return "globe"
        default:
            return "cpu"
        }
    }

    // MARK: - Loading

    private func loadSettings() async {
        isLoading = true
        loadError = nil

        do {
            try await dataService.fetchProviders()

            guard let dir = effectiveDir else {
                isLoading = false
                loadError = "No project selected. Please select a project in the Sessions tab."
                return
            }

            try await dataService.fetchProjectTaskModelSettings(projectDirectory: dir)
            isLoading = false
        } catch {
            isLoading = false
            loadError = error.localizedDescription
        }
    }
}
