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

    /// Job types that represent umbrella/parent workflow jobs
    private static let workflowUmbrellaTypes: Set<String> = [
        "file_finder_workflow",
        "web_search_workflow"
    ]

    /// Job types that represent implementation plans
    private static let implementationPlanTypes: Set<String> = [
        "implementation_plan",
        "implementation_plan_merge"
    ]

    /// Internal workflow step types that should be hidden from the main jobs list
    private static let hiddenStepTypes: Set<String> = [
        "extended_path_finder",
        "file_relevance_assessment",
        "path_correction",
        "regex_file_filter"
    ]

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

    // MARK: - Type Predicates

    /// Determines if a job is a workflow umbrella job
    public static func isWorkflowUmbrella(_ job: BackgroundJob) -> Bool {
        workflowUmbrellaTypes.contains(job.taskType)
    }

    /// Determines if a job is an implementation plan
    public static func isImplementationPlan(_ job: BackgroundJob) -> Bool {
        implementationPlanTypes.contains(job.taskType)
    }

    /// Determines if a job is an internal workflow step (should be hidden)
    public static func isInternalWorkflowStep(_ job: BackgroundJob) -> Bool {
        hiddenStepTypes.contains(job.taskType)
    }

    // MARK: - Visibility

    /// Check if a job should be visible in the jobs list UI.
    /// Hides internal workflow step jobs.
    /// - Parameter job: The background job to check
    /// - Returns: true if the job should be shown in the list
    public static func isVisibleInJobsList(_ job: BackgroundJob) -> Bool {
        return !hiddenStepTypes.contains(job.taskType)
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
