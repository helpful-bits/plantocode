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

    public init(projectDirectory: String, dataService: SettingsDataService) {
        self.projectDirectory = projectDirectory
        self.dataService = dataService
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Copy Buttons")
                .font(.headline)

            List {
                ForEach($editableButtons) { $button in
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Label", text: $button.label)
                        TextField("Content", text: $button.content)
                            .textInputAutocapitalization(.never)
                            .font(.system(.caption, design: .monospaced))
                    }
                }
                .onDelete { idx in
                    editableButtons.remove(atOffsets: idx)
                }
                .onMove { src, dst in
                    editableButtons.move(fromOffsets: src, toOffset: dst)
                }
            }
            .environment(\.editMode, .constant(.active))

            HStack(spacing: 12) {
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

            Text("Placeholders: {{IMPLEMENTATION_PLAN}}, {{REQUIREMENTS}}, {{COMMANDS}}, {{STEPS_SECTION}}")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .onAppear {
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
