import Foundation

/// Task type metadata (synchronized with desktop TaskTypeDetails from task-type-defs.ts)
public struct TaskTypeMetadata {
    public let displayName: String
    public let category: String
    public let hidden: Bool

    public init(displayName: String, category: String, hidden: Bool = false) {
        self.displayName = displayName
        self.category = category
        self.hidden = hidden
    }
}

/// Maps task type keys to human-readable display names
/// Synchronized with desktop TaskTypeDetails from task-type-defs.ts
public struct TaskTypeFormatter {

    /// Task type metadata mapping (includes hidden flag)
    private static let taskTypeMetadata: [String: TaskTypeMetadata] = [
        // Core AI tasks
        "implementationPlan": TaskTypeMetadata(displayName: "Implementation Plans", category: "Development"),
        "implementation_plan": TaskTypeMetadata(displayName: "Implementation Plans", category: "Development"),

        "implementationPlanMerge": TaskTypeMetadata(displayName: "Merge Implementation Plans", category: "Development"),
        "implementation_plan_merge": TaskTypeMetadata(displayName: "Merge Implementation Plans", category: "Development"),

        "voiceTranscription": TaskTypeMetadata(displayName: "Voice Transcription", category: "Audio Processing"),
        "voice_transcription": TaskTypeMetadata(displayName: "Voice Transcription", category: "Audio Processing"),

        "textImprovement": TaskTypeMetadata(displayName: "Text Improvement", category: "Text Processing"),
        "text_improvement": TaskTypeMetadata(displayName: "Text Improvement", category: "Text Processing"),

        "pathCorrection": TaskTypeMetadata(displayName: "Path Correction", category: "Code Analysis"),
        "path_correction": TaskTypeMetadata(displayName: "Path Correction", category: "Code Analysis"),

        "taskRefinement": TaskTypeMetadata(displayName: "Task Refinement", category: "Development"),
        "task_refinement": TaskTypeMetadata(displayName: "Task Refinement", category: "Development"),

        // Hidden tasks
        "genericLlmStream": TaskTypeMetadata(displayName: "Generic LLM Stream", category: "General", hidden: true),
        "generic_llm_stream": TaskTypeMetadata(displayName: "Generic LLM Stream", category: "General", hidden: true),

        "streaming": TaskTypeMetadata(displayName: "Streaming", category: "General", hidden: true),

        "localFileFiltering": TaskTypeMetadata(displayName: "Local File Filtering", category: "Workflow Stage", hidden: true),
        "local_file_filtering": TaskTypeMetadata(displayName: "Local File Filtering", category: "Workflow Stage", hidden: true),

        "unknown": TaskTypeMetadata(displayName: "Unknown Task", category: "General", hidden: true),

        // Workflow stages
        "regexFileFilter": TaskTypeMetadata(displayName: "Regex File Filter", category: "Workflow Stage"),
        "regex_file_filter": TaskTypeMetadata(displayName: "Regex File Filter", category: "Workflow Stage"),

        "rootFolderSelection": TaskTypeMetadata(displayName: "Root Folder Selection", category: "Workflow Stage"),
        "root_folder_selection": TaskTypeMetadata(displayName: "Root Folder Selection", category: "Workflow Stage"),

        "fileFinderWorkflow": TaskTypeMetadata(displayName: "File Finder Workflow", category: "Workflow"),
        "file_finder_workflow": TaskTypeMetadata(displayName: "File Finder Workflow", category: "Workflow"),

        "webSearchWorkflow": TaskTypeMetadata(displayName: "Web Search Workflow", category: "Workflow"),
        "web_search_workflow": TaskTypeMetadata(displayName: "Web Search Workflow", category: "Workflow"),

        "fileRelevanceAssessment": TaskTypeMetadata(displayName: "AI File Relevance Assessment", category: "Workflow Stage"),
        "file_relevance_assessment": TaskTypeMetadata(displayName: "AI File Relevance Assessment", category: "Workflow Stage"),

        "extendedPathFinder": TaskTypeMetadata(displayName: "Extended Path Finder", category: "Workflow Stage"),
        "extended_path_finder": TaskTypeMetadata(displayName: "Extended Path Finder", category: "Workflow Stage"),

        "webSearchPromptsGeneration": TaskTypeMetadata(displayName: "Web Search Prompts Generation", category: "Workflow Stage"),
        "web_search_prompts_generation": TaskTypeMetadata(displayName: "Web Search Prompts Generation", category: "Workflow Stage"),

        "webSearchExecution": TaskTypeMetadata(displayName: "Web Search Execution", category: "Workflow Stage"),
        "web_search_execution": TaskTypeMetadata(displayName: "Web Search Execution", category: "Workflow Stage"),

        "videoAnalysis": TaskTypeMetadata(displayName: "Video Analysis", category: "Analysis"),
        "video_analysis": TaskTypeMetadata(displayName: "Video Analysis", category: "Analysis"),
    ]

    /// Task type display name mapping (snake_case and camelCase variants)
    private static let taskTypeDisplayNames: [String: String] = [
        // Core AI tasks
        "implementationPlan": "Implementation Plans",
        "implementation_plan": "Implementation Plans",

        "implementationPlanMerge": "Merge Implementation Plans",
        "implementation_plan_merge": "Merge Implementation Plans",

        "voiceTranscription": "Voice Transcription",
        "voice_transcription": "Voice Transcription",

        "textImprovement": "Text Improvement",
        "text_improvement": "Text Improvement",

        "pathCorrection": "Path Correction",
        "path_correction": "Path Correction",

        "taskRefinement": "Task Refinement",
        "task_refinement": "Task Refinement",

        "genericLlmStream": "Generic LLM Stream",
        "generic_llm_stream": "Generic LLM Stream",

        "regexFileFilter": "Regex File Filter",
        "regex_file_filter": "Regex File Filter",

        "rootFolderSelection": "Root Folder Selection",
        "root_folder_selection": "Root Folder Selection",

        "fileFinderWorkflow": "File Finder Workflow",
        "file_finder_workflow": "File Finder Workflow",

        "webSearchWorkflow": "Web Search Workflow",
        "web_search_workflow": "Web Search Workflow",

        "streaming": "Streaming",

        "localFileFiltering": "Local File Filtering",
        "local_file_filtering": "Local File Filtering",

        "fileRelevanceAssessment": "AI File Relevance Assessment",
        "file_relevance_assessment": "AI File Relevance Assessment",

        "extendedPathFinder": "Extended Path Finder",
        "extended_path_finder": "Extended Path Finder",

        "webSearchPromptsGeneration": "Web Search Prompts Generation",
        "web_search_prompts_generation": "Web Search Prompts Generation",

        "webSearchExecution": "Web Search Execution",
        "web_search_execution": "Web Search Execution",

        "videoAnalysis": "Video Analysis",
        "video_analysis": "Video Analysis",

        "unknown": "Unknown Task",
    ]

    /// Task type categories for grouping
    private static let taskTypeCategories: [String: String] = [
        "implementationPlan": "Development",
        "implementationPlanMerge": "Development",
        "voiceTranscription": "Audio Processing",
        "textImprovement": "Text Processing",
        "pathCorrection": "Code Analysis",
        "taskRefinement": "Development",
        "regexFileFilter": "Workflow Stage",
        "rootFolderSelection": "Workflow Stage",
        "fileRelevanceAssessment": "Workflow Stage",
        "extendedPathFinder": "Workflow Stage",
        "webSearchPromptsGeneration": "Workflow Stage",
        "webSearchExecution": "Workflow Stage",
        "videoAnalysis": "Analysis",
        "fileFinderWorkflow": "Workflow",
        "webSearchWorkflow": "Workflow",
    ]

    /// Check if task type should be hidden from UI
    /// - Parameter taskKey: The task type key
    /// - Returns: true if task should be hidden
    public static func isHidden(_ taskKey: String) -> Bool {
        return taskTypeMetadata[taskKey]?.hidden ?? false
    }

    /// Convert task type key to display name
    /// - Parameter taskKey: The task type key (e.g., "implementationPlan" or "implementation_plan")
    /// - Returns: Human-readable display name (e.g., "Implementation Plans")
    public static func displayName(for taskKey: String) -> String {
        if let metadata = taskTypeMetadata[taskKey] {
            return metadata.displayName
        }

        if let name = taskTypeDisplayNames[taskKey] {
            return name
        }

        // Fallback: Convert camelCase to Title Case
        return camelCaseToTitleCase(taskKey)
    }

    /// Get category for task type
    /// - Parameter taskKey: The task type key
    /// - Returns: Category name or nil
    public static func category(for taskKey: String) -> String? {
        if let metadata = taskTypeMetadata[taskKey] {
            return metadata.category
        }
        return taskTypeCategories[taskKey]
    }

    /// Convert camelCase to Title Case as fallback
    /// - Parameter text: camelCase text
    /// - Returns: Title Case text
    private static func camelCaseToTitleCase(_ text: String) -> String {
        // Replace underscores with spaces first (for snake_case)
        let withSpaces = text.replacingOccurrences(of: "_", with: " ")

        // Insert spaces before capital letters
        var result = ""
        for (index, char) in withSpaces.enumerated() {
            if char.isUppercase && index > 0 {
                result.append(" ")
            }
            result.append(char)
        }

        // Capitalize first letter of each word
        return result.split(separator: " ")
            .map { word in
                guard !word.isEmpty else { return "" }
                let first = word.prefix(1).uppercased()
                let rest = word.dropFirst()
                return first + rest
            }
            .joined(separator: " ")
    }

    /// Group task types by category
    /// - Parameter taskKeys: Array of task type keys
    /// - Returns: Dictionary of category -> task keys
    public static func groupByCategory(_ taskKeys: [String]) -> [String: [String]] {
        var grouped: [String: [String]] = [:]

        for taskKey in taskKeys {
            let category = self.category(for: taskKey) ?? "Other"
            if grouped[category] == nil {
                grouped[category] = []
            }
            grouped[category]?.append(taskKey)
        }

        return grouped
    }
}
