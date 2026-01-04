import Foundation
import Combine
import OSLog

/// Service for accessing background jobs data from desktop
@MainActor
public class JobsDataService: ObservableObject {
    let logger = Logger(subsystem: "PlanToCode", category: "JobsDataService")

    // MARK: - Published Properties
    @Published public var jobs: [BackgroundJob] = []
    @Published public var isLoading = false
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
        jobs = []
        isLoading = false
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

    func effectiveJobListScope(sessionId: String?, projectDirectory: String?) -> (sessionId: String?, projectDirectory: String?) {
        if let sid = sessionId, !sid.hasPrefix("mobile-session-") {
            return (sid, projectDirectory)
        }
        guard let project = projectDirectory, !project.isEmpty else {
            return (nil, nil)
        }
        return (nil, project)
    }

    public func handleJobsListInvalidated(sessionId: String?, projectDirectory: String?) {
        let (sid, proj) = effectiveJobListScope(
            sessionId: sessionId ?? activeSessionId,
            projectDirectory: projectDirectory ?? activeProjectDirectory
        )
        guard sid != nil || proj != nil else { return }
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

                    for try await rpcResponse in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
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
        let isSameSession = sessionId == activeSessionId

        // Skip fetch entirely if same session AND we have data
        // The 2-second dedup only applies when jobs is not empty (prevents skipping failed fetches)
        if isSameSession && !jobs.isEmpty {
            if hasLoadedOnce {
                logger.debug("Skipping sync for session \(sessionId) - already loaded, relay events handle updates")
                return
            }
            if let lastSync = lastSyncTime, Date().timeIntervalSince(lastSync) < 2.0 {
                logger.debug("Skipping duplicate sync for session \(sessionId) - synced \(Date().timeIntervalSince(lastSync))s ago")
                return
            }
        }

        lastSyncSessionId = sessionId
        lastSyncTime = Date()

        self.activeSessionId = sessionId
        self.activeProjectDirectory = projectDirectory

        // Update workflow job count for new session (from cache, may be stale)
        recomputeSessionWorkflowCount(for: sessionId)
        recomputeSessionImplementationPlanCount(for: sessionId)

        // For mobile sessions, use nil sessionId to fetch ALL jobs (not filtered by session)
        // This matches the view's loadJobs() behavior to prevent token conflicts
        let effectiveSessionId: String? = sessionId.hasPrefix("mobile-session-") ? nil : sessionId

        // Fetch jobs
        listJobs(request: JobListRequest(
            projectDirectory: projectDirectory,
            sessionId: effectiveSessionId,
            pageSize: 100,
            sortBy: .createdAt,
            sortOrder: .desc
        ))
        .sink(
            receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.logger.error("Initial session sync failed: \(error.localizedDescription)")
                }
            },
            receiveValue: { _ in
                // Job counts are updated via updateWorkflowCountsFromJobs/updateImplementationPlanCountsFromJobs
                // which are called internally by listJobsViaRPC
            }
        )
        .store(in: &cancellables)
    }

    /// Stop session-scoped sync (keeps processing relay events)
    public func stopSessionScopedSync() {
        // No-op: Timer was removed, relay events continue processing automatically
    }

    /// Clear jobs from memory
    public func clearJobs() {
        mutateJobs {
            self.jobs.removeAll()
            self.jobsIndex.removeAll()
            self.lastAccumulatedLengths.removeAll()
            self.hydrationWaiters.removeAll()
        }
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

            if let index = self.jobsIndex[id] {
                let currentLen = self.jobs[index].response?.count ?? 0
                self.lastAccumulatedLengths[id] = currentLen
            } else {
                await self.scheduleCoalescedListJobsForActiveSession()
            }
        }
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
            pageSize: 100
        )

        // Fetch without replacing - we'll merge instead
        listJobsViaRPC(request: request, shouldReplace: false)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] response in
                    guard let self = self else { return }

                    self.mergeJobs(fetchedJobs: response.jobs)
                    self.updateWorkflowCountsFromJobs(self.jobs)
                    self.updateImplementationPlanCountsFromJobs(self.jobs)

                    self.syncStatus = JobSyncStatus(
                        activeJobs: response.jobs.count,
                        lastUpdate: Date(),
                        isConnected: true
                    )
                }
            )
            .store(in: &cancellables)
    }

    /// Merge fetched jobs with existing jobs, preserving incremental updates
    /// Note: This only updates/adds jobs, it doesn't remove completed jobs
    /// Completed jobs remain in memory and are updated only via events
    func mergeJobs(fetchedJobs: [BackgroundJob]) {
        mutateJobs {
            for fetchedJob in fetchedJobs {
                if let existingIndex = jobsIndex[fetchedJob.id] {
                    jobs[existingIndex] = fetchedJob
                } else {
                    jobs.append(fetchedJob)
                    jobsIndex[fetchedJob.id] = jobs.count - 1
                }
            }

            jobs.sort {
                ($0.updatedAt ?? $0.createdAt ?? 0) > ($1.updatedAt ?? $1.createdAt ?? 0)
            }

            jobsIndex = Dictionary(uniqueKeysWithValues: jobs.enumerated().map { ($1.id, $0) })
        }
    }

    private func handleJobProgressUpdate(_ update: JobProgressUpdate) {
        // Update local job if it exists - use index for O(1) lookup
        guard let index = jobsIndex[update.jobId] else { return }

        mutateJobs {
            var job = jobs[index]
            job.status = update.status.rawValue
            job.updatedAt = update.timestamp
            jobs[index] = job
        }

        // Update sync status
        syncStatus = JobSyncStatus(
            activeJobs: jobs.filter { $0.jobStatus.isActive }.count,
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
                self.mutateJobs {
                    guard let index = self.jobsIndex[jobId] else { return }
                    var job = self.jobs[index]

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
                        self.jobs[index] = job
                    }
                }
            }
        } catch {
            await MainActor.run {
                self.mutateJobs {
                    guard let index = self.jobsIndex[jobId] else { return }
                    var job = self.jobs[index]

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
                        self.jobs[index] = job
                    }
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
    }
}
