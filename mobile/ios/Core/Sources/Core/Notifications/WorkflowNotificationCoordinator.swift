import Foundation
import Combine
import OSLog

/// Coordinator that observes job completions and schedules local notifications
@MainActor
public final class WorkflowNotificationCoordinator: ObservableObject {
    public static let shared = WorkflowNotificationCoordinator()

    private let logger = Logger(subsystem: "PlanToCode", category: "WorkflowNotificationCoordinator")
    private var cancellables = Set<AnyCancellable>()
    private var lastStatuses = [String: String]() // jobId -> last known status
    private var notifiedPlanJobIds = Set<String>() // Track which plan jobs have been notified (to avoid duplicates)

    // Task type sets for matching different job types (normalized to lowercase)
    private let fileFinderTypes: Set<String> = [
        "file_finder_workflow",
        "file_finder",
        "filefinder",
        "find_files"
    ]
    private let planTypes: Set<String> = [
        "implementation_plan",
        "implementation_plan_merge"
    ]

    private init() {
        setupObservers()
    }

    private func setupObservers() {
        // Observe job changes from JobsDataService
        guard let jobsService = PlanToCodeCore.shared.dataServices?.jobsService else {
            logger.warning("JobsDataService not available")
            return
        }

        jobsService.$jobs
            .receive(on: DispatchQueue.main)
            .sink { [weak self] jobs in
                guard let self = self else { return }
                self.processJobUpdates(jobs)
            }
            .store(in: &cancellables)
    }

    private func processJobUpdates(_ jobs: [BackgroundJob]) {
        for job in jobs {
            let previousStatus = lastStatuses[job.id]
            let currentStatus = job.status
            let taskType = job.taskType.lowercased()

            // For file finder jobs: trigger on status transition to completed
            if fileFinderTypes.contains(taskType) {
                if let previous = previousStatus, previous != currentStatus && currentStatus == "completed" {
                    handleFileFinderCompletion(job)
                }
            }
            // For implementation plans: trigger only when BOTH job is completed AND markdown is completed
            // This ensures the plan is fully ready before notifying the user
            else if planTypes.contains(taskType) {
                let isJobCompleted = currentStatus == "completed" || currentStatus == "completed_by_tag"
                let markdownStatus = PlanContentParser.extractMarkdownConversionStatus(from: job.metadata)
                let isMarkdownCompleted = markdownStatus == "completed"

                // Only notify if: job completed, markdown completed, and we haven't notified yet
                // We check notifiedPlanJobIds instead of previousStatus to handle cases where
                // markdown completes after status (which is the normal flow)
                if isJobCompleted && isMarkdownCompleted && !notifiedPlanJobIds.contains(job.id) {
                    // Only notify if we've seen this job before (prevents notification on app launch)
                    if previousStatus != nil {
                        handleImplementationPlanCompletion(job)
                    }
                    notifiedPlanJobIds.insert(job.id)
                }
            }

            // Update status tracking
            lastStatuses[job.id] = currentStatus
        }
    }

    private func handleFileFinderCompletion(_ job: BackgroundJob) {
        let sessionId = job.sessionId
        let projectDirectory = PlanToCodeCore.shared.dataServices?.sessionService.currentSession?.projectDirectory

        logger.info("File finder job completed: \(job.id)")
        PushNotificationManager.shared.scheduleFileFinderCompleted(
            sessionId: sessionId,
            projectDirectory: projectDirectory
        )
    }

    private func handleImplementationPlanCompletion(_ job: BackgroundJob) {
        let sessionId = job.sessionId
        let projectDirectory = PlanToCodeCore.shared.dataServices?.sessionService.currentSession?.projectDirectory

        logger.info("Implementation plan job completed with markdown: \(job.id)")
        let planTitle = PlanContentParser.extractPlanTitle(metadata: job.metadata, response: job.response)
        PushNotificationManager.shared.scheduleImplementationPlanCompleted(
            sessionId: sessionId,
            projectDirectory: projectDirectory,
            jobId: job.id,
            planTitle: planTitle,
            model: job.modelUsed
        )
    }

    /// Start observing job updates
    public static func start() {
        _ = WorkflowNotificationCoordinator.shared
    }
}
