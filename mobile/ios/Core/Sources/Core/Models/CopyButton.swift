import Foundation

/// Configuration for a copy/use button on implementation plans
public struct CopyButton: Codable, Identifiable, Hashable {
    public let id: String
    public let label: String
    public let content: String // Template with placeholders like {{IMPLEMENTATION_PLAN}}

    public init(id: String, label: String, content: String) {
        self.id = id
        self.label = label
        self.content = content
    }

    // MARK: - Default Buttons

    /// Default copy buttons for implementation plans
    public static let defaults: [CopyButton] = [
        CopyButton(
            id: "use-full-plan",
            label: "Use Full Plan",
            content: "{{IMPLEMENTATION_PLAN}}"
        ),
        CopyButton(
            id: "use-step",
            label: "Use This Step",
            content: "{{STEP_CONTENT}}"
        ),
        CopyButton(
            id: "use-commands",
            label: "Use Commands",
            content: """
            Here are the commands from the implementation plan:

            {{COMMANDS}}
            """
        ),
        CopyButton(
            id: "use-steps-only",
            label: "Use Steps Only",
            content: "{{STEPS_SECTION}}"
        )
    ]

    // MARK: - Content Processing

    /// Process the button's content template with actual plan data
    public func processContent(planContent: String, stepNumber: String? = nil) -> String {
        var data: [String: String] = [
            "IMPLEMENTATION_PLAN": planContent
        ]

        // Extract step content if step number provided
        if let stepNumber = stepNumber {
            let stepContent = PlanContentParser.getContentForStep(stepNumber, from: planContent)
            data["STEP_CONTENT"] = stepContent

            // Extract commands from this specific step
            let commands = PlanContentParser.extractAllCommands(from: stepContent)
            data["COMMANDS"] = commands
        } else {
            // Extract all commands from all steps
            let steps = PlanContentParser.extractSteps(from: planContent)
            var allCommands: [String] = []

            for step in steps {
                let stepCommands = PlanContentParser.extractAllCommands(from: step.innerContent)
                if !stepCommands.isEmpty {
                    allCommands.append("# Step \(step.number): \(step.title)")
                    allCommands.append(stepCommands)
                    allCommands.append("")
                }
            }

            data["COMMANDS"] = allCommands.joined(separator: "\n")
        }

        // Extract steps section (without agent instructions)
        data["STEPS_SECTION"] = PlanContentParser.extractStepsSection(from: planContent)

        return PlanContentParser.replacePlaceholders(in: content, with: data)
    }
}

/// Manager for copy button configurations
@MainActor
public class CopyButtonManager: ObservableObject {
    public static let shared = CopyButtonManager()

    @Published public private(set) var buttons: [CopyButton] = CopyButton.defaults

    private let userDefaultsKey = "com.vibemanager.copyButtons"

    private init() {
        loadButtons()
    }

    // MARK: - Public Methods

    /// Load buttons from user defaults or use defaults
    public func loadButtons() {
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey),
           let decoded = try? JSONDecoder().decode([CopyButton].self, from: data) {
            buttons = decoded
        } else {
            buttons = CopyButton.defaults
        }
    }

    /// Save custom buttons to user defaults
    public func saveButtons(_ buttons: [CopyButton]) {
        self.buttons = buttons
        if let encoded = try? JSONEncoder().encode(buttons) {
            UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
        }
    }

    /// Reset to default buttons
    public func resetToDefaults() {
        buttons = CopyButton.defaults
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
    }

    /// Add a new button
    public func addButton(_ button: CopyButton) {
        buttons.append(button)
        if let encoded = try? JSONEncoder().encode(buttons) {
            UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
        }
    }

    /// Remove a button
    public func removeButton(id: String) {
        buttons.removeAll { $0.id == id }
        if let encoded = try? JSONEncoder().encode(buttons) {
            UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
        }
    }

    /// Update a button
    public func updateButton(_ button: CopyButton) {
        if let index = buttons.firstIndex(where: { $0.id == button.id }) {
            buttons[index] = button
            if let encoded = try? JSONEncoder().encode(buttons) {
                UserDefaults.standard.set(encoded, forKey: userDefaultsKey)
            }
        }
    }
}