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

    /// Determines if a job should be ignored for relay event processing.
    /// IMPORTANT: Returns false for all jobs to match desktop behavior.
    /// Desktop shows internal step types (extended_path_finder, file_relevance_assessment,
    /// regex_file_filter, etc.) in the sidebar. Only workflow umbrella types and
    /// implementation plans are filtered at the visibility layer, not at event processing.
    func shouldIgnore(job: BackgroundJob) -> Bool {
        // Return false for ALL jobs - let visibility filtering happen at the UI layer
        // via JobTypeFilters.isVisibleInJobsList() which correctly hides only:
        // - workflowUmbrellaTypes (file_finder_workflow, web_search_workflow)
        // - implementationPlanTypes (implementation_plan, implementation_plan_merge)
        return false
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

    // MARK: - Session Count Recomputation

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

    func validateWorkflowCache() {
        // Need at least sessionId OR projectDirectory to fetch jobs
        guard self.activeSessionId != nil || self.activeProjectDirectory != nil else {
            logger.debug("Skipping cache validation - no session or project directory")
            return
        }

        // Debounce: don't validate more than once every 3 seconds to avoid race conditions
        // with rapid job creation. Relay events are authoritative for real-time updates.
        if let lastValidation = lastCacheValidationAt,
           Date().timeIntervalSince(lastValidation) < 3.0 {
            logger.debug("Skipping cache validation - too recent (debounce)")
            return
        }
        lastCacheValidationAt = Date()

        logger.debug("Validating workflow cache for session \(self.activeSessionId ?? "nil"), project \(self.activeProjectDirectory ?? "nil")")

        // Use summary-based fetch (includeContent: false) for lightweight cache validation.
        // Summaries contain taskType/status/updatedAt which is sufficient for computing workflow counts.
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            do {
                let summaries = try await self.fetchVisibleJobSummariesSnapshot(reason: .userRefresh)
                self.updateWorkflowCountsFromSummaries(summaries)
                self.updateImplementationPlanCountsFromSummaries(summaries)
                self.logger.debug("Cache validation complete - recomputed workflow counts from \(summaries.count) summaries")
            } catch {
                self.logger.error("Cache validation failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Workflow Counts from Summaries

    func updateWorkflowCountsFromSummaries(_ summaries: [BackgroundJobListItem]) {
        // Only update from summaries that ARE workflow umbrella jobs
        let workflowSummaries = summaries.filter { Self.workflowUmbrellaTypes.contains($0.taskType) }

        // If no workflow summaries in the response:
        // - If cache is also empty, we can safely keep counts at 0 (no-op)
        // - If cache has jobs, the response might be incomplete (eventual consistency)
        //   so we should NOT reset counts - relay events are more authoritative
        if workflowSummaries.isEmpty {
            if workflowJobsCache.isEmpty {
                // Both empty - safe to reset (though likely already 0)
                activeWorkflowJobsBySession.removeAll()
                recomputeSessionWorkflowCount(for: activeSessionId)
            }
            // Otherwise keep existing cache - response might be stale/incomplete
            return
        }

        // Compute counts directly from summaries
        var countsBySession: [String: Int] = [:]
        for summary in workflowSummaries {
            guard let sessionId = summary.sessionId else { continue }
            if summary.jobStatus.isActive {
                countsBySession[sessionId, default: 0] += 1
            }
        }

        activeWorkflowJobsBySession = countsBySession
        recomputeSessionWorkflowCount(for: activeSessionId)
    }

    func updateImplementationPlanCountsFromSummaries(_ summaries: [BackgroundJobListItem]) {
        // Only update from summaries that ARE implementation plans
        let planSummaries = summaries.filter { Self.implementationPlanTypes.contains($0.taskType) }

        // If no plan summaries in the response:
        // - If cache is also empty, we can safely keep counts at 0 (no-op)
        // - If cache has jobs, the response might be incomplete (eventual consistency)
        //   so we should NOT reset counts - relay events are more authoritative
        if planSummaries.isEmpty {
            if implementationPlanCache.isEmpty {
                // Both empty - safe to reset (though likely already 0)
                activeImplementationPlansBySession.removeAll()
                recomputeSessionImplementationPlanCount(for: activeSessionId)
            }
            // Otherwise keep existing cache - response might be stale/incomplete
            return
        }

        // Compute counts directly from summaries
        var countsBySession: [String: Int] = [:]
        for summary in planSummaries {
            guard let sessionId = summary.sessionId else { continue }
            if summary.jobStatus.isActive {
                countsBySession[sessionId, default: 0] += 1
            }
        }

        activeImplementationPlansBySession = countsBySession
        recomputeSessionImplementationPlanCount(for: activeSessionId)
    }
}
