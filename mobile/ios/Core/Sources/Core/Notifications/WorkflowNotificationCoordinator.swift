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

            // Check if job just transitioned to completed
            // Only trigger notification if we've seen this job before (previousStatus is not nil)
            // This prevents notifications for jobs that were already completed when the app started
            if let previous = previousStatus, previous != currentStatus && currentStatus == "completed" {
                handleJobCompletion(job)
            }

            // Update status tracking
            lastStatuses[job.id] = currentStatus
        }
    }

    private func handleJobCompletion(_ job: BackgroundJob) {
        let taskType = job.taskType.lowercased()
        let sessionId = job.sessionId
        let projectDirectory = PlanToCodeCore.shared.dataServices?.sessionService.currentSession?.projectDirectory

        if fileFinderTypes.contains(taskType) {
            logger.info("File finder job completed: \(job.id)")
            PushNotificationManager.shared.scheduleFileFinderCompleted(
                sessionId: sessionId,
                projectDirectory: projectDirectory
            )
        } else if planTypes.contains(taskType) {
            logger.info("Implementation plan job completed: \(job.id)")
            let planTitle = PlanContentParser.extractPlanTitle(metadata: job.metadata, response: job.response)
            PushNotificationManager.shared.scheduleImplementationPlanCompleted(
                sessionId: sessionId,
                projectDirectory: projectDirectory,
                jobId: job.id,
                planTitle: planTitle,
                model: job.modelUsed
            )
        }
    }

    /// Start observing job updates
    public static func start() {
        _ = WorkflowNotificationCoordinator.shared
    }
}
