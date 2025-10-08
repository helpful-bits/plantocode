import SwiftUI
import Core

public struct SystemPromptEditorView: View {
    public let projectDirectory: String
    public let taskType: String
    @ObservedObject public var dataService: SettingsDataService

    @State private var useCustom: Bool = false
    @State private var editedPrompt: String = ""
    @State private var defaultPrompt: String?
    @State private var isLoading: Bool = true
    @State private var loadError: String?
    @State private var showFullScreenEditor: Bool = false

    public init(projectDirectory: String, taskType: String, dataService: SettingsDataService) {
        self.projectDirectory = projectDirectory
        self.taskType = taskType
        self.dataService = dataService
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding()
            } else if let error = loadError {
                VStack(spacing: 12) {
                    Label("Failed to load system prompt", systemImage: "exclamationmark.triangle")
                        .font(.callout)
                        .foregroundColor(Color.appDestructive)

                    Text(error)
                        .font(.caption)
                        .foregroundColor(Color.appMutedForeground)

                    Button("Retry") {
                        Task {
                            await loadPrompt()
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .controlSize(.small)
                }
                .padding()
            } else {
                promptEditor
            }
        }
        .onAppear {
            Task {
                await loadPrompt()
            }
        }
        .sheet(isPresented: $showFullScreenEditor) {
            fullScreenPromptEditor
        }
    }

    // MARK: - Prompt Editor

    private var promptEditor: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Mode selector
            HStack {
                Spacer()
                HStack(spacing: 0) {
                    if useCustom {
                        Button {
                            Task {
                                do {
                                    try await dataService.resetProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
                                    useCustom = false
                                    await loadPrompt()
                                } catch {
                                    loadError = error.localizedDescription
                                }
                            }
                        } label: {
                            Text("Default")
                                .font(.subheadline)
                                .fontWeight(.regular)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .controlSize(.small)
                    } else {
                        Button {
                            // No action when already on default
                        } label: {
                            Text("Default")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .controlSize(.small)
                        .disabled(true)
                    }

                    Divider()
                        .frame(height: 24)

                    if useCustom {
                        Button {
                            // No action when already on custom
                        } label: {
                            Text("Custom")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .controlSize(.small)
                        .disabled(true)
                    } else {
                        Button {
                            let startingPrompt = defaultPrompt ?? ""
                            editedPrompt = startingPrompt
                            useCustom = true
                        } label: {
                            Text("Custom")
                                .font(.subheadline)
                                .fontWeight(.regular)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .controlSize(.small)
                    }
                }
                .overlay(
                    RoundedRectangle(cornerRadius: AppColors.radius)
                        .stroke(Color.appBorder, lineWidth: 1)
                )
            }

            // Content
            if useCustom {
                customPromptEditor
            } else {
                defaultPromptViewer
            }
        }
    }

    private var customPromptEditor: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Preview/editor
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Custom System Prompt")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Color.appForeground)

                    Spacer()

                    Button {
                        showFullScreenEditor = true
                    } label: {
                        Label("Edit Full Screen", systemImage: "arrow.up.left.and.arrow.down.right")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(IconButtonStyle())
                }

                TextEditor(text: $editedPrompt)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color.appMuted)
                    .cornerRadius(AppColors.radius)
                    .overlay(
                        RoundedRectangle(cornerRadius: AppColors.radius)
                            .stroke(Color.appBorder, lineWidth: 1)
                    )
                    .font(.system(.callout, design: .monospaced))
            }

            // Actions
            HStack(spacing: 12) {
                Button {
                    Task {
                        do {
                            try await dataService.setProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType, systemPrompt: editedPrompt)
                        } catch {
                            loadError = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Save Changes", systemImage: "checkmark")
                }
                .buttonStyle(PrimaryButtonStyle())

                Button {
                    Task {
                        do {
                            try await dataService.resetProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
                            useCustom = false
                            await loadPrompt()
                        } catch {
                            loadError = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Reset to Default", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    private var defaultPromptViewer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Default System Prompt")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(Color.appForeground)

            if let prompt = defaultPrompt {
                ScrollView {
                    Text(prompt)
                        .font(.system(.callout, design: .monospaced))
                        .foregroundColor(Color.appMutedForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                }
                .frame(maxHeight: 200)
                .background(Color.appMuted)
                .cornerRadius(AppColors.radius)
                .overlay(
                    RoundedRectangle(cornerRadius: AppColors.radius)
                        .stroke(Color.appBorder, lineWidth: 1)
                )
            } else {
                HStack {
                    Spacer()
                    Text("No default prompt available")
                        .font(.callout)
                        .foregroundColor(Color.appMutedForeground)
                    Spacer()
                }
                .padding()
                .background(Color.appMuted)
                .cornerRadius(AppColors.radius)
            }
        }
    }

    // MARK: - Full Screen Editor

    private var fullScreenPromptEditor: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TextEditor(text: $editedPrompt)
                    .font(.system(.body, design: .monospaced))
                    .padding()
            }
            .background(Color.appBackground)
            .navigationTitle("Edit System Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showFullScreenEditor = false
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        showFullScreenEditor = false
                    }
                    .fontWeight(.semibold)
                    .buttonStyle(ToolbarButtonStyle())
                }
            }
        }
    }

    // MARK: - Loading

    private func loadPrompt() async {
        isLoading = true
        loadError = nil

        do {
            try await dataService.loadProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
            useCustom = dataService.isSystemPromptCustom
            editedPrompt = dataService.currentSystemPrompt ?? ""
            defaultPrompt = try await dataService.fetchDefaultSystemPrompt(taskType: taskType)
            isLoading = false
        } catch {
            isLoading = false
            loadError = error.localizedDescription
        }
    }
}
