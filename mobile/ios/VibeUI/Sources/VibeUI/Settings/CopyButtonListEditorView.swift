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
            buttonsList
            bottomControls
        }
        .background(Color.background)
        .onAppear(perform: loadButtons)
    }

    private var buttonsList: some View {
        List {
            if editableButtons.isEmpty {
                loadingView
            } else {
                buttonEditorList
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
    }

    private var loadingView: some View {
        Text("Loading...")
            .small()
            .foregroundColor(.mutedForeground)
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }

    private var buttonEditorList: some View {
        ForEach($editableButtons) { $button in
            buttonEditorRow(button: $button)
        }
        .onMove { from, to in
            editableButtons.move(fromOffsets: from, toOffset: to)
        }
        .onDelete { offsets in
            editableButtons.remove(atOffsets: offsets)
        }
    }

    private func buttonEditorRow(button: Binding<EditableCopyButton>) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            labelSection(button: button)
            contentSection(button: button)
            deleteButton(button: button)
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

    private func labelSection(button: Binding<EditableCopyButton>) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Label")
                .small()
                .foregroundColor(.mutedForeground)

            DismissableTextField("Button label", text: button.label, onSubmit: {
                focusedField = nil
            })
                .textFieldStyle(.roundedBorder)
                .focused($focusedField, equals: "\(button.wrappedValue.id)-label")
        }
    }

    private func contentSection(button: Binding<EditableCopyButton>) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("Content Template")
                .small()
                .foregroundColor(.mutedForeground)

            DismissableTextEditor(
                text: button.content,
                font: .monospacedSystemFont(ofSize: 14, weight: .regular),
                textColor: .label,
                backgroundColor: UIColor(Color.muted),
                autocapitalization: .none,
                autocorrection: .no
            )
            .frame(height: 120)
            .cornerRadius(Theme.Radii.sm)
        }
    }

    private func deleteButton(button: Binding<EditableCopyButton>) -> some View {
        Button(role: .destructive) {
            if let index = editableButtons.firstIndex(where: { $0.id == button.wrappedValue.id }) {
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

    private var bottomControls: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            actionButtons
            placeholderHint
            tipText
        }
        .padding(Theme.Spacing.lg)
        .background(Color.background)
    }

    private var actionButtons: some View {
        HStack(spacing: Theme.Spacing.md) {
            Button("Add") {
                editableButtons.append(EditableCopyButton(from: CopyButton(id: UUID().uuidString, label: "New", content: "{{IMPLEMENTATION_PLAN}}")))
            }
            .buttonStyle(SecondaryButtonStyle())

            Spacer()

            Button("Save") {
                saveButtons()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private var placeholderHint: some View {
        Text("Placeholders: {{TASK_DESCRIPTION}}, {{IMPLEMENTATION_PLAN}}, {{REQUIREMENTS}}, {{COMMANDS}}, {{STEPS_SECTION}}, {{STEP_CONTENT}}")
            .small()
            .foregroundColor(.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var tipText: some View {
        Text("Tip: Use ☰ handles to drag and reorder • Swipe to delete • Defaults will be used if no buttons are saved")
            .small()
            .foregroundColor(.mutedForeground)
            .italic()
    }

    private func loadButtons() {
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

    private func saveButtons() {
        Task {
            let buttons = editableButtons.map { $0.toCopyButton() }
            let buttonData = buttons.map { ["id": $0.id, "label": $0.label, "content": $0.content] }
            try? await dataService.setProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: "copyButtons", value: buttonData)
        }
    }
}
