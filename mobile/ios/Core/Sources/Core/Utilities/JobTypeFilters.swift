import Foundation

// MARK: - Plan Task Type Helpers

public let planTaskTypeKeywords: Set<String> = [
    "implementation_plan", "plan_merge", "plans",
    "create_implementation_plan", "merge_plans", "implementationPlan"
]

public func isPlanTaskType(_ t: String) -> Bool {
    let lower = t.lowercased()
    if lower.contains("plan") { return true }
    if planTaskTypeKeywords.contains(t) { return true }
    return false
}

// MARK: - Job Type Filters

/// Centralized filtering logic for background jobs.
/// Used for badge counts, list visibility, and other job-related filtering.
///
/// ## Visibility Alignment with Desktop
///
/// This filter aligns iOS Jobs tab visibility with desktop/server semantics:
///
/// **HIDDEN from Jobs list (2 categories):**
/// 1. Workflow umbrella types: `file_finder_workflow`, `web_search_workflow`
///    - These are parent orchestrator jobs, not user-facing tasks
/// 2. Implementation plan types: `implementation_plan`, `implementation_plan_merge`
///    - iOS-specific: shown in separate Plans tab
///
/// **VISIBLE in Jobs list (explicitly NOT hidden):**
/// - Internal workflow step types: `extended_path_finder`, `file_relevance_assessment`,
///   `regex_file_filter`, `path_correction` - these match desktop sidebar behavior
/// - Task types: `text_improvement`, `task_refinement`, `video_analysis`,
///   `web_search_prompts_generation`, `web_search_execution`, `root_folder_selection`, etc.
/// - All other job types not in the hidden categories
///
public struct JobTypeFilters {

    // MARK: - Type Definitions

    /// Job types that contribute to badge counts.
    /// Badge-countable jobs are active workflow umbrella jobs and implementation plans.
    private static let badgeCountableTypes: Set<String> = [
        "file_finder_workflow",
        "web_search_workflow",
        "implementation_plan",
        "implementation_plan_merge"
    ]

    /// Job types that represent umbrella/parent workflow jobs.
    /// These are HIDDEN from the Jobs list.
    private static let workflowUmbrellaTypes: Set<String> = [
        "file_finder_workflow",
        "web_search_workflow"
    ]

    /// Job types that represent implementation plans.
    /// These are HIDDEN from the Jobs list (shown in separate Plans tab on iOS).
    private static let implementationPlanTypes: Set<String> = [
        "implementation_plan",
        "implementation_plan_merge"
    ]

    /// Internal workflow step types - classification set for `isInternalWorkflowStep` predicate.
    /// NOTE: These are NOT used for visibility filtering. These job types ARE visible
    /// in the Jobs list to match desktop sidebar behavior.
    private static let internalStepTypes: Set<String> = [
        "extended_path_finder",
        "file_relevance_assessment",
        "regex_file_filter",
        "path_correction"
    ]

    /// Centralized predicate for job list visibility.
    ///
    /// Hidden from Jobs list:
    /// - Workflow umbrella types (file_finder_workflow, web_search_workflow)
    /// - Implementation plan types (implementation_plan, implementation_plan_merge)
    ///
    /// Explicitly VISIBLE (not hidden):
    /// - Internal step types (extended_path_finder, file_relevance_assessment, regex_file_filter)
    /// - text_improvement, task_refinement, video_analysis
    /// - web_search_prompts_generation, web_search_execution
    /// - root_folder_selection
    /// - All other job types
    ///
    /// This matches desktop sidebar filtering behavior where only umbrella workflow jobs
    /// are excluded from the visible jobs list.
    private static func isHiddenFromJobsList(_ taskType: String) -> Bool {
        return workflowUmbrellaTypes.contains(taskType)
            || implementationPlanTypes.contains(taskType)
    }

    /// File-finding task types that trigger session file refresh on completion
    private static let fileFinderTaskTypes: Set<String> = [
        "regex_file_filter",
        "file_relevance_assessment",
        "extended_path_finder",
        "root_folder_selection"
    ]

    // MARK: - Badge Counting

    /// Check if a job should be counted in the active jobs badge.
    /// Badge count only includes active workflow umbrella jobs and implementation plans.
    /// - Parameter job: The background job to check
    /// - Returns: true if the job should be included in badge count
    public static func isBadgeCountable(_ job: BackgroundJob) -> Bool {
        guard job.jobStatus.isActive else { return false }
        return badgeCountableTypes.contains(job.taskType)
    }

    /// Check if a job summary should be counted in the active jobs badge.
    /// Badge count only includes active workflow umbrella jobs and implementation plans.
    /// - Parameter summary: The background job list item to check
    /// - Returns: true if the job should be included in badge count
    public static func isBadgeCountableSummary(_ summary: BackgroundJobListItem) -> Bool {
        guard summary.jobStatus.isActive else { return false }
        return badgeCountableTypes.contains(summary.taskType)
    }

    // MARK: - Type Predicates

    /// Determines if a job is a workflow umbrella job
    public static func isWorkflowUmbrella(_ job: BackgroundJob) -> Bool {
        workflowUmbrellaTypes.contains(job.taskType)
    }

    /// Determines if a job is an implementation plan
    public static func isImplementationPlan(_ job: BackgroundJob) -> Bool {
        implementationPlanTypes.contains(job.taskType)
    }

    /// Determines if a job is an internal workflow step (shown in jobs list to match desktop)
    public static func isInternalWorkflowStep(_ job: BackgroundJob) -> Bool {
        internalStepTypes.contains(job.taskType)
    }

    // MARK: - Visibility

    /// Check if a job should be visible in the jobs list UI.
    /// Hides workflow umbrella types and implementation plans (shown in separate Plans tab).
    /// Shows internal step types to match desktop sidebar behavior.
    /// - Parameter job: The background job to check
    /// - Returns: true if the job should be shown in the list
    public static func isVisibleInJobsList(_ job: BackgroundJob) -> Bool {
        return !isHiddenFromJobsList(job.taskType)
    }

    /// Check if a job summary should be visible in the jobs list UI.
    /// Hides workflow umbrella types and implementation plans (shown in separate Plans tab).
    /// Shows internal step types to match desktop sidebar behavior.
    /// - Parameter summary: The background job list item to check
    /// - Returns: true if the job should be shown in the list
    public static func isVisibleInJobsListSummary(_ summary: BackgroundJobListItem) -> Bool {
        return !isHiddenFromJobsList(summary.taskType)
    }

    /// Determines if a job is a file-finding task that should trigger session refresh on completion
    public static func isFileFinderTask(_ job: BackgroundJob) -> Bool {
        fileFinderTaskTypes.contains(job.taskType)
    }

    /// Determines if a task type is a file-finding task
    public static func isFileFinderTaskType(_ taskType: String) -> Bool {
        fileFinderTaskTypes.contains(taskType)
    }
}
