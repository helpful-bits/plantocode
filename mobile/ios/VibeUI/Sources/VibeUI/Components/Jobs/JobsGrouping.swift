import Foundation
import Core

/// Represents a group of jobs that share the same workflow context.
/// Jobs without a workflowId become standalone groups (with workflowId = nil).
public struct JobGroup: Identifiable {
    public let id: String
    public let workflowId: String?
    public let jobs: [BackgroundJob]

    /// Timestamp of the newest job in the group (for sorting).
    /// Uses displayTimestampMs to reflect meaningful activity timestamps.
    public var newestTimestamp: Int64 {
        jobs.map { $0.displayTimestampMs }.max() ?? 0
    }

    /// Initializer for workflow groups (jobs that share a workflowId)
    public init(workflowId: String, jobs: [BackgroundJob]) {
        self.id = "workflow:\(workflowId)"
        self.workflowId = workflowId
        self.jobs = jobs
    }

    /// Initializer for standalone groups (single job without workflowId)
    public init(standaloneJob job: BackgroundJob) {
        self.id = "job:\(job.id)"
        self.workflowId = nil
        self.jobs = [job]
    }
}

/// Extracts the workflowId from a job's metadata JSON string.
/// - Parameter job: The background job to extract workflowId from
/// - Returns: The workflowId if found, nil otherwise
private func extractWorkflowId(from job: BackgroundJob) -> String? {
    guard let metadata = job.metadata,
          let data = metadata.data(using: .utf8),
          let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return nil
    }

    // Check for workflowId at root level
    if let workflowId = dict["workflowId"] as? String {
        return workflowId
    }

    // Check for workflowId in taskData
    if let taskData = dict["taskData"] as? [String: Any],
       let workflowId = taskData["workflowId"] as? String {
        return workflowId
    }

    return nil
}

/// Groups jobs by workflowId for display in the jobs list.
/// - Parameter jobs: Array of background jobs to group
/// - Returns: Array of JobGroup, sorted by newest timestamp DESC
public func groupJobsForDisplay(_ jobs: [BackgroundJob]) -> [JobGroup] {
    // Group jobs by workflowId
    var groupedByWorkflow: [String: [BackgroundJob]] = [:]
    var standaloneJobs: [BackgroundJob] = []

    for job in jobs {
        if let workflowId = extractWorkflowId(from: job) {
            groupedByWorkflow[workflowId, default: []].append(job)
        } else {
            standaloneJobs.append(job)
        }
    }

    var groups: [JobGroup] = []

    // Create groups for workflow-grouped jobs
    for (workflowId, workflowJobs) in groupedByWorkflow {
        // Sort jobs within group by displayTimestampMs DESC
        let sortedJobs = workflowJobs.sorted {
            $0.displayTimestampMs > $1.displayTimestampMs
        }
        groups.append(JobGroup(workflowId: workflowId, jobs: sortedJobs))
    }

    // Create standalone groups for jobs without workflowId
    for job in standaloneJobs {
        groups.append(JobGroup(standaloneJob: job))
    }

    // Sort all groups by newest timestamp DESC
    return groups.sorted { $0.newestTimestamp > $1.newestTimestamp }
}
