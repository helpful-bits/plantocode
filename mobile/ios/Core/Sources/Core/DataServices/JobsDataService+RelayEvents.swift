import Foundation
import Combine

// MARK: - Relay Event Processing

extension JobsDataService {

    // MARK: - Job Lookup & Mutation Helpers

    func job(byId jobId: String) -> BackgroundJob? {
        guard let index = jobsIndex[jobId] else { return nil }
        return jobs[index]
    }

    func insertOrReplace(job: BackgroundJob) {
        guard shouldIgnore(job: job) == false else { return }

        mutateJobs {
            if let index = jobsIndex[job.id] {
                jobs[index] = job
            } else {
                jobs.append(job)
                jobsIndex[job.id] = jobs.count - 1
            }
            lastAccumulatedLengths[job.id] = job.response?.count ?? 0
        }
    }

    func decodeJob(from dictionary: [String: Any]) -> BackgroundJob? {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: dictionary)
            let decoder = JSONDecoder()
            return try decoder.decode(BackgroundJob.self, from: jsonData)
        } catch {
            let jobId = dictionary["id"] as? String ?? "unknown"
            logger.error("Failed to decode job \(jobId): \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Value Extraction Helpers

    func intValue(from value: Any?) -> Int? {
        switch value {
        case let number as NSNumber:
            return number.intValue
        case let string as String:
            return Int(string)
        default:
            return nil
        }
    }

    func doubleValue(from value: Any?) -> Double? {
        switch value {
        case let number as NSNumber:
            return number.doubleValue
        case let string as String:
            return Double(string)
        default:
            return nil
        }
    }

    func boolValue(from value: Any?) -> Bool? {
        switch value {
        case let bool as Bool:
            return bool
        case let number as NSNumber:
            return number.boolValue
        case let string as String:
            return Bool(string)
        default:
            return nil
        }
    }

    // MARK: - Job Hydration

    func hydrateJob(jobId: String, force: Bool, onReady: (() -> Void)?) {
        if !force, jobsIndex[jobId] != nil {
            onReady?()
            return
        }

        if var waiters = hydrationWaiters[jobId] {
            if let onReady = onReady {
                waiters.append(onReady)
                hydrationWaiters[jobId] = waiters
            }
            return
        }

        hydrationWaiters[jobId] = onReady.map { [$0] } ?? []

        getJob(jobId: jobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    guard let self = self else { return }
                    if case .failure(let error) = completion {
                        self.logger.error("Hydration failed for job \(jobId): \(error.localizedDescription)")
                        let waiters = self.hydrationWaiters.removeValue(forKey: jobId) ?? []
                        for waiter in waiters {
                            waiter()
                        }
                    }
                },
                receiveValue: { [weak self] jobDict in
                    guard let self = self else { return }
                    defer {
                        let waiters = self.hydrationWaiters.removeValue(forKey: jobId) ?? []
                        for waiter in waiters {
                            waiter()
                        }
                    }
                    guard let job = self.decodeJob(from: jobDict) else { return }
                    self.insertOrReplace(job: job)
                    self.lastAccumulatedLengths[jobId] = job.response?.count ?? 0
                }
            )
            .store(in: &cancellables)
    }

    @discardableResult
    func ensureJobPresent(jobId: String, onReady: (() -> Void)? = nil) -> Bool {
        if jobsIndex[jobId] != nil {
            return true
        }
        hydrateJob(jobId: jobId, force: false, onReady: onReady)
        return false
    }

    func refreshJob(jobId: String, onReady: (() -> Void)? = nil) {
        hydrateJob(jobId: jobId, force: true, onReady: onReady)
    }

    // MARK: - Coalesced List Jobs

    @MainActor
    func scheduleCoalescedListJobsForActiveSession() {
        coalescedResyncWorkItem?.cancel()

        guard let sessionId = activeSessionId else {
            return
        }

        let delay = 0.4 + Double.random(in: 0...0.3)

        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            Task { @MainActor in
                let isMobileSession = sessionId.hasPrefix("mobile-session-")

                let request = JobListRequest(
                    projectDirectory: isMobileSession ? nil : self.activeProjectDirectory,
                    sessionId: isMobileSession ? nil : sessionId,
                    pageSize: 100
                )

                self.listJobsViaRPC(request: request, shouldReplace: false)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { [weak self] response in
                            guard let self = self else { return }
                            self.mergeJobs(fetchedJobs: response.jobs)
                            self.updateWorkflowCountsFromJobs(self.jobs)
                            self.updateImplementationPlanCountsFromJobs(self.jobs)
                        }
                    )
                    .store(in: &self.cancellables)

                self.lastCoalescedResyncAt = Date()
            }
        }

        coalescedResyncWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    // MARK: - Jobs Array Mutation

    // Centralized publisher for in-place mutations
    func mutateJobs(_ block: () -> Void) {
        self.objectWillChange.send()
        block()
    }

    /// Atomically replace jobs array with minimal UI disruption
    func replaceJobsArray(with newJobs: [BackgroundJob]) {
        mutateJobs {
            self.jobs = newJobs
            self.jobsIndex = Dictionary(uniqueKeysWithValues: newJobs.enumerated().map { ($1.id, $0) })
            self.lastAccumulatedLengths = Dictionary(uniqueKeysWithValues: newJobs.map { ($0.id, $0.response?.count ?? 0) })
        }
    }

    // MARK: - Event ID Extraction

    // Extract jobId from relay event for early guard
    func extractJobId(from event: RelayEvent) -> String? {
        let payload = event.data.mapValues { $0.value }
        return payload["jobId"] as? String
            ?? payload["id"] as? String
            ?? (payload["job"] as? [String: Any])?["id"] as? String
    }

    // MARK: - Workflow Job Count Updates from Events

    func updateWorkflowJobCounts(from event: RelayEvent) {
        let payload = event.data.mapValues { $0.value }

        switch event.eventType {
        case "job:created":
            var jobData: [String: Any]?
            if let dict = payload["job"] as? [String: Any] {
                jobData = dict
            } else if let dict = (payload["job"] as? NSDictionary) as? [String: Any] {
                jobData = dict
            } else if let anyCodable = payload["job"] as? AnyCodable,
                      let dict = anyCodable.value as? [String: Any] {
                jobData = dict
            } else if let payloadDict = payload["payload"] as? [String: Any],
                      let dict = payloadDict["job"] as? [String: Any] {
                jobData = dict
            }

            if let jobData = jobData, let job = decodeJob(from: jobData) {
                let isUmbrella = isWorkflowUmbrella(job)
                let isActive = isActiveStatus(job.jobStatus)

                if isUmbrella {
                    // Only bump count if this is a NEW job (not already in cache)
                    let isNewJob = workflowJobsCache[job.id] == nil
                    workflowJobsCache[job.id] = job
                    if isNewJob && isActive {
                        bumpWorkflowCount(sessionId: job.sessionId, delta: +1)
                    }
                }
            } else {
                scheduleCoalescedListJobsForActiveSession()
            }
        case "job:status-changed":
            // Extract jobId (may be wrapped in AnyCodable)
            var jobId: String?
            if let id = payload["jobId"] as? String {
                jobId = id
            } else if let anyCodable = payload["jobId"] as? AnyCodable, let id = anyCodable.value as? String {
                jobId = id
            } else if let id = payload["id"] as? String {
                jobId = id
            } else if let anyCodable = payload["id"] as? AnyCodable, let id = anyCodable.value as? String {
                jobId = id
            }
            guard let jobId = jobId else { return }

            guard let job = workflowJobsCache[jobId] else {
                hydrateJob(jobId: jobId, force: true, onReady: { [weak self] in
                    guard let self = self else { return }
                    if let hydratedJob = self.job(byId: jobId), self.isWorkflowUmbrella(hydratedJob) {
                        self.workflowJobsCache[jobId] = hydratedJob
                        self.updateWorkflowJobCounts(from: event)
                    }
                })
                return
            }

            // Extract status (may be wrapped in AnyCodable)
            var statusString: String?
            if let s = payload["status"] as? String {
                statusString = s
            } else if let anyCodable = payload["status"] as? AnyCodable, let s = anyCodable.value as? String {
                statusString = s
            }

            if let statusString = statusString,
               let newStatus = JobStatus(rawValue: statusString) {
                let newActive = isActiveStatus(newStatus)
                let oldActive = isActiveStatus(job.jobStatus)
                if newActive != oldActive {
                    bumpWorkflowCount(sessionId: job.sessionId, delta: newActive ? +1 : -1)
                    // When workflow completes (transitions from active to inactive), notify to refresh session
                    if !newActive && job.taskType == "file_finder_workflow" {
                        NotificationCenter.default.post(
                            name: Notification.Name("workflow-completed"),
                            object: nil,
                            userInfo: ["sessionId": job.sessionId, "taskType": job.taskType]
                        )
                    }
                }
                var updatedJob = job
                updatedJob.status = statusString
                workflowJobsCache[jobId] = updatedJob
            }
        case "job:deleted":
            // Extract jobId (may be wrapped in AnyCodable)
            var deletedJobId: String?
            if let id = payload["jobId"] as? String {
                deletedJobId = id
            } else if let anyCodable = payload["jobId"] as? AnyCodable, let id = anyCodable.value as? String {
                deletedJobId = id
            } else if let id = payload["id"] as? String {
                deletedJobId = id
            } else if let anyCodable = payload["id"] as? AnyCodable, let id = anyCodable.value as? String {
                deletedJobId = id
            }
            guard let jobId = deletedJobId else { return }

            guard let job = workflowJobsCache[jobId] else {
                logger.debug("Workflow job \(jobId) not in cache during deletion - already removed or never tracked")
                return
            }

            if isActiveStatus(job.jobStatus) {
                bumpWorkflowCount(sessionId: job.sessionId, delta: -1)
            }
            workflowJobsCache.removeValue(forKey: jobId)
        default:
            break
        }
    }

    // MARK: - Implementation Plan Count Updates from Events

    func updateImplementationPlanCounts(from event: RelayEvent) {
        let payload = event.data.mapValues { $0.value }

        switch event.eventType {
        case "job:created":
            var jobData: [String: Any]?
            if let dict = payload["job"] as? [String: Any] {
                jobData = dict
            } else if let dict = (payload["job"] as? NSDictionary) as? [String: Any] {
                jobData = dict
            } else if let anyCodable = payload["job"] as? AnyCodable,
                      let dict = anyCodable.value as? [String: Any] {
                jobData = dict
            } else if let payloadDict = payload["payload"] as? [String: Any],
                      let dict = payloadDict["job"] as? [String: Any] {
                jobData = dict
            }

            if let jobData = jobData, let job = decodeJob(from: jobData) {
                let isPlan = isImplementationPlan(job)
                let isActive = isActiveStatus(job.jobStatus)

                if isPlan {
                    // Only bump count if this is a NEW job (not already in cache)
                    let isNewJob = implementationPlanCache[job.id] == nil
                    implementationPlanCache[job.id] = job
                    if isNewJob && isActive {
                        bumpImplementationPlanCount(sessionId: job.sessionId, delta: +1)
                    }
                }
            }
        case "job:status-changed":
            // Extract jobId (may be wrapped in AnyCodable)
            var jobId: String?
            if let id = payload["jobId"] as? String {
                jobId = id
            } else if let anyCodable = payload["jobId"] as? AnyCodable, let id = anyCodable.value as? String {
                jobId = id
            } else if let id = payload["id"] as? String {
                jobId = id
            } else if let anyCodable = payload["id"] as? AnyCodable, let id = anyCodable.value as? String {
                jobId = id
            }
            guard let jobId = jobId else { return }

            guard let job = implementationPlanCache[jobId] else {
                // Try to hydrate and re-check if it's an implementation plan
                hydrateJob(jobId: jobId, force: true, onReady: { [weak self] in
                    guard let self = self else { return }
                    if let hydratedJob = self.job(byId: jobId), self.isImplementationPlan(hydratedJob) {
                        self.implementationPlanCache[jobId] = hydratedJob
                        self.updateImplementationPlanCounts(from: event)
                    }
                })
                return
            }

            // Extract status (may be wrapped in AnyCodable)
            var statusString: String?
            if let s = payload["status"] as? String {
                statusString = s
            } else if let anyCodable = payload["status"] as? AnyCodable, let s = anyCodable.value as? String {
                statusString = s
            }

            if let statusString = statusString,
               let newStatus = JobStatus(rawValue: statusString) {
                let newActive = isActiveStatus(newStatus)
                let oldActive = isActiveStatus(job.jobStatus)
                if newActive != oldActive {
                    bumpImplementationPlanCount(sessionId: job.sessionId, delta: newActive ? +1 : -1)

                    // Auto-trigger markdown conversion when implementation plan completes (active → inactive transition)
                    if oldActive == true && newActive == false {
                        Task {
                            await triggerMarkdownConversionIfNeeded(jobId: jobId)
                        }
                    }
                }
                var updatedJob = job
                updatedJob.status = statusString
                implementationPlanCache[jobId] = updatedJob
            }
        case "job:deleted":
            // Extract jobId (may be wrapped in AnyCodable)
            var deletedJobId: String?
            if let id = payload["jobId"] as? String {
                deletedJobId = id
            } else if let anyCodable = payload["jobId"] as? AnyCodable, let id = anyCodable.value as? String {
                deletedJobId = id
            } else if let id = payload["id"] as? String {
                deletedJobId = id
            } else if let anyCodable = payload["id"] as? AnyCodable, let id = anyCodable.value as? String {
                deletedJobId = id
            }
            guard let jobId = deletedJobId else { return }

            guard let job = implementationPlanCache[jobId] else {
                return
            }

            if isActiveStatus(job.jobStatus) {
                bumpImplementationPlanCount(sessionId: job.sessionId, delta: -1)
            }
            implementationPlanCache.removeValue(forKey: jobId)
        default:
            break
        }
    }

    // MARK: - Main Relay Event Handler

    @MainActor
    public func applyRelayEvent(_ event: RelayEvent) {
        // Handle job:* events and plan events
        guard event.eventType.hasPrefix("job:") || event.eventType == "PlanCreated" || event.eventType == "PlanModified" else { return }

        // Update job counters (only for job:* events)
        if event.eventType.hasPrefix("job:") {
            updateWorkflowJobCounts(from: event)
            updateImplementationPlanCounts(from: event)
        }

        // Early guard: coalesced fallback for job:* events missing jobId
        if event.eventType.hasPrefix("job:"),
           extractJobId(from: event) == nil {
            self.scheduleCoalescedListJobsForActiveSession()
            return
        }

        let payload = event.data.mapValues { $0.value }
        let jobId = payload["jobId"] as? String
            ?? payload["id"] as? String
            ?? (payload["job"] as? [String: Any])?["id"] as? String

        // Process all job events regardless of session
        // View layer handles filtering for display

        switch event.eventType {
        case "job:created":
            // Attempt to decode job from payload
            if let jobData = payload["job"] as? [String: Any],
               let job = decodeJob(from: jobData) {
                insertOrReplace(job: job)
                // insertOrReplace already calls mutateJobs internally
                // Schedule coalesced refresh to ensure convergence
                scheduleCoalescedListJobsForActiveSession()
            } else {
                // Payload missing or decode failed - hydrate by jobId
                let jobIdToHydrate = payload["jobId"] as? String
                    ?? (payload["job"] as? [String: Any])?["id"] as? String

                guard let jobIdToHydrate = jobIdToHydrate else {
                    logger.warning("job:created event missing both job payload and jobId")
                    self.scheduleCoalescedListJobsForActiveSession()
                    return
                }

                // Hydrate and re-apply or insert once ready
                hydrateJob(jobId: jobIdToHydrate, force: false, onReady: { [weak self] in
                    guard let self = self else { return }
                    // Job is now present and valid
                    self.scheduleCoalescedListJobsForActiveSession()
                })
            }

        case "job:deleted":
            guard let jobId = jobId else { return }
            if let index = jobsIndex[jobId] {
                mutateJobs {
                    lastAccumulatedLengths.removeValue(forKey: jobId)
                    jobs.remove(at: index)
                    jobsIndex.removeValue(forKey: jobId)
                    jobsIndex = Dictionary(uniqueKeysWithValues: jobs.enumerated().map { ($1.id, $0) })
                }
            }

        case "job:metadata-updated":
            guard let jobId = jobId else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard let index = jobsIndex[jobId] else { return }
            var job = jobs[index]
            guard shouldIgnore(job: job) == false else { return }

            if let metadataPatch = payload["metadataPatch"] as? [String: Any] {
                if let existingMetadata = job.metadata,
                   let metadataData = existingMetadata.data(using: .utf8),
                   var metadataDict = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {

                    for (key, value) in metadataPatch {
                        if let existingValue = metadataDict[key] as? [String: Any],
                           let newValue = value as? [String: Any] {
                            var mergedDict = existingValue
                            for (nestedKey, nestedValue) in newValue {
                                mergedDict[nestedKey] = nestedValue
                            }
                            metadataDict[key] = mergedDict
                        } else {
                            metadataDict[key] = value
                        }
                    }

                    if let updatedData = try? JSONSerialization.data(withJSONObject: metadataDict),
                       let updatedString = String(data: updatedData, encoding: .utf8) {
                        mutateJobs {
                            job.metadata = updatedString
                            job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                            jobs[index] = job
                        }
                    }
                } else if let patchData = try? JSONSerialization.data(withJSONObject: metadataPatch),
                          let patchString = String(data: patchData, encoding: .utf8) {
                    mutateJobs {
                        job.metadata = patchString
                        job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                        jobs[index] = job
                    }
                }
            }

        case "job:status-changed", "job:tokens-updated", "job:cost-updated", "job:finalized":
            guard let jobId = jobId else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard let index = jobsIndex[jobId] else { return }
            var job = jobs[index]
            guard shouldIgnore(job: job) == false else { return }

            if let status = payload["status"] as? String {
                job.status = status
            }
            if let subStatus = payload["subStatusMessage"] as? String {
                job.subStatusMessage = subStatus
            }
            if let updatedAt = intValue(from: payload["updatedAt"]) {
                job.updatedAt = Int64(updatedAt)
            }
            if let startTime = intValue(from: payload["startTime"]) {
                job.startTime = Int64(startTime)
            }
            if let endTime = intValue(from: payload["endTime"]) {
                job.endTime = Int64(endTime)
            }
            if let actualCost = doubleValue(from: payload["actualCost"]) {
                job.actualCost = actualCost
            }
            if let tokensSent = intValue(from: payload["tokensSent"]) {
                job.tokensSent = Int32(tokensSent)
            }
            if let tokensReceived = intValue(from: payload["tokensReceived"]) {
                job.tokensReceived = Int32(tokensReceived)
            }
            if let cacheWrite = intValue(from: payload["cacheWriteTokens"]) {
                job.cacheWriteTokens = Int32(cacheWrite)
            }
            if let cacheRead = intValue(from: payload["cacheReadTokens"]) {
                job.cacheReadTokens = Int32(cacheRead)
            }
            if let finalized = boolValue(from: payload["isFinalized"]) {
                job.isFinalized = finalized
            }
            if let duration = intValue(from: payload["durationMs"]) {
                job.durationMs = Int32(duration)
            }

            mutateJobs {
                if event.eventType == "job:finalized" {
                    lastAccumulatedLengths.removeValue(forKey: jobId)
                    if let response = payload["response"] as? String {
                        job.response = response
                        lastAccumulatedLengths[jobId] = response.count
                    } else {
                        // No response in finalized event - may be truncated, refresh to get full content
                        Task { @MainActor [weak self] in
                            self?.refreshJob(jobId: jobId)
                        }
                    }
                }
                jobs[index] = job
            }

        case "job:response-appended":
            guard let jobId = jobId else { return }
            guard let chunk = payload["chunk"] as? String else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard let index = jobsIndex[jobId] else { return }
            var job = jobs[index]
            guard shouldIgnore(job: job) == false else { return }

            guard let accumulatedLength = intValue(from: payload["accumulatedLength"]) ??
                intValue(from: payload["accumulated_length"]) else {
                refreshJob(jobId: jobId)
                return
            }

            let currentResponse = job.response ?? ""
            let lastKnownLength = lastAccumulatedLengths[jobId] ?? 0

            if accumulatedLength <= lastKnownLength {
                return
            }

            if lastKnownLength + chunk.count == accumulatedLength {
                // NOTE: PlanDetailView assumes job.response length is monotonically non-decreasing
                // while streaming. When accumulatedLength increases and matches lastKnownLength + chunk.count,
                // we append chunk to the current response so observers can trust growing response.count.
                mutateJobs {
                    job.response = currentResponse + chunk
                    lastAccumulatedLengths[jobId] = accumulatedLength
                    job.updatedAt = intValue(from: payload["updatedAt"]).map(Int64.init) ?? job.updatedAt
                    jobs[index] = job
                }
            } else {
                lastAccumulatedLengths[jobId] = accumulatedLength
                refreshJob(jobId: jobId)
            }

        case "job:stream-progress":
            guard let jobId = jobId else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard let index = jobsIndex[jobId] else { return }
            var job = jobs[index]
            guard shouldIgnore(job: job) == false else { return }

            if let existingMetadata = job.metadata,
               let metadataData = existingMetadata.data(using: .utf8),
               var metadataDict = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {

                var taskData = metadataDict["taskData"] as? [String: Any] ?? [:]

                if let progress = doubleValue(from: payload["progress"]) {
                    taskData["streamProgress"] = progress
                }
                if let responseLength = intValue(from: payload["responseLength"]) {
                    taskData["responseLength"] = responseLength
                }
                if let lastStreamUpdateTime = intValue(from: payload["lastStreamUpdateTime"]) {
                    taskData["lastStreamUpdateTime"] = lastStreamUpdateTime
                }

                metadataDict["taskData"] = taskData

                if let updatedData = try? JSONSerialization.data(withJSONObject: metadataDict),
                   let updatedString = String(data: updatedData, encoding: .utf8) {
                    mutateJobs {
                        job.metadata = updatedString
                        job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                        jobs[index] = job
                    }
                }
            }

        case "PlanCreated", "PlanModified":
            // Plan events trigger a coalesced list refresh to ensure convergence
            scheduleCoalescedListJobsForActiveSession()

        default:
            break
        }
    }

    // MARK: - Markdown Conversion Auto-Trigger

    /// Automatically triggers markdown conversion for completed implementation plans
    /// if markdown doesn't already exist
    private func triggerMarkdownConversionIfNeeded(jobId: String) async {
        guard let job = job(byId: jobId) else { return }

        // Do not trigger if markdown already exists in metadata.
        if let _ = PlanContentParser.extractMarkdownResponse(from: job.metadata) {
            return
        }

        await generatePlanMarkdown(jobId: jobId)
    }
}
