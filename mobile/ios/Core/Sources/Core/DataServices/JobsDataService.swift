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

    // MARK: - Private Properties
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private var cancellables = Set<AnyCancellable>()
    private var progressSubscription: AnyCancellable?
    private var jobsIndex: [String: Int] = [:]
    private var activeSessionId: String?
    private var activeProjectDirectory: String?
    private var currentListJobsRequestToken: UUID?
    @Published public private(set) var hasLoadedOnce = false

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
            self.jobs = cached.jobs
            self.jobsIndex = Dictionary(uniqueKeysWithValues: cached.jobs.enumerated().map { ($1.id, $0) })
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

        // No polling; rely on relay events while connected and reconnection snapshot orchestrated by DataServicesManager.

        // Immediate fetch on enter to get the most recent jobs
        self.refreshActiveJobs()
    }

    /// Stop session-scoped sync timer (but keep processing events)
    public func stopSessionScopedSync() {
        // Keep activeSessionId and activeProjectDirectory so events continue processing in background
    }

    /// Clear jobs from memory
    public func clearJobs() {
        self.jobs.removeAll()
        self.jobsIndex.removeAll()
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
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] response in
                    guard let self = self else { return }

                    // Merge fetched active jobs with existing jobs
                    self.mergeJobs(fetchedJobs: response.jobs)

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

    private func handleJobProgressUpdate(_ update: JobProgressUpdate) {
        // Update local job if it exists - use index for O(1) lookup
        guard let index = jobsIndex[update.jobId] else { return }

        var job = jobs[index]
        job.status = update.status.rawValue
        job.updatedAt = update.timestamp
        jobs[index] = job

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

                    if let strongSelf = self {
                        if shouldReplace && token == strongSelf.currentListJobsRequestToken {
                            strongSelf.jobs = response.jobs
                            strongSelf.jobsIndex = Dictionary(uniqueKeysWithValues: response.jobs.enumerated().map { ($1.id, $0) })
                            // REMOVED: prefetchTopJobsInternal() - this was causing 8+ second delays
                            // Job details are fetched on-demand when user taps a job
                            strongSelf.hasLoadedOnce = true
                        }
                    }
                    self?.cacheManager.set(response, forKey: cacheKey, ttl: 300)
                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
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
                            self.jobs.remove(at: index)
                            self.jobsIndex.removeValue(forKey: jobId)
                            // Rebuild index after deletion
                            self.jobsIndex = Dictionary(uniqueKeysWithValues: self.jobs.enumerated().map { ($1.id, $0) })
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

    @MainActor
    public func applyRelayEvent(_ event: RelayEvent) {
        guard event.eventType.hasPrefix("job:") else { return }

        // Process events continuously (like desktop) - only gate by session ID
        guard let currentSessionId = activeSessionId else {
            return
        }

        let dict = event.data.mapValues { $0.value }
        let jobId = dict["jobId"] as? String ?? dict["id"] as? String

        // Check session ID in event data
        if let eventSessionId = dict["sessionId"] as? String {
            guard eventSessionId == currentSessionId else { return }
        } else if let jobData = dict["job"] as? [String: Any],
                  let eventSessionId = jobData["sessionId"] as? String {
            guard eventSessionId == currentSessionId else { return }
        } else if let jobId = jobId {
            // Only allow if job already in our index
            guard jobsIndex[jobId] != nil else { return }
        }

        switch event.eventType {
        case "job:created":
            if let jobData = dict["job"] as? [String: Any],
               let id = jobData["id"] as? String,
               jobsIndex[id] == nil {
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: jobData)
                    let decoder = JSONDecoder()
                    // Backend uses camelCase serialization - use default keys
                    if let job = try? decoder.decode(BackgroundJob.self, from: jsonData) {
                        // Filter out workflow orchestrator jobs from real-time events
                        guard job.taskType != "file_finder_workflow" && job.taskType != "web_search_workflow" else {
                            return
                        }
                        self.jobs.append(job)
                        self.jobsIndex[job.id] = self.jobs.count - 1
                    }
                } catch {
                    logger.error("Failed to decode job:created: \(error)")
                }
            }

        case "job:deleted":
            if let id = jobId, let idx = jobsIndex[id] {
                self.jobs.remove(at: idx)
                self.jobsIndex.removeValue(forKey: id)
                self.jobsIndex = Dictionary(uniqueKeysWithValues: self.jobs.enumerated().map { ($1.id, $0) })
            }

        case "job:metadata-updated":
            if let id = jobId, let idx = jobsIndex[id] {
                var job = self.jobs[idx]
                guard job.taskType != "file_finder_workflow" && job.taskType != "web_search_workflow" else {
                    return
                }

                if let metadataPatch = dict["metadataPatch"] as? [String: Any] {
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
                            self.jobs[idx] = job
                        }
                    } else {
                        if let patchData = try? JSONSerialization.data(withJSONObject: metadataPatch),
                           let patchString = String(data: patchData, encoding: .utf8) {
                            job.metadata = patchString
                            job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                            self.jobs[idx] = job
                        }
                    }
                }
            }

        case "job:status-changed", "job:tokens-updated", "job:cost-updated", "job:finalized":
            if let id = jobId, let idx = jobsIndex[id] {
                var job = self.jobs[idx]
                guard job.taskType != "file_finder_workflow" && job.taskType != "web_search_workflow" else {
                    return
                }
                if let status = dict["status"] as? String {
                    job.status = status
                }
                if let updatedAt = dict["updatedAt"] as? Int64 {
                    job.updatedAt = updatedAt
                }
                if let actualCost = dict["actualCost"] as? Double {
                    job.actualCost = actualCost
                }
                self.jobs[idx] = job
            }

        case "job:response-appended":
            if let id = jobId, let idx = jobsIndex[id], let chunk = dict["chunk"] as? String {
                var job = self.jobs[idx]
                let currentResponse = job.response ?? ""
                job.response = currentResponse + chunk
                self.jobs[idx] = job
            }

        case "job:stream-progress":
            if let id = jobId, let idx = jobsIndex[id] {
                var job = self.jobs[idx]
                guard job.taskType != "file_finder_workflow" && job.taskType != "web_search_workflow" else {
                    return
                }

                if let existingMetadata = job.metadata,
                   let metadataData = existingMetadata.data(using: .utf8),
                   var metadataDict = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {

                    var taskData = metadataDict["taskData"] as? [String: Any] ?? [:]

                    if let progress = dict["progress"] as? Double {
                        taskData["streamProgress"] = progress
                    }
                    if let responseLength = dict["responseLength"] as? Int {
                        taskData["responseLength"] = responseLength
                    }
                    if let lastStreamUpdateTime = dict["lastStreamUpdateTime"] as? Int64 {
                        taskData["lastStreamUpdateTime"] = lastStreamUpdateTime
                    }

                    metadataDict["taskData"] = taskData

                    if let updatedData = try? JSONSerialization.data(withJSONObject: metadataDict),
                       let updatedString = String(data: updatedData, encoding: .utf8) {
                        job.metadata = updatedString
                        job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                        self.jobs[idx] = job
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
