import Foundation
import Combine
import OSLog

/// Service for accessing background jobs data from desktop
@MainActor
public final class JobsDataService: ObservableObject {
    let logger = Logger(subsystem: "PlanToCode", category: "JobsDataService")

    // MARK: - Job Stores

    /// Full job store keyed by jobId - contains real jobs with prompt/response content.
    /// Only populated via job.get RPC calls or job relay events (not from summaries).
    /// Use this for detailed job views that need full content.
    @Published public internal(set) var jobsById: [String: BackgroundJob] = [:]

    /// Authoritative list store keyed by jobId - lightweight summaries without content.
    /// Populated via job.list RPC calls. Drives badge counts and UI list views.
    /// The published `jobs` array is a projection built from this store.
    @Published public internal(set) var jobSummariesById: [String: BackgroundJobListItem] = [:]

    /// Derived state: count of active jobs that contribute to badge
    @Published public private(set) var activeJobsCount: Int = 0

    /// Single-flight reconciliation task to prevent concurrent reconciliation
    private var reconcileTask: Task<Void, Never>?

    /// Source of incoming job data for merge conflict resolution
    public enum MergeSource {
        case snapshot  // Full list from server (authoritative for removals)
        case event     // Incremental update from relay event
    }

    /// Reasons for triggering job reconciliation
    public enum JobsReconcileReason {
        case foregroundResume
        case connectivityReconnected
        case listInvalidated
        case pushHint
        case relayRegistered
        case userRefresh
        case initialLoad
        case periodicSync
        case sessionChanged
    }

    /// Badge count derived from activeJobsCount
    public var badgeCount: Int { activeJobsCount }

    // MARK: - Published Properties
    @Published public var jobs: [BackgroundJob] = []
    @Published public var isLoading = false
    /// Tracks background refresh (when hasLoadedOnce is already true) - prevents full-screen loading states during refreshes
    @Published public private(set) var isRefreshing: Bool = false
    /// Animation token for SwiftUI - increments on each publish cycle to trigger animations
    @Published public private(set) var jobsVersion: Int = 0
    @Published public var error: DataServiceError?
    @Published public var syncStatus: JobSyncStatus?
    @Published public internal(set) var sessionActiveWorkflowJobs: Int = 0
    @Published public internal(set) var sessionActiveImplementationPlans: Int = 0

    // MARK: - Internal Properties (accessed by extensions)
    private(set) var apiClient: APIClientProtocol
    var cancellables = Set<AnyCancellable>()
    private var progressSubscription: AnyCancellable?
    var jobsIndex: [String: Int] = [:]
    public private(set) var activeSessionId: String?
    var activeProjectDirectory: String?
    var currentListJobsRequestToken: UUID?
    @Published public internal(set) var hasLoadedOnce = false
    var lastAccumulatedLengths: [String: Int] = [:]
    var hydrationWaiters: [String: [() -> Void]] = [:]
    var coalescedResyncWorkItem: DispatchWorkItem?
    var lastCoalescedResyncAt: Date?
    var activeWorkflowJobsBySession: [String: Int] = [:]
    var workflowJobsCache: [String: BackgroundJob] = [:]
    var activeImplementationPlansBySession: [String: Int] = [:]
    var implementationPlanCache: [String: BackgroundJob] = [:]
    private var relayJobEventObserver: NSObjectProtocol?
    private var viewedImplementationPlanId: String? = nil
    var cacheValidationTimer: Timer?
    var lastCacheValidationAt: Date?
    private var lastSyncSessionId: String?
    private var lastSyncTime: Date?
    var jobsFetchInFlight: [String: Task<JobListResponse, Error>] = [:]
    var lastJobsFetchAt: [String: Date] = [:]

    private var deviceKey: String {
        MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
    }

    // MARK: - Central Merge Reducer

    /// Debounce work item for high-frequency events like response-appended
    private var debouncedPublishWorkItem: DispatchWorkItem?

    /// Debounce work item for relay-driven summary changes
    private var debouncedSummariesPublishWorkItem: DispatchWorkItem?

    /// Central merge reducer - the single point of truth for job state mutations
    /// All job updates flow through this method to ensure consistent state
    /// - Parameters:
    ///   - incoming: Jobs to merge into the canonical store
    ///   - source: Whether this is a snapshot (full replace) or event (incremental update)
    ///   - isHighFrequency: If true, debounces publish for 100ms (for response-appended events)
    public func reduceJobs(_ incoming: [BackgroundJob], source: MergeSource, isHighFrequency: Bool = false) {
        var updated = jobsById

        for job in incoming {
            let id = job.id
            if let existing = updated[id] {
                updated[id] = resolveConflict(existing: existing, incoming: job, source: source)
            } else {
                updated[id] = job
            }
        }

        // For snapshots, remove jobs not in the incoming set (server is authoritative)
        if case .snapshot = source {
            let incomingIds = Set(incoming.map { $0.id })
            for id in updated.keys {
                if !incomingIds.contains(id) {
                    updated.removeValue(forKey: id)
                }
            }
        }

        jobsById = updated

        // Debounce high-frequency updates (e.g., response-appended) for 100ms
        if isHighFrequency {
            debouncedPublishWorkItem?.cancel()
            let workItem = DispatchWorkItem { [weak self] in
                self?.recomputeDerivedState()
            }
            debouncedPublishWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: workItem)
        } else {
            // Structural changes (created/status/finalized) publish immediately
            recomputeDerivedState()
        }
    }

    /// Recompute all derived state from the canonical jobsById store in a single pass
    /// This is the single source of truth for badge counts
    func recomputeDerivedState() {
        let allJobs = Array(jobsById.values)

        // Compute activeJobsCount from canonical store
        activeJobsCount = allJobs.filter { $0.jobStatus.isActive && JobTypeFilters.isBadgeCountable($0) }.count

        // Sync the derived jobs array (this is the ONLY place it gets updated)
        syncLegacyJobsArray()

        // Bump version token for SwiftUI animations
        bumpJobsVersion()
    }

    /// Increment jobsVersion token for SwiftUI animation triggers (wraps on overflow)
    private func bumpJobsVersion() {
        jobsVersion &+= 1
    }

    /// Reduce job summaries into the authoritative summary store.
    /// This does NOT write to jobsById - summaries are lightweight list items without full content.
    /// jobsById is only populated via job.get / job events with real full job data.
    /// - Parameters:
    ///   - incoming: Job summaries to merge into the store
    ///   - source: Whether this is a snapshot (full replace) or event (incremental update)
    ///     - `.snapshot`: publishes immediately (no debounce), calls recomputeDerivedStateFromSummaries() synchronously
    ///     - `.event`: debounces for 0.1 seconds to batch high-frequency relay events
    public func reduceJobSummaries(_ incoming: [BackgroundJobListItem], source: MergeSource) {
        var updatedSummaries = jobSummariesById

        for summary in incoming {
            let id = summary.id
            if let existing = updatedSummaries[id] {
                let existingTs = existing.updatedAt ?? 0
                let incomingTs = summary.updatedAt ?? 0
                if incomingTs >= existingTs {
                    updatedSummaries[id] = summary
                }
            } else {
                updatedSummaries[id] = summary
            }
        }

        if case .snapshot = source {
            let incomingIds = Set(incoming.map { $0.id })
            for id in updatedSummaries.keys {
                if !incomingIds.contains(id) {
                    updatedSummaries.removeValue(forKey: id)
                }
            }
        }

        jobSummariesById = updatedSummaries

        // Debounce logic based on source:
        // - snapshot: publish immediately (authoritative full list from server)
        // - event: debounce for 0.1 seconds to batch high-frequency relay events
        switch source {
        case .snapshot:
            // Cancel any pending debounced work and publish immediately
            debouncedSummariesPublishWorkItem?.cancel()
            debouncedSummariesPublishWorkItem = nil
            recomputeDerivedStateFromSummaries()

        case .event:
            // Debounce relay-driven summary changes to prevent UI flicker
            debouncedSummariesPublishWorkItem?.cancel()
            let workItem = DispatchWorkItem { [weak self] in
                self?.recomputeDerivedStateFromSummaries()
            }
            debouncedSummariesPublishWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: workItem)
        }
    }

    /// Recompute all derived state from the authoritative jobSummariesById store.
    /// This builds: activeJobsCount (for badges), and the legacy jobs array (as a projection).
    /// The jobs array is built by preferring full jobs from jobsById when available,
    /// falling back to BackgroundJob(from: summary) for UI list compatibility.
    func recomputeDerivedStateFromSummaries() {
        let allSummaries = Array(jobSummariesById.values)

        // Compute activeJobsCount from summaries (authoritative for badge)
        activeJobsCount = allSummaries.filter { $0.jobStatus.isActive && JobTypeFilters.isBadgeCountableSummary($0) }.count

        // Build the legacy jobs array as a projection:
        // - Use full job from jobsById if available (has real content)
        // - Otherwise project from summary for UI list compatibility
        var projectedJobs: [BackgroundJob] = []
        for summary in allSummaries {
            if let fullJob = jobsById[summary.id] {
                // Prefer real full job data
                projectedJobs.append(fullJob)
            } else {
                // Project from summary for UI list compatibility (no prompt/response content)
                projectedJobs.append(BackgroundJob(from: summary))
            }
        }

        // Sort by (updatedAt ?? createdAt) DESC, tie-break by id for stable ordering
        let sortedJobs = projectedJobs.sorted { job1, job2 in
            let time1 = job1.updatedAt ?? job1.createdAt
            let time2 = job2.updatedAt ?? job2.createdAt
            if time1 == time2 {
                return job1.id > job2.id // Stable tie-breaker
            }
            return (time1 ?? 0) > (time2 ?? 0)
        }

        jobs = sortedJobs
        jobsIndex = Dictionary(uniqueKeysWithValues: jobs.enumerated().map { ($1.id, $0) })

        // Update accumulated lengths for new jobs
        for job in sortedJobs {
            if lastAccumulatedLengths[job.id] == nil {
                lastAccumulatedLengths[job.id] = job.response?.count ?? 0
            }
        }

        // Update workflow/implementation plan counts from summaries
        updateWorkflowCountsFromSummaries(allSummaries)
        updateImplementationPlanCountsFromSummaries(allSummaries)

        // Bump version token for SwiftUI animations
        bumpJobsVersion()
    }

    /// Resolve conflicts between existing and incoming job data
    private func resolveConflict(existing: BackgroundJob, incoming: BackgroundJob, source: MergeSource) -> BackgroundJob {
        let existingTimestamp: Int64? = existing.updatedAt ?? existing.createdAt
        let incomingTimestamp: Int64? = incoming.updatedAt ?? incoming.createdAt

        // Compare timestamps if both are available
        switch (existingTimestamp, incomingTimestamp) {
        case let (existingTs?, incomingTs?):
            if existingTs == incomingTs {
                // Equal timestamps: prefer terminal status to prevent regression
                if existing.jobStatus.isTerminal && !incoming.jobStatus.isTerminal {
                    return existing
                }
                return incoming
            }
            return incomingTs > existingTs ? incoming : existing

        case (_?, nil):
            // Existing has timestamp, incoming doesn't - prefer existing
            return existing

        case (nil, _?):
            // Incoming has timestamp, existing doesn't - prefer incoming
            return incoming

        case (nil, nil):
            // Neither has timestamps - trust the source
            return source == .snapshot ? incoming : existing
        }
    }

    /// Sync the derived jobs array from the canonical jobsById store
    /// This is a pure projection - jobs array is ONLY updated here
    private func syncLegacyJobsArray() {
        // Sort by (updatedAt ?? createdAt) DESC, tie-break by id for stable ordering
        let sortedJobs = Array(jobsById.values).sorted { job1, job2 in
            let time1 = job1.updatedAt ?? job1.createdAt
            let time2 = job2.updatedAt ?? job2.createdAt
            if time1 == time2 {
                return job1.id > job2.id // Stable tie-breaker
            }
            return (time1 ?? 0) > (time2 ?? 0)
        }
        jobs = sortedJobs
        jobsIndex = Dictionary(uniqueKeysWithValues: jobs.enumerated().map { ($1.id, $0) })

        // Update accumulated lengths for new jobs
        for job in sortedJobs {
            if lastAccumulatedLengths[job.id] == nil {
                lastAccumulatedLengths[job.id] = job.response?.count ?? 0
            }
        }

        // Update workflow/implementation plan counts from canonical store
        updateWorkflowCountsFromJobs(sortedJobs)
        updateImplementationPlanCountsFromJobs(sortedJobs)
    }

    // MARK: - Initialization

    public init(
        apiClient: APIClientProtocol = APIClient.shared,
        cacheManager _cacheManager: CacheManager = CacheManager.shared
    ) {
        self.apiClient = apiClient

        relayJobEventObserver = NotificationCenter.default.addObserver(
            forName: Notification.Name("relay-event-job"),
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let event = note.userInfo?["event"] as? RelayEvent else { return }
            Task { @MainActor in
                self?.applyRelayEvent(event)
            }
        }
    }

    public convenience init() {
        self.init(
            apiClient: APIClient.shared,
            cacheManager: CacheManager.shared
        )
    }

    public func reset() {
        // Reset canonical store
        jobsById.removeAll()
        jobSummariesById.removeAll()
        activeJobsCount = 0
        reconcileTask?.cancel()
        reconcileTask = nil
        debouncedPublishWorkItem?.cancel()
        debouncedPublishWorkItem = nil
        debouncedSummariesPublishWorkItem?.cancel()
        debouncedSummariesPublishWorkItem = nil

        // Reset derived state
        jobs = []
        isLoading = false
        isRefreshing = false
        jobsVersion = 0
        error = nil
        syncStatus = nil
        jobsIndex = [:]
        activeSessionId = nil
        activeProjectDirectory = nil
        viewedImplementationPlanId = nil
        currentListJobsRequestToken = nil
        hasLoadedOnce = false
        lastAccumulatedLengths.removeAll()
        hydrationWaiters = [:]
        coalescedResyncWorkItem?.cancel()
        coalescedResyncWorkItem = nil
        lastCoalescedResyncAt = nil
        progressSubscription?.cancel()
        progressSubscription = nil
        cancellables.removeAll()
        activeWorkflowJobsBySession.removeAll()
        sessionActiveWorkflowJobs = 0
        workflowJobsCache.removeAll()
        activeImplementationPlansBySession.removeAll()
        sessionActiveImplementationPlans = 0
        implementationPlanCache.removeAll()
        cacheValidationTimer?.invalidate()
        cacheValidationTimer = nil
        lastSyncSessionId = nil
        lastSyncTime = nil

        // Safely manage event subscriptions - remove before re-adding in init if needed
        if let obs = relayJobEventObserver {
            NotificationCenter.default.removeObserver(obs)
            relayJobEventObserver = nil
        }
    }

    // MARK: - Private Helper Methods

    func makeJobListDedupKey(for request: JobListRequest) -> String {
        let sessionPart = request.sessionId ?? "nil-session"
        let projectPart = request.projectDirectory ?? "nil-project"
        let statusPart = (request.statusFilter ?? []).map { $0.rawValue }.joined(separator: ",")
        let taskTypePart = (request.taskTypeFilter ?? []).joined(separator: ",")
        let pagePart = request.page.map { "\($0)" } ?? "nil"
        let pageSizePart = request.pageSize.map { "\($0)" } ?? "nil"
        return "sess:\(sessionPart)|proj:\(projectPart)|status:\(statusPart)|task:\(taskTypePart)|page:\(pagePart)|size:\(pageSizePart)"
    }

    /// Computes effective job list scope, mirroring `determineJobScope()` semantics.
    /// - If sessionId is non-empty and NOT prefixed with "mobile-session-", return (sessionId, projectDirectory)
    /// - Else if projectDirectory is non-empty, return (nil, projectDirectory)
    /// - Else return (nil, nil)
    func effectiveJobListScope(sessionId: String?, projectDirectory: String?) -> (sessionId: String?, projectDirectory: String?) {
        // Normalize empty strings to nil
        let normalizedSessionId: String? = (sessionId?.isEmpty == false) ? sessionId : nil
        let normalizedProjectDirectory: String? = (projectDirectory?.isEmpty == false) ? projectDirectory : nil

        // If sessionId is non-empty and NOT a mobile session, use it with projectDirectory
        if let sid = normalizedSessionId, !sid.hasPrefix("mobile-session-") {
            return (sid, normalizedProjectDirectory)
        }

        // Otherwise, use projectDirectory-only scoping if available
        if let proj = normalizedProjectDirectory {
            return (nil, proj)
        }

        // No valid scope parameters
        return (nil, nil)
    }

    /// Handles job list invalidation events from the desktop.
    /// Triggers a cache-bypassing refresh when any of sessionId, projectDirectory, or projectHash is provided.
    /// - Parameters:
    ///   - sessionId: Optional session ID from the invalidation event
    ///   - projectDirectory: Optional project directory from the invalidation event
    ///   - projectHash: Optional project hash from the invalidation event (new payload field)
    public func handleJobsListInvalidated(sessionId: String?, projectDirectory: String?, projectHash: String? = nil) {
        let (sid, proj) = effectiveJobListScope(
            sessionId: sessionId ?? activeSessionId,
            projectDirectory: projectDirectory ?? activeProjectDirectory
        )
        // Trigger refresh when any scope parameter is available
        guard sid != nil || proj != nil || projectHash != nil else { return }
        scheduleCoalescedListJobsForActiveSession(bypassCache: true)
    }

    // MARK: - Public Methods

    /// List jobs with filtering and pagination
    /// This replaces the entire jobs array - use for initial loads or explicit refreshes
    public func listJobs(request: JobListRequest) -> AnyPublisher<JobListResponse, DataServiceError> {
        isLoading = true
        error = nil

        // Relay-first: directly use RPC-via-relay
        logger.debug("Jobs RPC path selected")
        return listJobsViaRPC(request: request, shouldReplace: true)
    }

    /// Get a single job by ID (returns raw dictionary)
    public func getJob(jobId: String) -> AnyPublisher<[String: Any], DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let rpcRequest = RpcRequest(
            method: "job.get",
            params: ["jobId": jobId]
        )

        return Future<[String: Any], DataServiceError> { promise in
            Task {
                do {
                    var jobData: [String: Any]?

                    for try await rpcResponse in relayClient.invoke(request: rpcRequest) {
                        if let error = rpcResponse.error {
                            promise(.failure(.serverError(error.message)))
                            return
                        }

                        if let result = rpcResponse.result?.value as? [String: Any] {
                            if let jobEnvelope = result["job"] as? [String: Any] {
                                jobData = jobEnvelope
                            } else {
                                jobData = result
                            }
                            if rpcResponse.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = jobData else {
                        promise(.failure(.invalidResponse("No job data received")))
                        return
                    }

                    promise(.success(data))
                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    /// Get detailed job information
    public func getJobDetails(request: JobDetailsRequest) -> AnyPublisher<JobDetailsResponse, DataServiceError> {
        // Relay-first: directly use RPC-via-relay
        logger.debug("Jobs RPC path selected")
        return getJobDetailsViaRPC(request: request)
    }

    /// Cancel a background job
    public func cancelJob(request: JobCancellationRequest) -> AnyPublisher<JobCancellationResponse, DataServiceError> {
        // Relay-first: directly use RPC-via-relay
        logger.debug("Jobs RPC path selected")
        return cancelJobViaRPC(request: request)
    }

    /// Delete a job
    public func deleteJob(jobId: String) -> AnyPublisher<Bool, DataServiceError> {
        return deleteJobViaRPC(jobId: jobId)
    }

    /// Lightweight session setter - updates session context and recomputes counts from cache.
    /// Use this for defensive guards where sync is handled elsewhere.
    /// For accurate job data with immediate fetch, use startSessionScopedSync() instead.
    public func setActiveSession(sessionId: String, projectDirectory: String?) {
        // Only update if session actually changed
        let sessionChanged = self.activeSessionId != sessionId

        self.activeSessionId = sessionId
        self.activeProjectDirectory = projectDirectory

        // Update counts from cache (may be stale if jobs haven't been fetched yet)
        if sessionChanged {
            recomputeSessionWorkflowCount(for: sessionId)
            recomputeSessionImplementationPlanCount(for: sessionId)
        }
    }

    /// Start session-scoped sync for a specific session
    /// This is THE primary entry point for ensuring accurate job data for a session.
    /// It handles: setting active session, and fetching ONLY if needed.
    /// Relay events handle incremental updates after initial load.
    public func startSessionScopedSync(sessionId: String, projectDirectory: String?) {
        // Coalescing guard: Skip duplicate sync within 2s window for same session
        // This reduces bootstrap stampede during rapid session changes
        if sessionId == lastSyncSessionId,
           let lastSync = lastSyncTime,
           Date().timeIntervalSince(lastSync) < 2.0,
           (reconcileTask != nil || hasLoadedOnce) {
            logger.debug("Skipping duplicate sync for session \(sessionId) - synced \(String(format: "%.2f", Date().timeIntervalSince(lastSync)))s ago, reconcileTask=\(self.reconcileTask != nil), hasLoadedOnce=\(self.hasLoadedOnce)")
            return
        }

        // Update sync tracking BEFORE launching reconcileJobs for deterministic guard under concurrent triggers
        lastSyncSessionId = sessionId
        lastSyncTime = Date()

        self.activeSessionId = sessionId
        self.activeProjectDirectory = projectDirectory

        recomputeSessionWorkflowCount(for: sessionId)
        recomputeSessionImplementationPlanCount(for: sessionId)

        Task { await self.reconcileJobs(reason: .initialLoad) }
    }

    /// Stop session-scoped sync (keeps processing relay events)
    public func stopSessionScopedSync() {
        // No-op: Timer was removed, relay events continue processing automatically
    }

    /// Clear jobs from memory
    public func clearJobs() {
        // Clear canonical store - this is the single source of truth
        jobsById.removeAll()
        lastAccumulatedLengths.removeAll()
        hydrationWaiters.removeAll()

        // Recompute derived state (will set jobs = [], jobsIndex = [:], activeJobsCount = 0)
        recomputeDerivedState()
    }

    /// Reset jobs state when active device changes
    @MainActor
    public func onActiveDeviceChanged() {
        reset() // removes relayJobEventObserver and clears state
        // Re-register observer
        relayJobEventObserver = NotificationCenter.default.addObserver(
            forName: .init("relay-event-job"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleRelayJobEvent(notification)
        }

        logger.info("Jobs state reset for device change")
    }

    private func handleRelayJobEvent(_ notification: Notification) {
        guard let event = notification.userInfo?["event"] as? RelayEvent else { return }
        Task { @MainActor in
            self.applyRelayEvent(event)
        }
    }

    /// Called when connection is restored (e.g., app returns from background)
    /// Triggers immediate workflow cache validation to catch any missed events
    @MainActor
    public func onConnectionRestored() {
        logger.info("Connection restored - validating workflow cache")

        // Only validate cache - don't call refreshActiveJobs() which can cause race conditions.
        // validateWorkflowCache() does a full job fetch which is more comprehensive.
        validateWorkflowCache()
    }

    /// Reconcile jobs with single-flight coalescing.
    /// Concurrent calls will wait for the existing reconciliation to complete.
    /// This is the primary entry point for ensuring job data is up-to-date.
    ///
    /// State guarantees (matching desktop behavior):
    /// - `hasLoadedOnce` is set to true after completion, regardless of success or failure
    /// - `error` is set on failure so UI can distinguish error state from empty data
    /// - `error` is cleared on success
    ///
    /// Refresh semantics:
    /// - If `hasLoadedOnce == false`: uses `isLoading` for full-screen loading state (initial load)
    /// - If `hasLoadedOnce == true`: uses `isRefreshing` for background refresh (no full-screen loading)
    public func reconcileJobs(reason: JobsReconcileReason) async {
        // Coalesce concurrent calls - wait for existing reconciliation
        if let existing = reconcileTask {
            await existing.value
            return
        }

        // Set loading state based on whether this is initial load or refresh
        let isInitialLoad = !hasLoadedOnce
        if isInitialLoad {
            isLoading = true
        } else {
            isRefreshing = true
        }

        let task = Task { [weak self] in
            guard let self = self else { return }
            do {
                let summaries = try await self.fetchVisibleJobSummariesSnapshot(reason: reason)
                self.reduceJobSummaries(summaries, source: .snapshot)
                // Clear error on success
                self.error = nil
            } catch let err as DataServiceError {
                self.logger.error("Reconciliation failed for reason \(String(describing: reason)): \(err.localizedDescription)")
                // Set error state so UI can distinguish error from empty
                self.error = err
            } catch {
                self.logger.error("Reconciliation failed for reason \(String(describing: reason)): \(error.localizedDescription)")
                // Wrap non-DataServiceError in networkError
                self.error = .networkError(error)
            }
            // Deterministically set hasLoadedOnce after completion (success or failure)
            // This ensures UI stops showing loading state and can render appropriately
            self.hasLoadedOnce = true

            // Clear refresh state
            if isInitialLoad {
                self.isLoading = false
            } else {
                self.isRefreshing = false
            }
        }
        reconcileTask = task
        await task.value
        reconcileTask = nil
    }

    /// Prefetch job details for multiple jobs in background (best-effort, no loading state)
    public func prefetchJobDetails(jobIds: [String], limit: Int = 20) {
        let idsToFetch = Array(jobIds.prefix(limit))

        // Fetch concurrently on MainActor
        for jobId in idsToFetch {
            let request = JobDetailsRequest(jobId: jobId, includeFullContent: true)
            getJobDetails(request: request)
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        }
    }

    /// Internal helper to prefetch top jobs based on current jobs array
    private func prefetchTopJobsInternal() {
        // Prioritize active jobs, then most recent (limit to 10)
        let topJobs = jobs
            .sorted { job1, job2 in
                if job1.jobStatus.isActive && !job2.jobStatus.isActive { return true }
                if !job1.jobStatus.isActive && job2.jobStatus.isActive { return false }
                let time1 = job1.updatedAt ?? job1.createdAt ?? 0
                let time2 = job2.updatedAt ?? job2.createdAt ?? 0
                return time1 > time2
            }
            .prefix(10)
            .map { $0.id }

        prefetchJobDetails(jobIds: Array(topJobs), limit: 10)
    }

    @MainActor
    public func setViewedImplementationPlanId(_ jobId: String?) {
        if jobId == nil {
            viewedImplementationPlanId = nil
            return
        }

        guard let id = jobId else { return }

        viewedImplementationPlanId = id

        Task { [weak self] in
            guard let self else { return }
            await self.refreshJob(jobId: id)

            // Use canonical store for job lookup
            if let job = self.jobsById[id] {
                let currentLen = job.response?.count ?? 0
                self.lastAccumulatedLengths[id] = currentLen
            } else {
                await self.scheduleCoalescedListJobsForActiveSession()
            }
        }
    }

    @MainActor
    public func isViewingImplementationPlan(jobId: String) -> Bool {
        return viewedImplementationPlanId == jobId
    }

    /// Fast-path job fetch with local cache first, then direct network call
    public func getJobFast(jobId: String) -> AnyPublisher<BackgroundJob, DataServiceError> {
        // Local cache fast-path: check if job exists with non-empty response
        if let cached = self.job(byId: jobId),
           let response = cached.response,
           !response.isEmpty {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Fallback to network RPC
        return getJob(jobId: jobId)
            .tryMap { [weak self] jobDict -> BackgroundJob in
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: jobDict)
                    let decoder = JSONDecoder()
                    // Backend uses camelCase serialization - use default keys
                    return try decoder.decode(BackgroundJob.self, from: jsonData)
                } catch {
                    self?.logger.error("Failed to decode job \(jobId): \(error.localizedDescription)")
                    self?.logger.debug("Job dict keys: \(jobDict.keys.joined(separator: ", "))")

                    // Provide more helpful error message for decoding failures
                    if let decodingError = error as? DecodingError {
                        throw DataServiceError.invalidResponse("Job data format error: \(decodingError.localizedDescription)")
                    }
                    throw error
                }
            }
            .mapError { error in
                error as? DataServiceError ?? .networkError(error)
            }
            .eraseToAnyPublisher()
    }

    public struct JobUpdateResult {
        public let job: BackgroundJob
        public let success: Bool
    }

    public func updateJobContent(jobId: String, newContent: String) async throws -> JobUpdateResult {
        var finalResponse: [String: Any]?

        for try await rpcResponse in CommandRouter.updateImplementationPlanContent(
            jobId: jobId,
            newContent: newContent
        ) {
            if let error = rpcResponse.error {
                throw DataServiceError.serverError(error.message)
            }

            if let result = rpcResponse.result?.value as? [String: Any] {
                finalResponse = result
                if rpcResponse.isFinal {
                    break
                }
            }
        }

        guard let responseData = finalResponse else {
            throw DataServiceError.invalidResponse("No update response received")
        }

        let updatedJob: BackgroundJob
        if let jobData = responseData["job"] as? [String: Any] {
            updatedJob = try JobsDecoding.decodeJob(dict: jobData)
        } else {
            updatedJob = try JobsDecoding.decodeJob(dict: responseData)
        }

        await MainActor.run {
            self.insertOrReplace(job: updatedJob)
            self.lastAccumulatedLengths[jobId] = updatedJob.response?.count ?? 0
        }

        return JobUpdateResult(job: updatedJob, success: true)
    }

    // MARK: - Internal Methods

    public func refreshActiveJobs() {
        guard let activeId = MultiConnectionManager.shared.activeDeviceId,
              MultiConnectionManager.shared.connectionStates[activeId]?.isConnected == true else {
            return
        }

        // Early return if no active session
        guard let sessionId = activeSessionId else {
            return
        }

        let activeStatuses: [JobStatus] = [.created, .queued, .acknowledgedByWorker, .preparing, .preparingInput, .generatingStream, .processingStream, .running]

        let request = JobListRequest(
            projectDirectory: self.activeProjectDirectory,
            sessionId: sessionId,
            statusFilter: activeStatuses,
            pageSize: 50
        )

        // Fetch without replacing - routes through reducer which handles all state updates
        listJobsViaRPC(request: request, shouldReplace: false)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] response in
                    guard let self = self else { return }
                    // State already updated via reducer in listJobsViaRPC
                    // Just update sync status
                    self.syncStatus = JobSyncStatus(
                        activeJobs: response.jobs.count,
                        lastUpdate: Date(),
                        isConnected: true
                    )
                }
            )
            .store(in: &cancellables)
    }

    /// Merge fetched jobs with existing jobs through the canonical reducer
    /// Note: This only updates/adds jobs, it doesn't remove completed jobs
    /// Completed jobs remain in memory and are updated only via events
    func mergeJobs(fetchedJobs: [BackgroundJob]) {
        reduceJobs(fetchedJobs, source: .event)
    }

    private func handleJobProgressUpdate(_ update: JobProgressUpdate) {
        // Update local job if it exists in canonical store
        guard var job = jobsById[update.jobId] else { return }

        job.status = update.status.rawValue
        job.updatedAt = update.timestamp

        // Route through reducer for consistent state management
        reduceJobs([job], source: .event)

        // Update sync status from canonical store
        syncStatus = JobSyncStatus(
            activeJobs: jobsById.values.filter { $0.jobStatus.isActive }.count,
            lastUpdate: Date(),
            isConnected: true
        )
    }

    /// Check if there are any active jobs (jobs in progress)
    public var hasActiveJobs: Bool {
        return jobs.contains { $0.jobStatus.isActive }
    }

    public func generatePlanMarkdown(jobId: String) async {
        do {
            var finalPayload: [String: Any]?

            for try await response in CommandRouter.planGenerateMarkdown(jobId: jobId) {
                if response.isFinal, let data = response.result?.value as? [String: Any] {
                    finalPayload = data
                }
            }

            guard let payload = finalPayload,
                  let markdown = payload["markdown"] as? String else {
                return
            }

            await MainActor.run {
                guard var job = self.jobsById[jobId] else { return }

                var dict: [String: Any] = [:]
                if let metadataString = job.metadata,
                   let data = metadataString.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    dict = json
                }

                dict["markdownResponse"] = markdown
                dict["markdownConversionStatus"] = "completed"

                if let newData = try? JSONSerialization.data(withJSONObject: dict),
                   let newString = String(data: newData, encoding: .utf8) {
                    job.metadata = newString
                    job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                    self.reduceJobs([job], source: .event)
                }
            }
        } catch {
            await MainActor.run {
                guard var job = self.jobsById[jobId] else { return }

                var dict: [String: Any] = [:]
                if let metadataString = job.metadata,
                   let data = metadataString.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    dict = json
                }

                dict["markdownConversionStatus"] = "failed"

                if let newData = try? JSONSerialization.data(withJSONObject: dict),
                   let newString = String(data: newData, encoding: .utf8) {
                    job.metadata = newString
                    job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                    self.reduceJobs([job], source: .event)
                }
            }
        }
    }

    deinit {
        if let obs = relayJobEventObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        cacheValidationTimer?.invalidate()
        progressSubscription?.cancel()
        cancellables.removeAll()
        debouncedPublishWorkItem?.cancel()
        debouncedSummariesPublishWorkItem?.cancel()
    }
}
