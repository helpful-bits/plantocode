import Foundation
import Combine

// MARK: - Workflow & Implementation Plan Tracking

extension JobsDataService {

    // MARK: - Job Type Constants

    static let workflowUmbrellaTypes: Set<String> = ["file_finder_workflow", "web_search_workflow"]
    static let fileFinderStepTypes: Set<String> = ["extended_path_finder", "file_relevance_assessment", "path_correction", "regex_file_filter"]
    static let implementationPlanTypes: Set<String> = ["implementation_plan", "implementation_plan_merge"]

    // MARK: - Job Type Predicates

    func isWorkflowUmbrella(_ job: BackgroundJob) -> Bool {
        Self.workflowUmbrellaTypes.contains(job.taskType)
    }

    func isImplementationPlan(_ job: BackgroundJob) -> Bool {
        Self.implementationPlanTypes.contains(job.taskType)
    }

    func isFileFinderStep(_ job: BackgroundJob) -> Bool {
        Self.fileFinderStepTypes.contains(job.taskType)
    }

    func shouldIgnore(job: BackgroundJob) -> Bool {
        isFileFinderStep(job)
    }

    func isWorkflowJob(_ job: BackgroundJob) -> Bool {
        isWorkflowUmbrella(job)
    }

    func isActiveStatus(_ status: JobStatus) -> Bool {
        status.isActive
    }

    // MARK: - Public Query Methods

    public func activeWorkflowJobsCount(for sessionId: String?) -> Int {
        guard let sessionId = sessionId else { return 0 }
        return activeWorkflowJobsBySession[sessionId] ?? 0
    }

    public func activeImplementationPlansCount(for sessionId: String?) -> Int {
        guard let sessionId = sessionId else { return 0 }
        return activeImplementationPlansBySession[sessionId] ?? 0
    }

    public func isWorkflowUmbrellaJob(_ job: BackgroundJob) -> Bool {
        return isWorkflowUmbrella(job)
    }

    public func isImplementationPlanJob(_ job: BackgroundJob) -> Bool {
        return isImplementationPlan(job)
    }

    // MARK: - Workflow Count Management

    func bumpWorkflowCount(sessionId: String, delta: Int) {
        let current = activeWorkflowJobsBySession[sessionId] ?? 0
        var next = current + delta
        if next < 0 { next = 0 }

        if next > 10 {
            next = 10
            activeWorkflowJobsBySession[sessionId] = next
            if activeSessionId == sessionId {
                sessionActiveWorkflowJobs = next
            }
            scheduleCoalescedListJobsForActiveSession()
            return
        }

        activeWorkflowJobsBySession[sessionId] = next
        if activeSessionId == sessionId {
            sessionActiveWorkflowJobs = next
        }
    }

    func bumpImplementationPlanCount(sessionId: String, delta: Int) {
        let current = activeImplementationPlansBySession[sessionId] ?? 0
        var next = current + delta
        if next < 0 { next = 0 }

        if next > 10 {
            next = 10
            activeImplementationPlansBySession[sessionId] = next
            if activeSessionId == sessionId {
                sessionActiveImplementationPlans = next
            }
            scheduleCoalescedListJobsForActiveSession()
            return
        }

        activeImplementationPlansBySession[sessionId] = next
        if activeSessionId == sessionId {
            sessionActiveImplementationPlans = next
        }
    }

    func recomputeSessionWorkflowCount(for sessionId: String?) {
        guard let sessionId = sessionId else {
            self.sessionActiveWorkflowJobs = 0
            return
        }
        self.sessionActiveWorkflowJobs = activeWorkflowJobsBySession[sessionId] ?? 0
    }

    func recomputeSessionImplementationPlanCount(for sessionId: String?) {
        guard let sessionId = sessionId else {
            self.sessionActiveImplementationPlans = 0
            return
        }
        self.sessionActiveImplementationPlans = activeImplementationPlansBySession[sessionId] ?? 0
    }

    // MARK: - Workflow Counts from Jobs

    func updateWorkflowCountsFromJobs(_ jobs: [BackgroundJob]) {
        // Only update from jobs that ARE workflow umbrella jobs
        let workflowJobs = jobs.filter { isWorkflowUmbrella($0) }

        // If no workflow jobs in the response:
        // - If cache is also empty, we can safely keep counts at 0 (no-op)
        // - If cache has jobs, the response might be incomplete (eventual consistency)
        //   so we should NOT reset counts - relay events are more authoritative
        if workflowJobs.isEmpty {
            if workflowJobsCache.isEmpty {
                // Both empty - safe to reset (though likely already 0)
                activeWorkflowJobsBySession.removeAll()
                recomputeSessionWorkflowCount(for: activeSessionId)
            }
            // Otherwise keep existing cache - response might be stale/incomplete
            return
        }

        // MERGE response with existing cache rather than replacing.
        // Jobs in response get updated with server data (authoritative for existing jobs).
        // Jobs in cache but NOT in response are kept (might be newer than response).
        let responseJobIds = Set(workflowJobs.map { $0.id })
        var mergedCache = workflowJobsCache

        for job in workflowJobs {
            mergedCache[job.id] = job
        }

        // Clean up cached jobs that are in terminal state AND confirmed by server response.
        // If a job is in cache, not in response, and was already inactive, it's safe to remove.
        // This prevents cache bloat while preserving newly created jobs.
        for (jobId, cachedJob) in workflowJobsCache {
            if !responseJobIds.contains(jobId) && !isActiveStatus(cachedJob.jobStatus) {
                mergedCache.removeValue(forKey: jobId)
            }
        }

        // Recompute counts from merged cache
        var countsBySession: [String: Int] = [:]
        for (_, job) in mergedCache {
            if isActiveStatus(job.jobStatus) {
                countsBySession[job.sessionId, default: 0] += 1
            }
        }

        workflowJobsCache = mergedCache
        activeWorkflowJobsBySession = countsBySession
        recomputeSessionWorkflowCount(for: activeSessionId)
    }

    func updateImplementationPlanCountsFromJobs(_ jobs: [BackgroundJob]) {
        // Only update from jobs that ARE implementation plans
        let planJobs = jobs.filter { isImplementationPlan($0) }

        // If no plan jobs in the response:
        // - If cache is also empty, we can safely keep counts at 0 (no-op)
        // - If cache has jobs, the response might be incomplete (eventual consistency)
        //   so we should NOT reset counts - relay events are more authoritative
        if planJobs.isEmpty {
            if implementationPlanCache.isEmpty {
                // Both empty - safe to reset (though likely already 0)
                activeImplementationPlansBySession.removeAll()
                recomputeSessionImplementationPlanCount(for: activeSessionId)
            }
            // Otherwise keep existing cache - response might be stale/incomplete
            return
        }

        // MERGE response with existing cache rather than replacing.
        let responseJobIds = Set(planJobs.map { $0.id })
        var mergedCache = implementationPlanCache

        for job in planJobs {
            mergedCache[job.id] = job
        }

        // Clean up cached jobs that are in terminal state AND confirmed by server response.
        for (jobId, cachedJob) in implementationPlanCache {
            if !responseJobIds.contains(jobId) && !isActiveStatus(cachedJob.jobStatus) {
                mergedCache.removeValue(forKey: jobId)
            }
        }

        // Recompute counts from merged cache
        var countsBySession: [String: Int] = [:]
        for (_, job) in mergedCache {
            if isActiveStatus(job.jobStatus) {
                countsBySession[job.sessionId, default: 0] += 1
            }
        }

        implementationPlanCache = mergedCache
        activeImplementationPlansBySession = countsBySession
        recomputeSessionImplementationPlanCount(for: activeSessionId)
    }

    // MARK: - Cache Validation

    func startCacheValidationTimer() {
        // Invalidate existing timer
        cacheValidationTimer?.invalidate()

        // Validate cache every 15 seconds to catch desync issues
        cacheValidationTimer = Timer.scheduledTimer(withTimeInterval: 15.0, repeats: true) { [weak self] _ in
            self?.validateWorkflowCache()
        }
    }

    func validateWorkflowCache() {
        guard let sessionId = activeSessionId, let projectDirectory = activeProjectDirectory else { return }

        // Debounce: don't validate more than once every 3 seconds to avoid race conditions
        // with rapid job creation. Relay events are authoritative for real-time updates.
        if let lastValidation = lastCacheValidationAt,
           Date().timeIntervalSince(lastValidation) < 3.0 {
            logger.debug("Skipping cache validation - too recent (debounce)")
            return
        }
        lastCacheValidationAt = Date()

        logger.debug("Validating workflow cache for session \(sessionId)")

        // Fetch latest jobs and recompute from authoritative source
        listJobs(request: JobListRequest(
            projectDirectory: projectDirectory,
            sessionId: sessionId,
            pageSize: 100,
            sortBy: .createdAt,
            sortOrder: .desc
        ))
        .sink(
            receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.logger.error("Cache validation failed: \(error.localizedDescription)")
                }
            },
            receiveValue: { [weak self] response in
                self?.logger.debug("Cache validation complete - recomputed workflow counts")
            }
        )
        .store(in: &cancellables)
    }
}
