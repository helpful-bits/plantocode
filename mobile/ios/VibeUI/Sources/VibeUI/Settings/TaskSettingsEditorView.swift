import SwiftUI
import Core

public struct TaskSettingsEditorView: View {
    public let projectDirectory: String
    public let taskKey: String
    @ObservedObject public var dataService: SettingsDataService
    @Binding public var settings: TaskModelSettings
    public let providers: [ProviderWithModels]

    @State private var selectedModel: String = ""
    @State private var temp: Double = 0.7
    @State private var maxTokens: Double = 8000
    @State private var voiceLang: String = "en"
    @FocusState private var isLanguageFieldFocused: Bool

    public init(projectDirectory: String, taskKey: String, dataService: SettingsDataService, settings: Binding<TaskModelSettings>, providers: [ProviderWithModels]) {
        self.projectDirectory = projectDirectory
        self.taskKey = taskKey
        self.dataService = dataService
        self._settings = settings
        self.providers = providers
        self._selectedModel = State(initialValue: settings.wrappedValue.model)
        self._temp = State(initialValue: settings.wrappedValue.temperature)
        self._maxTokens = State(initialValue: Double(settings.wrappedValue.maxTokens))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Model Selection
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Model", systemImage: "cpu")
                            .font(.headline)
                            .foregroundColor(Color.appForeground)
                        Spacer()
                    }

                    ModelSelectorView(providers: providers, selectedModelId: $selectedModel) { m in
                        Task {
                            try? await dataService.setProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "model", value: m)
                            settings.model = m
                        }
                    }
                    .frame(height: 300)
                }

                Divider()
                    .background(Color.appBorder)

                // Temperature
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Temperature", systemImage: "thermometer.medium")
                            .font(.headline)
                            .foregroundColor(Color.appForeground)

                        Spacer()

                        Text(String(format: "%.2f", temp))
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(Color.appPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color.appAccent)
                            .cornerRadius(AppColors.radiusSm)
                    }

                    Slider(value: $temp, in: 0.0...1.0, step: 0.01, onEditingChanged: { editing in
                        if !editing {
                            Task {
                                try? await dataService.setProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "temperature", value: temp)
                                settings.temperature = temp
                            }
                        }
                    })
                    .tint(Color.appPrimary)

                    Text("Controls randomness in responses. Lower values are more focused and deterministic.")
                        .font(.caption)
                        .foregroundColor(Color.appMutedForeground)

                    Button {
                        Task {
                            try? await dataService.resetProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "temperature")
                        }
                    } label: {
                        Label("Reset to Default", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .controlSize(.small)
                }

                Divider()
                    .background(Color.appBorder)

                // Max Tokens
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Max Tokens", systemImage: "text.word.spacing")
                            .font(.headline)
                            .foregroundColor(Color.appForeground)

                        Spacer()

                        Text("\(formatTokenCount(Int(maxTokens)))")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(Color.appPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color.appAccent)
                            .cornerRadius(AppColors.radiusSm)
                    }

                    Slider(value: $maxTokens, in: 1000...100000, step: 1000, onEditingChanged: { editing in
                        if !editing {
                            Task {
                                try? await dataService.setProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "maxTokens", value: Int(maxTokens))
                                settings.maxTokens = Int(maxTokens)
                            }
                        }
                    })
                    .tint(Color.appPrimary)

                    Text("Maximum length of the response. Higher values allow longer outputs.")
                        .font(.caption)
                        .foregroundColor(Color.appMutedForeground)

                    Button {
                        Task {
                            try? await dataService.resetProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "maxTokens")
                        }
                    } label: {
                        Label("Reset to Default", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .controlSize(.small)
                }

                Divider()
                    .background(Color.appBorder)

                // Voice transcription language (if applicable)
                if taskKey == "voiceTranscription" {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Language Code")
                            .font(.headline)
                        TextField("e.g., en, de, fr", text: $voiceLang)
                            .textFieldStyle(.roundedBorder)
                            .focused($isLanguageFieldFocused)
                            .onSubmit {
                                isLanguageFieldFocused = false
                            }
                        HStack {
                            Button("Save Language") {
                                Task {
                                    try? await dataService.setProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "languageCode", value: voiceLang)
                                    isLanguageFieldFocused = false
                                }
                            }
                            .buttonStyle(PrimaryButtonStyle())

                            Button("Reset Language") {
                                Task {
                                    try? await dataService.resetProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "languageCode")
                                    isLanguageFieldFocused = false
                                }
                            }
                            .buttonStyle(SecondaryButtonStyle())
                        }
                    }

                    Divider()
                }

                // Implementation plan copy buttons
                if taskKey == "implementationPlan" {
                    CopyButtonListEditorView(projectDirectory: projectDirectory, dataService: dataService)
                    Divider()
                }

                // System Prompt
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("System Prompt", systemImage: "doc.text")
                            .font(.headline)
                            .foregroundColor(Color.appForeground)
                        Spacer()
                    }

                    SystemPromptEditorView(projectDirectory: projectDirectory, taskType: taskKey, dataService: dataService)
                        .padding(.vertical, 8)
                }
            }
            .padding()
        }
        .background(Color.appBackground)
    }

    // MARK: - Helpers

    private func formatTokenCount(_ count: Int) -> String {
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}
