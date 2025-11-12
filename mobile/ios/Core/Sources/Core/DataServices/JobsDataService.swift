import Foundation
import Combine
import OSLog

/// Service for accessing background jobs data from desktop
@MainActor
public class JobsDataService: ObservableObject {
    private let logger = Logger(subsystem: "PlanToCode", category: "JobsDataService")

    // MARK: - Published Properties
    @Published public var jobs: [BackgroundJob] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    @Published public var syncStatus: JobSyncStatus?
    @Published public private(set) var sessionActiveWorkflowJobs: Int = 0

    // MARK: - Private Properties
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private var cancellables = Set<AnyCancellable>()
    private var progressSubscription: AnyCancellable?
    private var jobsIndex: [String: Int] = [:]
    public private(set) var activeSessionId: String?
    private var activeProjectDirectory: String?
    private var currentListJobsRequestToken: UUID?
    @Published public private(set) var hasLoadedOnce = false
    private var lastJobsFetch: [String: Date] = [:] // cacheKey -> timestamp
    private var lastAccumulatedLengths: [String: Int] = [:]
    private var hydrationWaiters: [String: [() -> Void]] = [:]
    private var coalescedResyncWorkItem: DispatchWorkItem?
    private var lastCoalescedResyncAt: Date?
    private var activeWorkflowJobsBySession: [String: Int] = [:]
    private var workflowJobsCache: [String: BackgroundJob] = [:]

    private var deviceKey: String {
        MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
    }

    // MARK: - Initialization
    public init(
        apiClient: APIClientProtocol = APIClient.shared,
        cacheManager: CacheManager = CacheManager.shared
    ) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
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
        currentListJobsRequestToken = nil
        hasLoadedOnce = false
        lastJobsFetch = [:]
        lastAccumulatedLengths = [:]
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
    }

    // MARK: - Public Methods

    /// List jobs with filtering and pagination
    /// This replaces the entire jobs array - use for initial loads or explicit refreshes
    public func listJobs(request: JobListRequest) -> AnyPublisher<JobListResponse, DataServiceError> {
        isLoading = true
        error = nil

        let cacheKey = "dev_\(deviceKey)_jobs_\(request.cacheKey)"

        // Try cache first if enabled
        if let cached: JobListResponse = cacheManager.get(key: cacheKey) {
            isLoading = false
            // Replace jobs array with cached data
            replaceJobsArray(with: cached.jobs)
            updateWorkflowCountsFromJobs(cached.jobs)

            let now = Date()
            let shouldRefresh = lastJobsFetch[cacheKey].map { now.timeIntervalSince($0) > 5.0 } ?? true
            if shouldRefresh {
                lastJobsFetch[cacheKey] = now
                listJobsViaRPC(request: request, cacheKey: cacheKey, shouldReplace: true)
                    .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
                    .store(in: &cancellables)
            }

            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Relay-first: directly use RPC-via-relay
        logger.debug("Jobs RPC path selected")
        return listJobsViaRPC(request: request, cacheKey: cacheKey, shouldReplace: true)
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

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error: \(error.message)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any] {
                            // Unwrap the "job" envelope if present, otherwise use result directly
                            if let jobEnvelope = result["job"] as? [String: Any] {
                                jobData = jobEnvelope
                            } else {
                                jobData = result
                            }
                            if response.isFinal {
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
        let cacheKey = "dev_\(deviceKey)_job_details_\(request.jobId)"

        if let cached: JobDetailsResponse = cacheManager.get(key: cacheKey) {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Relay-first: directly use RPC-via-relay
        logger.debug("Jobs RPC path selected")
        return getJobDetailsViaRPC(request: request, cacheKey: cacheKey)
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

    /// Subscribe to real-time job progress updates
    public func subscribeToJobUpdates(clientId: String) -> AnyPublisher<JobProgressUpdate, DataServiceError> {
        return apiClient.requestStream(
            endpoint: .subscribeJobUpdates,
            method: .POST,
            body: ["clientId": clientId]
        )
        .decode(type: JobProgressUpdate.self, decoder: JSONDecoder.apiDecoder)
        .receive(on: DispatchQueue.main)
        .handleEvents(receiveOutput: { [weak self] update in
            self?.handleJobProgressUpdate(update)
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Set the active session (enables background event processing and does initial fetch)
    public func setActiveSession(sessionId: String, projectDirectory: String?) {
        // Only fetch if session actually changed
        let sessionChanged = self.activeSessionId != sessionId

        self.activeSessionId = sessionId
        self.activeProjectDirectory = projectDirectory

        // Update workflow job count for new session
        recomputeSessionWorkflowCount(for: sessionId)

        // Do initial background fetch if session changed
        if sessionChanged {
            let request = JobListRequest(
                projectDirectory: projectDirectory,
                sessionId: sessionId,
                pageSize: 100,
                sortBy: .createdAt,
                sortOrder: .desc
            )

            listJobs(request: request)
                .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
                .store(in: &cancellables)
        }
    }

    /// Start session-scoped sync for a specific session
    public func startSessionScopedSync(sessionId: String, projectDirectory: String?) {
        self.activeSessionId = sessionId
        self.activeProjectDirectory = projectDirectory

        // Update workflow job count for new session
        recomputeSessionWorkflowCount(for: sessionId)

        // No polling; rely on relay events while connected and reconnection snapshot orchestrated by DataServicesManager.

        // Perform a full list snapshot to establish authoritative baseline
        listJobs(request: JobListRequest(
            projectDirectory: projectDirectory,
            sessionId: sessionId,
            pageSize: 100
        ))
        .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
        .store(in: &cancellables)

        // Also refresh active jobs
        self.refreshActiveJobs()
    }

    /// Stop session-scoped sync timer (but keep processing events)
    public func stopSessionScopedSync() {
        // Keep activeSessionId and activeProjectDirectory so events continue processing in background
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
        // Cancel progress subscription
        progressSubscription?.cancel()
        progressSubscription = nil

        // Clear all jobs
        clearJobs()

        // Invalidate caches with device-specific prefix
        let deviceKey = MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
        cacheManager.invalidatePattern("dev_\(deviceKey)_jobs_")
        cacheManager.invalidatePattern("dev_\(deviceKey)_job_details_")

        // Reset flags
        hasLoadedOnce = false
        error = nil
        isLoading = false
        currentListJobsRequestToken = nil

        // Reset workflow job tracking
        activeWorkflowJobsBySession.removeAll()
        sessionActiveWorkflowJobs = 0
        workflowJobsCache.removeAll()

        logger.info("Jobs state reset for device change")
    }

    /// Get status updates for specific jobs
    public func getJobStatusUpdates(jobIds: [String]) -> AnyPublisher<[JobProgressUpdate], DataServiceError> {
        return apiClient.request(
            endpoint: .getJobStatusUpdates,
            method: .POST,
            body: ["jobIds": jobIds]
        )
        .decode(type: [JobProgressUpdate].self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
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

    /// Fast-path job fetch with cache-first strategy
    public func getJobFast(jobId: String) -> AnyPublisher<BackgroundJob, DataServiceError> {
        // Check cache first
        let cacheKey = "dev_\(deviceKey)_job_details_\(jobId)"
        if let cached: JobDetailsResponse = cacheManager.get(key: cacheKey) {
            return Just(cached.job)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Use existing getJob RPC
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
            .handleEvents(receiveOutput: { [weak self] job in
                // Cache as JobDetailsResponse for consistency
                let response = JobDetailsResponse(job: job, metrics: nil)
                self?.cacheManager.set(response, forKey: cacheKey, ttl: 600)
            })
            .mapError { error in
                error as? DataServiceError ?? .networkError(error)
            }
            .eraseToAnyPublisher()
    }

    // MARK: - Private Methods

    private func refreshActiveJobs() {
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

        let cacheKey = "dev_\(deviceKey)_jobs_\(request.cacheKey)"

        // Fetch without replacing - we'll merge instead
        listJobsViaRPC(request: request, cacheKey: cacheKey, shouldReplace: false)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] response in
                    guard let self = self else { return }

                    self.mergeJobs(fetchedJobs: response.jobs)
                    self.updateWorkflowCountsFromJobs(self.jobs)

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
    private func mergeJobs(fetchedJobs: [BackgroundJob]) {
        mutateJobs {
            for fetchedJob in fetchedJobs {
                if let existingIndex = jobsIndex[fetchedJob.id] {
                    // Update existing job - the server data is source of truth
                    // Any event-based updates between fetch and now will be corrected by next event
                    jobs[existingIndex] = fetchedJob
                } else {
                    // Add new job that we didn't know about
                    jobs.append(fetchedJob)
                    jobsIndex[fetchedJob.id] = jobs.count - 1
                }
            }

            // Rebuild index to ensure consistency after any additions
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

        // Invalidate relevant cache entries
        cacheManager.invalidatePattern("jobs_")
        cacheManager.invalidatePattern("job_details_\(update.jobId)")

        // Update sync status
        syncStatus = JobSyncStatus(
            activeJobs: jobs.filter { JobStatus(rawValue: $0.status)?.isActive == true }.count,
            lastUpdate: Date(),
            isConnected: true
        )
    }

    // MARK: - RPC Helper Methods

    @MainActor
    private func listJobsViaRPC(request: JobListRequest, cacheKey: String, shouldReplace: Bool) -> AnyPublisher<JobListResponse, DataServiceError> {
        // Time-based deduplication: if we fetched recently, return cached data
        if let lastFetch = lastJobsFetch[cacheKey],
           Date().timeIntervalSince(lastFetch) < 5.0 {
            if let cached: JobListResponse = cacheManager.get(key: cacheKey) {
                return Just(cached).setFailureType(to: DataServiceError.self).eraseToAnyPublisher()
            }
        }

        let token = UUID()
        return Future<JobListResponse, DataServiceError> { [weak self] promise in
            Task {
                await MainActor.run {
                    self?.currentListJobsRequestToken = token
                }

                do {
                    let activeSessionId = request.sessionId
                    let activeProjectDirectory = request.projectDirectory

                    if activeSessionId == nil && activeProjectDirectory == nil {
                        promise(.failure(.invalidState("sessionId or projectDirectory required")))
                        return
                    }

                    var jobsData: [String: Any]?

                    for try await response in CommandRouter.jobList(
                        projectDirectory: activeProjectDirectory,
                        sessionId: activeSessionId,
                        statusFilter: request.statusFilter?.map { $0.rawValue },
                        taskTypeFilter: request.taskTypeFilter?.joined(separator: ","),
                        page: request.page.map { Int($0) },
                        pageSize: request.pageSize.map { Int($0) },
                        filter: nil
                    ) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error: \(error.message)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any] {
                            jobsData = result
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = jobsData,
                          let jobs = data["jobs"] as? [[String: Any]] else {
                        promise(.failure(.invalidResponse("No jobs data received")))
                        return
                    }

                    let jsonData = try JSONSerialization.data(withJSONObject: jobs)
                    let decoder = JSONDecoder()
                    let backgroundJobs = try decoder.decode([BackgroundJob].self, from: jsonData)

                    let response = JobListResponse(
                        jobs: backgroundJobs,
                        totalCount: UInt32(data["totalCount"] as? Int ?? backgroundJobs.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? 50,
                        hasMore: data["hasMore"] as? Bool ?? false
                    )

                    if let self = self {
                        await MainActor.run {
                            if shouldReplace && token == self.currentListJobsRequestToken {
                                self.replaceJobsArray(with: response.jobs)
                                self.updateWorkflowCountsFromJobs(response.jobs)
                                self.hasLoadedOnce = true
                            }
                            self.cacheManager.set(response, forKey: cacheKey, ttl: 300)
                            self.lastJobsFetch[cacheKey] = Date()
                        }
                    }
                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .receive(on: DispatchQueue.main)
        .handleEvents(
            receiveOutput: { [weak self] _ in
                if let self = self, self.currentListJobsRequestToken == token {
                    self.isLoading = false
                }
            },
            receiveCompletion: { [weak self] completion in
                guard let self = self else { return }
                self.isLoading = false
                if case .failure(let error) = completion {
                    self.error = error
                    // Set hasLoadedOnce even on error to stop indefinite loading
                    if self.currentListJobsRequestToken == token {
                        self.hasLoadedOnce = true
                    }
                }
            }
        )
        .eraseToAnyPublisher()
    }

    @MainActor
    private func getJobDetailsViaRPC(request: JobDetailsRequest, cacheKey: String) -> AnyPublisher<JobDetailsResponse, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let rpcRequest = RpcRequest(
            method: "job.get",
            params: [
                "jobId": request.jobId
            ]
        )

        return Future<JobDetailsResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var jobDetailsData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error: \(error.message)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any] {
                            jobDetailsData = result
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = jobDetailsData,
                          let jobData = data["job"] as? [String: Any] else {
                        promise(.failure(.invalidResponse("No job details received")))
                        return
                    }

                    let jobJsonData = try JSONSerialization.data(withJSONObject: jobData)
                    let decoder = JSONDecoder()
                    // Backend uses camelCase serialization - use default keys
                    let job = try decoder.decode(BackgroundJob.self, from: jobJsonData)

                    var metrics: JobMetrics?
                    if let metricsData = data["metrics"] as? [String: Any] {
                        let metricsJsonData = try JSONSerialization.data(withJSONObject: metricsData)
                        let metricsDecoder = JSONDecoder()
                        // Backend uses camelCase serialization - use default keys
                        metrics = try? metricsDecoder.decode(JobMetrics.self, from: metricsJsonData)
                    }

                    let response = JobDetailsResponse(job: job, metrics: metrics)

                    self?.cacheManager.set(response, forKey: cacheKey, ttl: 600)
                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    @MainActor
    private func deleteJobViaRPC(jobId: String) -> AnyPublisher<Bool, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let rpcRequest = RpcRequest(
            method: "job.delete",
            params: [
                "jobId": jobId
            ]
        )

        return Future<Bool, DataServiceError> { [weak self] promise in
            Task {
                do {
                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("Failed to delete job: \(error.message)")))
                            return
                        }

                        // Remove from local state and rebuild index
                        await MainActor.run {
                            guard let self = self, let index = self.jobsIndex[jobId] else {
                                promise(.success(true))
                                return
                            }
                            self.mutateJobs {
                                self.jobs.remove(at: index)
                                self.jobsIndex.removeValue(forKey: jobId)
                                // Rebuild index after deletion
                                self.jobsIndex = Dictionary(uniqueKeysWithValues: self.jobs.enumerated().map { ($1.id, $0) })
                            }
                        }
                        promise(.success(true))
                        return
                    }
                } catch {
                    promise(.failure(.serverError("Failed to delete job: \(error.localizedDescription)")))
                }
            }
        }.eraseToAnyPublisher()
    }

    private func cancelJobViaRPC(request: JobCancellationRequest) -> AnyPublisher<JobCancellationResponse, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let rpcRequest = RpcRequest(
            method: "job.cancel",
            params: [
                "jobId": request.jobId,
                "reason": request.reason as Any
            ]
        )

        return Future<JobCancellationResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var cancelData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error: \(error.message)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any] {
                            cancelData = result
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = cancelData else {
                        promise(.failure(.invalidResponse("No cancellation response received")))
                        return
                    }

                    let response = JobCancellationResponse(
                        success: data["success"] as? Bool ?? false,
                        message: data["message"] as? String ?? "",
                        cancelledAt: data["cancelledAt"] as? Int64
                    )

                    // Invalidate cache
                    self?.cacheManager.invalidatePattern("jobs_")
                    self?.cacheManager.invalidatePattern("job_details_")

                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    private let workflowUmbrellaTypes: Set<String> = ["file_finder_workflow", "web_search_workflow"]
    private let fileFinderStepTypes: Set<String> = ["extended_path_finder", "file_relevance_assessment", "path_correction", "regex_file_filter"]

    private func isWorkflowUmbrella(_ job: BackgroundJob) -> Bool {
        workflowUmbrellaTypes.contains(job.taskType)
    }

    private func isFileFinderStep(_ job: BackgroundJob) -> Bool {
        fileFinderStepTypes.contains(job.taskType)
    }

    private func shouldIgnore(job: BackgroundJob) -> Bool {
        isFileFinderStep(job)
    }

    private func isWorkflowJob(_ job: BackgroundJob) -> Bool {
        isWorkflowUmbrella(job)
    }

    private func isActiveStatus(_ status: JobStatus) -> Bool {
        status.isActive
    }

    private func bumpWorkflowCount(sessionId: String, delta: Int) {
        let current = activeWorkflowJobsBySession[sessionId] ?? 0
        let next = max(0, current + delta)
        activeWorkflowJobsBySession[sessionId] = next
        if self.activeSessionId == sessionId {
            self.sessionActiveWorkflowJobs = next
        }
    }

    private func recomputeSessionWorkflowCount(for sessionId: String) {
        self.sessionActiveWorkflowJobs = activeWorkflowJobsBySession[sessionId] ?? 0
    }

    private func updateWorkflowCountsFromJobs(_ jobs: [BackgroundJob]) {
        var newCache: [String: BackgroundJob] = [:]
        var countsBySession: [String: Int] = [:]

        for job in jobs {
            if isWorkflowUmbrella(job) {
                newCache[job.id] = job
                if isActiveStatus(job.jobStatus) {
                    countsBySession[job.sessionId, default: 0] += 1
                }
            }
        }

        workflowJobsCache = newCache
        activeWorkflowJobsBySession = countsBySession

        if let activeSessionId = activeSessionId {
            sessionActiveWorkflowJobs = countsBySession[activeSessionId] ?? 0
        }
    }

    private func job(byId jobId: String) -> BackgroundJob? {
        guard let index = jobsIndex[jobId] else { return nil }
        return jobs[index]
    }

    private func insertOrReplace(job: BackgroundJob) {
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
        
        // Invalidate cache when jobs are modified via events to prevent stale data
        let cacheKeyPrefix = "dev_\(deviceKey)_jobs_"
        cacheManager.invalidatePattern(cacheKeyPrefix)
    }

    private func decodeJob(from dictionary: [String: Any]) -> BackgroundJob? {
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

    private func intValue(from value: Any?) -> Int? {
        switch value {
        case let number as NSNumber:
            return number.intValue
        case let string as String:
            return Int(string)
        default:
            return nil
        }
    }

    private func doubleValue(from value: Any?) -> Double? {
        switch value {
        case let number as NSNumber:
            return number.doubleValue
        case let string as String:
            return Double(string)
        default:
            return nil
        }
    }

    private func boolValue(from value: Any?) -> Bool? {
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

    private func hydrateJob(jobId: String, force: Bool, onReady: (() -> Void)?) {
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
                }
            )
            .store(in: &cancellables)
    }

    @discardableResult
    private func ensureJobPresent(jobId: String, onReady: (() -> Void)? = nil) -> Bool {
        if jobsIndex[jobId] != nil {
            return true
        }
        hydrateJob(jobId: jobId, force: false, onReady: onReady)
        return false
    }

    private func refreshJob(jobId: String, onReady: (() -> Void)? = nil) {
        hydrateJob(jobId: jobId, force: true, onReady: onReady)
    }

    @MainActor
    private func scheduleCoalescedListJobsForActiveSession() {
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

                let cacheKey = "dev_\(self.deviceKey)_jobs_\(request.cacheKey)"

                self.listJobsViaRPC(request: request, cacheKey: cacheKey, shouldReplace: false)
                    .sink(
                        receiveCompletion: { _ in },
                        receiveValue: { [weak self] response in
                            guard let self = self else { return }
                            self.mergeJobs(fetchedJobs: response.jobs)
                            self.updateWorkflowCountsFromJobs(self.jobs)
                        }
                    )
                    .store(in: &self.cancellables)

                self.lastCoalescedResyncAt = Date()
            }
        }

        coalescedResyncWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    // Centralized publisher for in-place mutations
    private func mutateJobs(_ block: () -> Void) {
        self.objectWillChange.send()
        block()
    }

    /// Atomically replace jobs array with minimal UI disruption
    private func replaceJobsArray(with newJobs: [BackgroundJob]) {
        mutateJobs {
            self.jobs = newJobs
            self.jobsIndex = Dictionary(uniqueKeysWithValues: newJobs.enumerated().map { ($1.id, $0) })
            self.lastAccumulatedLengths = Dictionary(uniqueKeysWithValues: newJobs.map { ($0.id, $0.response?.count ?? 0) })
        }
    }

    // Extract jobId from relay event for early guard
    private func extractJobId(from event: RelayEvent) -> String? {
        let payload = event.data.mapValues { $0.value }
        return payload["jobId"] as? String
            ?? payload["id"] as? String
            ?? (payload["job"] as? [String: Any])?["id"] as? String
    }

    private func updateWorkflowJobCounts(from event: RelayEvent) {
        let payload = event.data.mapValues { $0.value }

        switch event.eventType {
        case "job:created":
            if let jobData = payload["job"] as? [String: Any],
               let job = decodeJob(from: jobData) {
                if isWorkflowUmbrella(job) {
                    workflowJobsCache[job.id] = job
                    if isActiveStatus(job.jobStatus) {
                        bumpWorkflowCount(sessionId: job.sessionId, delta: +1)
                    }
                }
            }
        case "job:status-changed":
            let jobId = payload["jobId"] as? String ?? payload["id"] as? String
            guard let jobId = jobId else { return }

            guard let job = workflowJobsCache[jobId] else { return }

            if let statusString = payload["status"] as? String,
               let newStatus = JobStatus(rawValue: statusString) {
                let newActive = isActiveStatus(newStatus)
                let oldActive = isActiveStatus(job.jobStatus)
                if newActive != oldActive {
                    bumpWorkflowCount(sessionId: job.sessionId, delta: newActive ? +1 : -1)
                }
                var updatedJob = job
                updatedJob.status = statusString
                workflowJobsCache[jobId] = updatedJob
            }
        case "job:deleted":
            let jobId = payload["jobId"] as? String ?? payload["id"] as? String
            guard let jobId = jobId else { return }

            guard let job = workflowJobsCache[jobId] else { return }

            if isActiveStatus(job.jobStatus) {
                bumpWorkflowCount(sessionId: job.sessionId, delta: -1)
            }
            workflowJobsCache.removeValue(forKey: jobId)
        default:
            break
        }
    }

    @MainActor
    public func applyRelayEvent(_ event: RelayEvent) {
        guard event.eventType.hasPrefix("job:") else { return }

        // Update workflow job counters
        updateWorkflowJobCounts(from: event)

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
                
                // Invalidate cache when jobs are deleted via events
                let cacheKeyPrefix = "dev_\(deviceKey)_jobs_"
                cacheManager.invalidatePattern(cacheKeyPrefix)
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
                    }
                }
                jobs[index] = job
            }

            // Invalidate cache when jobs are modified via events
            if event.eventType == "job:finalized" || event.eventType == "job:status-changed" {
                let cacheKeyPrefix = "dev_\(deviceKey)_jobs_"
                cacheManager.invalidatePattern(cacheKeyPrefix)
            }

        case "job:response-appended":
            guard let jobId = jobId,
                  let chunk = payload["chunk"] as? String else { return }
            if ensureJobPresent(jobId: jobId, onReady: { [weak self] in
                self?.applyRelayEvent(event)
            }) == false {
                return
            }
            guard let index = jobsIndex[jobId] else { return }
            var job = jobs[index]
            guard shouldIgnore(job: job) == false else { return }

            let accumulatedLength = intValue(from: payload["accumulatedLength"]) ??
                intValue(from: payload["accumulated_length"])
            let currentResponse = job.response ?? ""
            let currentLength = currentResponse.count
            let expectedLength = lastAccumulatedLengths[jobId] ?? currentLength

            if let accLength = accumulatedLength {
                if accLength <= expectedLength {
                    return
                }
                if currentLength + chunk.count == accLength {
                    mutateJobs {
                        job.response = currentResponse + chunk
                        lastAccumulatedLengths[jobId] = accLength
                        job.updatedAt = intValue(from: payload["updatedAt"]).map(Int64.init) ?? job.updatedAt
                        jobs[index] = job
                    }
                } else {
                    refreshJob(jobId: jobId)
                }
            } else {
                mutateJobs {
                    job.response = currentResponse + chunk
                    let newLength = currentLength + chunk.count
                    lastAccumulatedLengths[jobId] = newLength
                    job.updatedAt = intValue(from: payload["updatedAt"]).map(Int64.init) ?? job.updatedAt
                    jobs[index] = job
                }
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

        default:
            break
        }
    }
}

// MARK: - Supporting Types

public struct JobListRequest: Codable {
    public let projectDirectory: String?
    public let sessionId: String?
    public let statusFilter: [JobStatus]?
    public let taskTypeFilter: [String]?
    public let dateFrom: Int64?
    public let dateTo: Int64?
    public let page: UInt32?
    public let pageSize: UInt32?
    public let sortBy: JobSortBy?
    public let sortOrder: SortOrder?

    public init(
        projectDirectory: String? = nil,
        sessionId: String? = nil,
        statusFilter: [JobStatus]? = nil,
        taskTypeFilter: [String]? = nil,
        dateFrom: Int64? = nil,
        dateTo: Int64? = nil,
        page: UInt32? = 0,
        pageSize: UInt32? = 50,
        sortBy: JobSortBy? = .createdAt,
        sortOrder: SortOrder? = .desc
    ) {
        self.projectDirectory = projectDirectory
        self.sessionId = sessionId
        self.statusFilter = statusFilter
        self.taskTypeFilter = taskTypeFilter
        self.dateFrom = dateFrom
        self.dateTo = dateTo
        self.page = page
        self.pageSize = pageSize
        self.sortBy = sortBy
        self.sortOrder = sortOrder
    }

    var cacheKey: String {
        let projectKey = projectDirectory ?? "nil"
        let sessionKey = sessionId ?? "nil"
        let statusKey = statusFilter?.map(\.rawValue).joined(separator: ",") ?? "nil"
        let typeKey = taskTypeFilter?.joined(separator: ",") ?? "nil"
        let pageKey = String(page ?? 0)
        let sizeKey = String(pageSize ?? 50)

        let components = [projectKey, sessionKey, statusKey, typeKey, pageKey, sizeKey]
        return components.joined(separator: "_")
    }
}

public struct JobListResponse: Codable {
    public let jobs: [BackgroundJob]
    public let totalCount: UInt32
    public let page: UInt32
    public let pageSize: UInt32
    public let hasMore: Bool
}

public struct JobDetailsRequest: Codable {
    public let jobId: String
    public let includeFullContent: Bool?

    public init(jobId: String, includeFullContent: Bool? = true) {
        self.jobId = jobId
        self.includeFullContent = includeFullContent
    }
}

public struct JobDetailsResponse: Codable {
    public let job: BackgroundJob
    public let metrics: JobMetrics?
}

public struct JobMetrics: Codable {
    public let tokenUsage: TokenUsage
    public let costBreakdown: CostBreakdown
    public let performanceMetrics: PerformanceMetrics
}

public struct TokenUsage: Codable {
    public let totalTokensSent: Int32
    public let totalTokensReceived: Int32
    public let cacheReadTokens: Int64
    public let cacheWriteTokens: Int64
    public let effectiveTokens: Int32
}

public struct CostBreakdown: Codable {
    public let inputCost: Double
    public let outputCost: Double
    public let cacheCost: Double
    public let totalCost: Double
    public let currency: String
}

public struct PerformanceMetrics: Codable {
    public let totalDurationMs: Int64
    public let preparationTimeMs: Int64?
    public let processingTimeMs: Int64?
    public let tokensPerSecond: Double?
}

public struct JobCancellationRequest: Codable {
    public let jobId: String
    public let reason: String?

    public init(jobId: String, reason: String? = nil) {
        self.jobId = jobId
        self.reason = reason
    }
}

public struct JobCancellationResponse: Codable {
    public let success: Bool
    public let message: String
    public let cancelledAt: Int64?
}

public struct JobProgressUpdate: Codable {
    public let jobId: String
    public let status: JobStatus
    public let progressPercentage: Float?
    public let currentStep: String?
    public let estimatedCompletionTime: Int64?
    public let metrics: JobMetrics?
    public let timestamp: Int64
}

public enum JobSortBy: String, Codable, CaseIterable {
    case createdAt
    case updatedAt
    case status
    case taskType
    case duration
    case cost
}

public enum SortOrder: String, Codable, CaseIterable {
    case asc
    case desc
}

public struct JobSyncStatus {
    public let activeJobs: Int
    public let lastUpdate: Date
    public let isConnected: Bool
}

// MARK: - Extensions

extension JSONDecoder {
    static let apiDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        // Backend uses camelCase serialization - use default keys
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()
}
