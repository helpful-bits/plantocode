import Foundation
import Combine

// MARK: - Relay Event Processing

extension JobsDataService {

    // MARK: - Job Lookup & Mutation Helpers

    /// Look up a job by ID from the canonical store
    func job(byId jobId: String) -> BackgroundJob? {
        return jobsById[jobId]
    }

    /// Insert or replace a job through the canonical reducer
    func insertOrReplace(job: BackgroundJob) {
        reduceJobs([job], source: .event)
    }

    /// Handle DeviceLinkEvent for job lifecycle routing through reducer
    func handleDeviceLinkEvent(_ event: RelayEvent) {
        let payload = event.data.mapValues { $0.value }

        switch event.eventType {
        case "job:created":
            if let jobData = extractJobDataFromPayload(payload),
               let job = decodeJob(from: jobData) {
                handleJobCreated(job)
            }
        case "job:status-changed":
            if let jobData = extractJobDataFromPayload(payload),
               let job = decodeJob(from: jobData) {
                handleJobStatusChanged(job)
            }
        case "job:finalized":
            if let jobData = extractJobDataFromPayload(payload),
               let job = decodeJob(from: jobData) {
                handleJobFinalized(job)
            }
        case "job:deleted":
            if let jobId = extractJobIdFromPayload(payload) {
                handleJobDeleted(jobId: jobId)
            }
        case "jobs:list-invalidated":
            Task {
                await self.reconcileJobs(reason: .listInvalidated)
            }
        default:
            break
        }
    }

    func decodeJob(from dictionary: [String: Any]) -> BackgroundJob? {
        do {
            return try JobsDecoding.decodeJob(dict: dictionary)
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
        // Check canonical store for job presence
        if !force, jobsById[jobId] != nil {
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
                    // Route through canonical reducer
                    self.reduceJobs([job], source: .event)
                }
            )
            .store(in: &cancellables)
    }

    @discardableResult
    func ensureJobPresent(jobId: String, onReady: (() -> Void)? = nil) -> Bool {
        // Check canonical store for job presence
        if jobsById[jobId] != nil {
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
    func scheduleCoalescedListJobsForActiveSession(bypassCache: Bool = false) {
        coalescedResyncWorkItem?.cancel()

        let (sid, proj) = effectiveJobListScope(sessionId: activeSessionId, projectDirectory: activeProjectDirectory)
        guard sid != nil || proj != nil else {
            return
        }

        let delay = 0.4 + Double.random(in: 0...0.3)

        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            Task { @MainActor in
                let request = JobListRequest(
                    projectDirectory: proj,
                    sessionId: sid,
                    pageSize: 100
                )

                // Route through listJobsViaRPC which uses the canonical reducer
                // bypassCache == true -> shouldReplace = true -> .snapshot source
                // bypassCache == false -> shouldReplace = false -> .event source
                self.listJobsViaRPC(request: request, shouldReplace: bypassCache)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { _ in
                            // State already updated via reducer in listJobsViaRPC
                        }
                    )
                    .store(in: &self.cancellables)

                self.lastCoalescedResyncAt = Date()
            }
        }

        coalescedResyncWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    // MARK: - Payload Extraction Helpers

    /// Extract jobId from payload, handling AnyCodable wrapping
    func extractJobIdFromPayload(_ payload: [String: Any]) -> String? {
        // Direct string
        if let id = payload["jobId"] as? String { return id }
        if let id = payload["id"] as? String { return id }
        // AnyCodable wrapped
        if let anyCodable = payload["jobId"] as? AnyCodable, let id = anyCodable.value as? String { return id }
        if let anyCodable = payload["id"] as? AnyCodable, let id = anyCodable.value as? String { return id }
        // Nested in job object
        if let jobDict = payload["job"] as? [String: Any], let id = jobDict["id"] as? String { return id }
        return nil
    }

    /// Extract job data dictionary from payload, handling various formats
    func extractJobDataFromPayload(_ payload: [String: Any]) -> [String: Any]? {
        if let dict = payload["job"] as? [String: Any] { return dict }
        if let dict = (payload["job"] as? NSDictionary) as? [String: Any] { return dict }
        if let anyCodable = payload["job"] as? AnyCodable, let dict = anyCodable.value as? [String: Any] { return dict }
        if let payloadDict = payload["payload"] as? [String: Any], let dict = payloadDict["job"] as? [String: Any] { return dict }
        return nil
    }

    /// Extract status string from payload, handling AnyCodable wrapping
    func extractStatusFromPayload(_ payload: [String: Any]) -> String? {
        if let s = payload["status"] as? String { return s }
        if let anyCodable = payload["status"] as? AnyCodable, let s = anyCodable.value as? String { return s }
        return nil
    }

    // Extract jobId from relay event for early guard
    func extractJobId(from event: RelayEvent) -> String? {
        let payload = event.data.mapValues { $0.value }
        return extractJobIdFromPayload(payload)
    }

    // MARK: - Main Relay Event Handler

    @MainActor
    public func applyRelayEvent(_ event: RelayEvent) {
        // Handle job:* events and plan events
        guard event.eventType.hasPrefix("job:") || event.eventType == "PlanCreated" || event.eventType == "PlanModified" || event.eventType == "PlanDeleted" else { return }

        // All job state changes flow through the reducer which calls recomputeDerivedState()
        // This ensures consistent badge counts and workflow/implementation plan tracking

        // Early guard: coalesced fallback for job:* events missing jobId
        if event.eventType.hasPrefix("job:"),
           extractJobId(from: event) == nil {
            self.scheduleCoalescedListJobsForActiveSession()
            return
        }

        let payload = event.data.mapValues { $0.value }
        let jobId = extractJobIdFromPayload(payload)

        // Process all job events regardless of session
        // View layer handles filtering for display

        switch event.eventType {
        case "job:created":
            // Attempt to decode job from payload using shared helper
            if let jobData = extractJobDataFromPayload(payload),
               let job = decodeJob(from: jobData) {
                // Route through reducer (immediate publish for structural changes)
                reduceJobs([job], source: .event)
            } else {
                // Payload missing or decode failed - hydrate by jobId
                guard let jobIdToHydrate = jobId else {
                    logger.warning("job:created event missing both job payload and jobId")
                    // Fallback: schedule refresh when we can't decode or hydrate
                    self.scheduleCoalescedListJobsForActiveSession()
                    return
                }

                // Hydrate the job - it will be added via reducer
                hydrateJob(jobId: jobIdToHydrate, force: false, onReady: nil)
            }

        case "job:deleted":
            guard let jobId = jobId else { return }
            handleJobDeleted(jobId: jobId)

        case "job:metadata-updated":
            guard let jobId = jobId else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard var job = jobsById[jobId] else { return }
            guard shouldIgnore(job: job) == false else { return }

            // Desktop sends metadataPatch nested under payload.payload
            // Check both locations for compatibility
            let metadataPatch: [String: Any]? = {
                if let nestedPayload = payload["payload"] as? [String: Any],
                   let patch = nestedPayload["metadataPatch"] as? [String: Any] {
                    return patch
                }
                return payload["metadataPatch"] as? [String: Any]
            }()

            if let metadataPatch = metadataPatch {
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
                        job.metadata = updatedString
                        job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                        // Route through reducer
                        reduceJobs([job], source: .event)
                    }
                } else if let patchData = try? JSONSerialization.data(withJSONObject: metadataPatch),
                          let patchString = String(data: patchData, encoding: .utf8) {
                    job.metadata = patchString
                    job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                    // Route through reducer
                    reduceJobs([job], source: .event)
                }
            }

        case "job:status-changed", "job:tokens-updated", "job:cost-updated", "job:finalized":
            guard let jobId = jobId else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard var job = jobsById[jobId] else { return }
            guard shouldIgnore(job: job) == false else { return }

            // Track status transition for side effects
            let wasActive = job.jobStatus.isActive

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

            // Route through reducer (immediate publish for structural changes)
            reduceJobs([job], source: .event)

            // Handle side effects after reducing
            let isNowActive = job.jobStatus.isActive
            if wasActive && !isNowActive {
                // Post workflow completion notification if transitioning from active to inactive
                if isWorkflowUmbrella(job) {
                    NotificationCenter.default.post(
                        name: Notification.Name("workflow-completed"),
                        object: nil,
                        userInfo: ["sessionId": job.sessionId, "taskType": job.taskType]
                    )
                }

                // Trigger markdown conversion for completed implementation plans
                if isImplementationPlan(job) {
                    Task {
                        await triggerMarkdownConversionIfNeeded(jobId: job.id)
                    }
                }

                // Trigger session refresh for completed file-finding tasks
                if job.jobStatus == .completed && JobTypeFilters.isFileFinderTask(job) {
                    NotificationCenter.default.post(
                        name: Notification.Name("file-finding-job-completed"),
                        object: nil,
                        userInfo: ["sessionId": job.sessionId, "jobId": job.id, "taskType": job.taskType]
                    )
                }
            }

        case "job:response-appended":
            // Mobile doesn't display streaming response content - it shows a spinner during streaming
            // and only displays the final response after job:finalized. So we just ignore these events.
            // The full response will be fetched when the job is finalized.
            break

        case "job:stream-progress":
            guard let jobId = jobId else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard var job = jobsById[jobId] else { return }
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
                    job.metadata = updatedString
                    job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                    // Route through reducer with high-frequency debounce
                    reduceJobs([job], source: .event, isHighFrequency: true)
                }
            }

        case "PlanCreated", "PlanModified", "PlanDeleted":
            let sessionId = payload["sessionId"] as? String
            let projectDirectory = payload["projectDirectory"] as? String
            handleJobsListInvalidated(sessionId: sessionId, projectDirectory: projectDirectory)

        default:
            break
        }
    }

    // MARK: - Canonical Event Handlers (Reducer-Based)

    /// Handle job:created event through canonical reducer
    func handleJobCreated(_ job: BackgroundJob) {
        reduceJobs([job], source: .event)
    }

    /// Handle job:status-changed event through canonical reducer
    /// Also handles side effects like workflow completion notifications
    func handleJobStatusChanged(_ job: BackgroundJob) {
        // Check for status transition side effects before reducing
        let oldJob = self.job(byId: job.id)
        let wasActive = oldJob?.jobStatus.isActive ?? true
        let isNowActive = job.jobStatus.isActive

        reduceJobs([job], source: .event)

        // Post workflow completion notification if transitioning from active to inactive
        if wasActive && !isNowActive && isWorkflowUmbrella(job) {
            NotificationCenter.default.post(
                name: Notification.Name("workflow-completed"),
                object: nil,
                userInfo: ["sessionId": job.sessionId, "taskType": job.taskType]
            )
        }

        // Trigger markdown conversion for completed implementation plans
        if wasActive && !isNowActive && isImplementationPlan(job) {
            Task {
                await triggerMarkdownConversionIfNeeded(jobId: job.id)
            }
        }

        // Trigger session refresh for completed file-finding tasks
        // This ensures mobile has latest file selections even if relay event is delayed
        if wasActive && !isNowActive && job.jobStatus == .completed && JobTypeFilters.isFileFinderTask(job) {
            NotificationCenter.default.post(
                name: Notification.Name("file-finding-job-completed"),
                object: nil,
                userInfo: ["sessionId": job.sessionId, "jobId": job.id, "taskType": job.taskType]
            )
        }
    }

    /// Handle job:finalized event through canonical reducer
    /// Also handles side effects like workflow completion notifications
    func handleJobFinalized(_ job: BackgroundJob) {
        // Check for status transition side effects before reducing
        let oldJob = self.job(byId: job.id)
        let wasActive = oldJob?.jobStatus.isActive ?? true
        let isNowActive = job.jobStatus.isActive

        reduceJobs([job], source: .event)

        // Post workflow completion notification if transitioning from active to inactive
        if wasActive && !isNowActive && isWorkflowUmbrella(job) {
            NotificationCenter.default.post(
                name: Notification.Name("workflow-completed"),
                object: nil,
                userInfo: ["sessionId": job.sessionId, "taskType": job.taskType]
            )
        }

        // Trigger markdown conversion for completed implementation plans
        if wasActive && !isNowActive && isImplementationPlan(job) {
            Task {
                await triggerMarkdownConversionIfNeeded(jobId: job.id)
            }
        }

        // Trigger session refresh for completed file-finding tasks
        // This ensures mobile has latest file selections even if relay event is delayed
        if wasActive && !isNowActive && job.jobStatus == .completed && JobTypeFilters.isFileFinderTask(job) {
            NotificationCenter.default.post(
                name: Notification.Name("file-finding-job-completed"),
                object: nil,
                userInfo: ["sessionId": job.sessionId, "jobId": job.id, "taskType": job.taskType]
            )
        }
    }

    /// Handle job:deleted event - removes job from canonical store and recomputes derived state
    func handleJobDeleted(jobId: String) {
        // Remove from canonical store (single source of truth)
        jobsById.removeValue(forKey: jobId)
        lastAccumulatedLengths.removeValue(forKey: jobId)

        // Recompute derived state (will update jobs array and jobsIndex)
        recomputeDerivedState()
    }

    /// Handle jobs:list-invalidated event - triggers reconciliation
    func handleJobsListInvalidatedEvent(sessionId: String?) {
        Task {
            await self.reconcileJobs(reason: .pushHint)
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
