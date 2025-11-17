import Foundation

/// Parses implementation plan XML content to extract structured information
public class PlanContentParser {

    // MARK: - Types

    public struct ParsedStep {
        public let number: String
        public let title: String
        public let fullContent: String // Includes XML tags
        public let innerContent: String // Without step tags

        public init(number: String, title: String, fullContent: String, innerContent: String) {
            self.number = number
            self.title = title
            self.fullContent = fullContent
            self.innerContent = innerContent
        }
    }

    public struct FileOperation {
        public let type: String // create, modify, delete, move
        public let path: String
        public let changes: String?
        public let validation: String?

        public init(type: String, path: String, changes: String?, validation: String?) {
            self.type = type
            self.path = path
            self.changes = changes
            self.validation = validation
        }
    }

    // MARK: - Public Methods

    /// Extract all steps from an implementation plan
    public static func extractSteps(from content: String) -> [ParsedStep] {
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }

        let stepPattern = #"<step\s+number="(\d+)">([\s\S]*?)</step>"#
        guard let regex = try? NSRegularExpression(pattern: stepPattern, options: []) else {
            return []
        }

        let nsContent = content as NSString
        let matches = regex.matches(in: content, options: [], range: NSRange(location: 0, length: nsContent.length))

        var steps: [ParsedStep] = []

        for match in matches {
            guard match.numberOfRanges >= 3 else { continue }

            let numberRange = match.range(at: 1)
            let contentRange = match.range(at: 2)
            let fullRange = match.range(at: 0)

            guard numberRange.location != NSNotFound,
                  contentRange.location != NSNotFound,
                  fullRange.location != NSNotFound else {
                continue
            }

            let number = nsContent.substring(with: numberRange)
            let innerContent = nsContent.substring(with: contentRange).trimmingCharacters(in: .whitespacesAndNewlines)
            let fullContent = nsContent.substring(with: fullRange)

            // Extract title
            let title = extractTitle(from: innerContent) ?? "Step \(number)"

            steps.append(ParsedStep(
                number: number,
                title: title,
                fullContent: fullContent,
                innerContent: innerContent
            ))
        }

        return steps
    }

    /// Get content for a specific step number
    public static func getContentForStep(_ stepNumber: String, from fullPlan: String) -> String {
        guard !fullPlan.isEmpty && !stepNumber.isEmpty else {
            return ""
        }

        let stepPattern = #"<step\s+number="\#(stepNumber)">([\s\S]*?)</step>"#
        guard let regex = try? NSRegularExpression(pattern: stepPattern, options: []) else {
            return ""
        }

        let nsContent = fullPlan as NSString
        guard let match = regex.firstMatch(in: fullPlan, options: [], range: NSRange(location: 0, length: nsContent.length)),
              match.numberOfRanges >= 2 else {
            return ""
        }

        let contentRange = match.range(at: 1)
        guard contentRange.location != NSNotFound else {
            return ""
        }

        return nsContent.substring(with: contentRange).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Extract agent instructions from plan
    public static func extractAgentInstructions(from content: String) -> String? {
        return extractTagContent("agent_instructions", from: content)
    }

    /// Extract all bash commands from a step
    public static func extractBashCommands(from stepContent: String) -> String? {
        return extractTagContent("bash_commands", from: stepContent)
    }

    /// Extract exploration commands from a step
    public static func extractExplorationCommands(from stepContent: String) -> String? {
        return extractTagContent("exploration_commands", from: stepContent)
    }

    /// Extract description from a step
    public static func extractDescription(from stepContent: String) -> String? {
        return extractTagContent("description", from: stepContent)
    }

    /// Extract file operations from a step
    public static func extractFileOperations(from stepContent: String) -> [FileOperation] {
        guard let fileOpsContent = extractTagContent("file_operations", from: stepContent) else {
            return []
        }

        let operationPattern = #"<operation\s+type="(\w+)">([\s\S]*?)</operation>"#
        guard let regex = try? NSRegularExpression(pattern: operationPattern, options: []) else {
            return []
        }

        let nsContent = fileOpsContent as NSString
        let matches = regex.matches(in: fileOpsContent, options: [], range: NSRange(location: 0, length: nsContent.length))

        var operations: [FileOperation] = []

        for match in matches {
            guard match.numberOfRanges >= 3 else { continue }

            let typeRange = match.range(at: 1)
            let contentRange = match.range(at: 2)

            guard typeRange.location != NSNotFound,
                  contentRange.location != NSNotFound else {
                continue
            }

            let type = nsContent.substring(with: typeRange)
            let opContent = nsContent.substring(with: contentRange)

            let path = extractTagContent("path", from: opContent) ?? ""
            let changes = extractTagContent("changes", from: opContent)
            let validation = extractTagContent("validation", from: opContent)

            operations.append(FileOperation(
                type: type,
                path: path,
                changes: changes,
                validation: validation
            ))
        }

        return operations
    }

    /// Replace placeholders in a template string
    public static func replacePlaceholders(in template: String, with data: [String: String]) -> String {
        // Convert [String: String] to [String: String?] and delegate to PlaceholderUtils
        let optionalData = data.mapValues { $0 as String? }
        return PlaceholderUtils.replacePlaceholders(template: template, data: optionalData)
    }

    /// Extract all commands (bash + exploration) from a step
    public static func extractAllCommands(from stepContent: String) -> String {
        var commands: [String] = []

        if let bashCommands = extractBashCommands(from: stepContent), !bashCommands.isEmpty {
            commands.append("# Implementation Commands")
            commands.append(bashCommands)
        }

        if let exploreCommands = extractExplorationCommands(from: stepContent), !exploreCommands.isEmpty {
            if !commands.isEmpty {
                commands.append("")
            }
            commands.append("# Exploration Commands")
            commands.append(exploreCommands)
        }

        return commands.joined(separator: "\n")
    }

    /// Extract only the steps section from full plan (removes agent instructions, sources, etc.)
    public static func extractStepsSection(from content: String) -> String {
        guard let stepsContent = extractTagContent("steps", from: content) else {
            return content // Fallback to full content if can't parse
        }
        return "<steps>\n\(stepsContent)\n</steps>"
    }

    /// Extract plan title from metadata JSON string or response content
    /// - Parameters:
    ///   - metadata: Optional JSON string containing metadata
    ///   - response: Optional plan response content
    /// - Returns: Extracted title or nil if not found
    public static func extractPlanTitle(metadata: String?, response: String?) -> String? {
        // Try metadata JSON first
        if let metadataString = metadata,
           let metadataData = metadataString.data(using: .utf8),
           let metadataDict = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {

            // Check direct keys
            if let uiTitle = metadataDict["uiTitle"] as? String, !uiTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return uiTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if let title = metadataDict["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return title.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if let planTitle = metadataDict["planTitle"] as? String, !planTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return planTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            }

            // Check nested under taskData
            if let taskData = metadataDict["taskData"] as? [String: Any] {
                if let uiTitle = taskData["uiTitle"] as? String, !uiTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return uiTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if let title = taskData["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return title.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if let planTitle = taskData["planTitle"] as? String, !planTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return planTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if let sessionName = taskData["sessionName"] as? String, !sessionName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return sessionName.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }

            // Check nested under plan
            if let plan = metadataDict["plan"] as? [String: Any] {
                if let uiTitle = plan["uiTitle"] as? String, !uiTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return uiTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if let title = plan["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return title.trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if let planTitle = plan["planTitle"] as? String, !planTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return planTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
        }

        // Try extracting from response content
        if let responseContent = response, !responseContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            // Try <title>...</title> tags
            if let titleFromTag = extractTagContent("title", from: responseContent),
               !titleFromTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return titleFromTag.trimmingCharacters(in: .whitespacesAndNewlines)
            }

            // Try first Markdown H1
            let h1Pattern = #"^#\s+(.+)$"#
            if let h1Regex = try? NSRegularExpression(pattern: h1Pattern, options: .anchorsMatchLines),
               let match = h1Regex.firstMatch(in: responseContent, options: [], range: NSRange(location: 0, length: (responseContent as NSString).length)),
               match.numberOfRanges >= 2 {
                let titleRange = match.range(at: 1)
                if titleRange.location != NSNotFound {
                    let title = (responseContent as NSString).substring(with: titleRange).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !title.isEmpty {
                        return title
                    }
                }
            }

            // Try "Title: ..." lines
            let titleLinePattern = #"^Title:\s*(.+)$"#
            if let titleLineRegex = try? NSRegularExpression(pattern: titleLinePattern, options: [.anchorsMatchLines, .caseInsensitive]),
               let match = titleLineRegex.firstMatch(in: responseContent, options: [], range: NSRange(location: 0, length: (responseContent as NSString).length)),
               match.numberOfRanges >= 2 {
                let titleRange = match.range(at: 1)
                if titleRange.location != NSNotFound {
                    let title = (responseContent as NSString).substring(with: titleRange).trimmingCharacters(in: .whitespacesAndNewlines)
                    if !title.isEmpty {
                        return title
                    }
                }
            }
        }

        return nil
    }

    /// Extract plan title from a BackgroundJob
    /// - Parameter job: The BackgroundJob to extract title from
    /// - Returns: Extracted title or nil if not found
    public static func extractPlanTitle(from job: BackgroundJob) -> String? {
        return extractPlanTitle(metadata: job.metadata, response: job.response)
    }

    /// Convert model ID to display name (last path component)
    /// - Parameter modelId: Full model identifier
    /// - Returns: Display-friendly model name
    public static func displayModelName(_ modelId: String) -> String {
        if let lastComponent = modelId.split(separator: "/").last {
            return String(lastComponent)
        }
        return modelId
    }

    // MARK: - Private Methods

    private static func extractTitle(from stepContent: String) -> String? {
        return extractTagContent("title", from: stepContent)
    }

    private static func extractTagContent(_ tagName: String, from content: String) -> String? {
        let pattern = "<\(tagName)>([\\s\\S]*?)</\(tagName)>"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return nil
        }

        let nsContent = content as NSString
        guard let match = regex.firstMatch(in: content, options: [], range: NSRange(location: 0, length: nsContent.length)),
              match.numberOfRanges >= 2 else {
            return nil
        }

        let contentRange = match.range(at: 1)
        guard contentRange.location != NSNotFound else {
            return nil
        }

        return nsContent.substring(with: contentRange).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}