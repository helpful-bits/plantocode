import SwiftUI
import Core

// Mutable wrapper for CopyButton editing
private struct EditableCopyButton: Identifiable {
    let id: String
    var label: String
    var content: String

    init(from button: CopyButton) {
        self.id = button.id
        self.label = button.label
        self.content = button.content
    }

    func toCopyButton() -> CopyButton {
        CopyButton(id: id, label: label, content: content)
    }
}

public struct CopyButtonListEditorView: View {
    public let projectDirectory: String
    @ObservedObject public var dataService: SettingsDataService
    public let taskKey: String = "implementationPlan"

    @State private var editableButtons: [EditableCopyButton] = []
    @FocusState private var focusedField: String?

    public init(projectDirectory: String, dataService: SettingsDataService) {
        self.projectDirectory = projectDirectory
        self.dataService = dataService
    }

    public var body: some View {
        VStack(spacing: 0) {
            List {
                if editableButtons.isEmpty {
                    Text("Loading...")
                        .small()
                        .foregroundColor(.mutedForeground)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    ForEach($editableButtons) { $button in
                        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                            HStack {
                                Text("Label")
                                    .small()
                                    .foregroundColor(.mutedForeground)
                            }

                            TextField("Button label", text: $button.label)
                                .textFieldStyle(.roundedBorder)
                                .focused($focusedField, equals: "\(button.id)-label")
                                .onSubmit {
                                    focusedField = nil
                                }

                            Text("Content Template")
                                .small()
                                .foregroundColor(.mutedForeground)

                            TextEditor(text: $button.content)
                                .textInputAutocapitalization(.never)
                                .font(.system(size: 14, design: .monospaced))
                                .scrollContentBackground(.hidden)
                                .frame(height: 120)
                                .padding(Theme.Spacing.sm)
                                .background(Color.muted)
                                .cornerRadius(Theme.Radii.sm)
                                .focused($focusedField, equals: "\(button.id)-content")

                            Button(role: .destructive) {
                                if let index = editableButtons.firstIndex(where: { $0.id == button.id }) {
                                    editableButtons.remove(at: index)
                                }
                            } label: {
                                HStack {
                                    Image(systemName: "trash")
                                    Text("Delete")
                                }
                                .small()
                            }
                            .buttonStyle(.borderless)
                            .foregroundColor(.destructive)
                        }
                        .padding(Theme.Spacing.md)
                        .background(Color.card)
                        .cornerRadius(Theme.Radii.md)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radii.md)
                                .stroke(Color.border, lineWidth: 1)
                        )
                        .listRowInsets(EdgeInsets(top: Theme.Spacing.sm, leading: Theme.Spacing.lg, bottom: Theme.Spacing.sm, trailing: Theme.Spacing.lg))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                    .onMove { from, to in
                        editableButtons.move(fromOffsets: from, toOffset: to)
                    }
                    .onDelete { offsets in
                        editableButtons.remove(atOffsets: offsets)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.background)
            .environment(\.editMode, .constant(.active))
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedField = nil
                    }
                }
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack(spacing: Theme.Spacing.md) {
                    Button("Add") {
                        editableButtons.append(EditableCopyButton(from: CopyButton(id: UUID().uuidString, label: "New", content: "{{IMPLEMENTATION_PLAN}}")))
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Spacer()

                    Button("Save") {
                        Task {
                            let buttons = editableButtons.map { $0.toCopyButton() }
                            let buttonData = buttons.map { ["id": $0.id, "label": $0.label, "content": $0.content] }
                            try? await dataService.setProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "copyButtons", value: buttonData)
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }

                Text("Placeholders: {{TASK_DESCRIPTION}}, {{IMPLEMENTATION_PLAN}}, {{REQUIREMENTS}}, {{COMMANDS}}, {{STEPS_SECTION}}, {{STEP_CONTENT}}")
                    .small()
                    .foregroundColor(.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                Text("Tip: Use ☰ handles to drag and reorder • Swipe to delete • Defaults will be used if no buttons are saved")
                    .small()
                    .foregroundColor(.mutedForeground)
                    .italic()
            }
            .padding(Theme.Spacing.lg)
            .background(Color.background)
        }
        .background(Color.background)
        .onAppear {
            Task {
                if !projectDirectory.isEmpty {
                    try? await dataService.fetchProjectTaskModelSettings(projectDirectory: projectDirectory)
                }

                // Load existing buttons from task settings
                if let settings = dataService.projectTaskSettings[taskKey],
                   let buttons = settings.copyButtons {
                    editableButtons = buttons.map { EditableCopyButton(from: $0) }
                } else {
                    // Use defaults if none configured
                    editableButtons = CopyButton.defaults.map { EditableCopyButton(from: $0) }
                }
            }
        }
    }
}
