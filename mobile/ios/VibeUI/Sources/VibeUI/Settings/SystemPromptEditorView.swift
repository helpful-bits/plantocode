import SwiftUI
import Core

private func dynamicColor(_ pair: Theme.DynamicColorPair) -> Color {
    Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ? UIColor(pair.dark) : UIColor(pair.light)
    })
}

public struct SystemPromptEditorView: View {
    public let projectDirectory: String
    public let taskType: String
    @ObservedObject public var dataService: SettingsDataService

    @State private var useCustom: Bool = false
    @State private var editedPrompt: String = ""
    @State private var defaultPrompt: String?
    @State private var isLoading: Bool = true
    @State private var loadError: String?
    @State private var showDefaultFullScreenViewer = false
    @State private var showCustomFullScreenEditor = false
    @State private var viewerText = ""
    @State private var viewerTitle = ""

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
                        .foregroundColor(Color.destructive)

                    Text(error)
                        .font(.caption)
                        .foregroundColor(Color.textSecondary)

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
        .fullScreenCover(isPresented: $showDefaultFullScreenViewer) {
            PlanEditorFullScreenView(
                text: .constant(viewerText.isEmpty ? (defaultPrompt ?? "") : viewerText),
                onSave: nil,
                isReadOnly: true,
                languageHint: "markdown"
            )
        }
        .fullScreenCover(isPresented: $showCustomFullScreenEditor) {
            PlanEditorFullScreenView(
                text: $editedPrompt,
                onSave: { newValue in
                    Task {
                        try? await dataService.setProjectSystemPrompt(
                            projectDirectory: projectDirectory,
                            taskType: taskType,
                            systemPrompt: newValue
                        )
                        await loadPrompt()
                        useCustom = dataService.isSystemPromptCustom
                        editedPrompt = dataService.currentSystemPrompt ?? ""
                    }
                },
                isReadOnly: false,
                languageHint: "markdown"
            )
        }
    }

    // MARK: - Prompt Editor

    private var promptEditor: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Mode selector
            HStack {
                Spacer()
                HStack(spacing: 0) {
                    Button {
                        if useCustom {
                            Task {
                                do {
                                    try await dataService.resetProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
                                    useCustom = false
                                    await loadPrompt()
                                } catch {
                                    loadError = error.localizedDescription
                                }
                            }
                        }
                    } label: {
                        Text("Default")
                            .font(.system(size: 12, weight: !useCustom ? .semibold : .regular))
                            .foregroundColor(!useCustom ? Color.textPrimary : Color.textMuted)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                !useCustom ?
                                Color.selectionBackground :
                                Color.clear
                            )
                    }
                    .buttonStyle(PlainButtonStyle())

                    Rectangle()
                        .fill(Color.inputBorder)
                        .frame(width: 1, height: 24)

                    Button {
                        if !useCustom {
                            if dataService.isSystemPromptCustom, let currentPrompt = dataService.currentSystemPrompt {
                                editedPrompt = currentPrompt
                            } else {
                                let startingPrompt = defaultPrompt ?? ""
                                editedPrompt = startingPrompt
                            }
                            useCustom = true
                        }
                    } label: {
                        Text("Custom")
                            .font(.system(size: 12, weight: useCustom ? .semibold : .regular))
                            .foregroundColor(useCustom ? Color.textPrimary : Color.textMuted)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                useCustom ?
                                Color.selectionBackground :
                                Color.clear
                            )
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .background(Color.inputBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radii.base)
                        .stroke(Color.inputBorder, lineWidth: 1)
                )
                .cornerRadius(Theme.Radii.base)
            }

            // Content
            if useCustom {
                customPromptEditor
            } else {
                defaultPromptViewer
            }
        }
        .keyboardAware()
    }

    private var customPromptEditor: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Editor section
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Custom System Prompt")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(Color.textPrimary)

                    Spacer()

                    // Edit Full Screen button
                    Button {
                        showCustomFullScreenEditor = true
                    } label: {
                        Label("Edit Full Screen", systemImage: "arrow.up.left.and.arrow.down.right")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(IconButtonStyle())

                    // Copy button
                    Button {
                        UIPasteboard.general.string = editedPrompt
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(IconButtonStyle())
                }

                PlanRunestoneEditorView(
                    text: $editedPrompt,
                    isReadOnly: false,
                    languageHint: "markdown"
                )
                .frame(minHeight: 120)
            }

            // Action buttons
            HStack(spacing: 12) {
                Button {
                    Task {
                        do {
                            try await dataService.setProjectSystemPrompt(
                                projectDirectory: projectDirectory,
                                taskType: taskType,
                                systemPrompt: editedPrompt
                            )
                            await loadPrompt()
                            useCustom = dataService.isSystemPromptCustom
                            editedPrompt = dataService.currentSystemPrompt ?? ""
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
                            try await dataService.resetProjectSystemPrompt(
                                projectDirectory: projectDirectory,
                                taskType: taskType
                            )
                            await loadPrompt()
                            // After successful reset, always switch to default view
                            useCustom = false
                            editedPrompt = ""
                        } catch {
                            loadError = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Reset to Default", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(SecondaryButtonStyle())
            }

            // Default Prompt Reference disclosure
            if let defaultPrompt = defaultPrompt {
                DisclosureGroup("Default Prompt (Reference)") {
                    PlanRunestoneEditorView(
                        text: .constant(defaultPrompt),
                        isReadOnly: true,
                        languageHint: "markdown"
                    )
                    .frame(minHeight: 120)
                    .padding(.top, 8)
                }
                .font(.callout)
                .foregroundColor(Color.textMuted)
            }
        }
    }

    private var defaultPromptViewer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Default System Prompt")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(Color.textPrimary)

                Spacer()

                // View Full Screen button
                Button {
                    showDefaultFullScreenViewer = true
                } label: {
                    Label("View Full Screen", systemImage: "eye")
                        .labelStyle(.iconOnly)
                }
                .buttonStyle(IconButtonStyle())

                // Copy button
                Button {
                    UIPasteboard.general.string = defaultPrompt ?? ""
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                        .labelStyle(.iconOnly)
                }
                .buttonStyle(IconButtonStyle())
            }

            if let prompt = defaultPrompt {
                PlanRunestoneEditorView(
                    text: .constant(prompt),
                    isReadOnly: true,
                    languageHint: "markdown"
                )
                .frame(minHeight: 200)

                // Callout to view custom if it exists
                if dataService.isSystemPromptCustom, let customPrompt = dataService.currentSystemPrompt {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "info.circle")
                                .foregroundColor(Color.info)
                            Text("Custom prompt is set")
                                .font(.callout)
                                .foregroundColor(Color.textPrimary)
                            Spacer()
                            Button {
                                viewerText = customPrompt
                                viewerTitle = "Custom System Prompt"
                                showDefaultFullScreenViewer = true
                            } label: {
                                Text("View Custom")
                                    .font(.caption)
                                    .fontWeight(.medium)
                            }
                            .buttonStyle(SecondaryButtonStyle())
                            .controlSize(.small)
                        }
                    }
                    .padding(12)
                    .background(dynamicColor(Theme.Semantic.Status.infoBackground))
                    .cornerRadius(Theme.Radii.base)
                }
            } else {
                HStack {
                    Spacer()
                    Text("No default prompt available")
                        .font(.callout)
                        .foregroundColor(Color.textMuted)
                    Spacer()
                }
                .padding()
                .background(Color.surfaceSecondary)
                .cornerRadius(Theme.Radii.base)
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
