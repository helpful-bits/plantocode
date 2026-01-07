import Foundation
import Combine

// MARK: - RPC Methods

extension JobsDataService {

    // MARK: - Job Scope

    /// Represents the scope for job queries
    public struct JobScope {
        public let sessionId: String?
        public let projectDirectory: String?

        public init(sessionId: String? = nil, projectDirectory: String? = nil) {
            self.sessionId = sessionId
            self.projectDirectory = projectDirectory
        }

        /// Whether this scope has valid query parameters
        public var isValid: Bool {
            (sessionId != nil && !sessionId!.isEmpty) || (projectDirectory != nil && !projectDirectory!.isEmpty)
        }
    }

    // MARK: - Visible Jobs Snapshot

    /// Fetches a snapshot of visible jobs filtered by scope and reason
    /// - Parameters:
    ///   - reason: The reason for the fetch, affects cache bypass behavior
    /// - Returns: Array of visible jobs (internal workflow steps filtered out)
    @MainActor
    public func fetchVisibleJobsSnapshot(reason: JobsReconcileReason) async throws -> [BackgroundJob] {
        let scope = await determineJobScope()

        guard scope.isValid else {
            throw DataServiceError.invalidState("No valid session or project directory for job scope")
        }

        // Determine if we should bypass cache based on reconcile reason
        let bypassCache: Bool
        switch reason {
        case .foregroundResume, .connectivityReconnected, .pushHint, .userRefresh, .listInvalidated, .relayRegistered:
            bypassCache = true
        case .initialLoad, .periodicSync, .sessionChanged:
            bypassCache = false
        }

        var params: [String: Any] = [:]
        if let sessionId = scope.sessionId {
            params["sessionId"] = sessionId
        }
        if let projectDirectory = scope.projectDirectory {
            params["projectDirectory"] = projectDirectory
        }
        params["bypassCache"] = bypassCache

        // Perform RPC call
        var jobsData: [String: Any]?

        for try await rpcResponse in CommandRouter.jobList(
            sessionId: scope.sessionId,
            projectDirectory: scope.projectDirectory,
            statusFilter: nil,
            taskTypeFilter: nil,
            page: nil,
            pageSize: 100,
            bypassCache: bypassCache
        ) {
            if let error = rpcResponse.error {
                throw DataServiceError.serverError(error.message)
            }

            if let result = rpcResponse.result?.value as? [String: Any] {
                jobsData = result
                if rpcResponse.isFinal {
                    break
                }
            }
        }

        guard let data = jobsData else {
            throw DataServiceError.invalidResponse("No job list data received")
        }

        let response = try JobsDecoding.decodeJobList(dict: data)

        // Filter out internal workflow jobs that shouldn't be visible
        return response.jobs.filter { JobTypeFilters.isVisibleInJobsList($0) }
    }

    /// Determines the current job scope based on active session and project
    @MainActor
    private func determineJobScope() async -> JobScope {
        // For mobile sessions (prefixed with "mobile-session-"), use nil sessionId
        // to fetch ALL jobs for the project, not filtered by the mobile session
        let effectiveSessionId: String?
        if let sessionId = activeSessionId, !sessionId.hasPrefix("mobile-session-") {
            effectiveSessionId = sessionId
        } else {
            effectiveSessionId = nil
        }

        return JobScope(
            sessionId: effectiveSessionId,
            projectDirectory: activeProjectDirectory
        )
    }

    /// Fetches visible jobs and updates the service state via canonical reducer
    /// - Parameter reason: The reason for the reconciliation
    @MainActor
    public func reconcileVisibleJobs(reason: JobsReconcileReason) async {
        do {
            let fetchedJobs = try await fetchVisibleJobsSnapshot(reason: reason)

            // Determine merge source based on reason
            // Foreground resume and reconnect use snapshot (authoritative replace)
            // Other reasons use event (incremental merge)
            let source: MergeSource
            switch reason {
            case .foregroundResume, .connectivityReconnected:
                source = .snapshot
            case .initialLoad, .sessionChanged, .userRefresh, .listInvalidated, .relayRegistered, .pushHint, .periodicSync:
                source = .snapshot
            }

            // Route through canonical reducer
            reduceJobs(fetchedJobs, source: source)

            hasLoadedOnce = true
            error = nil

        } catch let err as DataServiceError {
            logger.error("Failed to reconcile jobs (\(String(describing: reason))): \(err.localizedDescription)")
            error = err
            hasLoadedOnce = true
        } catch {
            logger.error("Failed to reconcile jobs (\(String(describing: reason))): \(error.localizedDescription)")
            self.error = .networkError(error)
            hasLoadedOnce = true
        }
    }

    // MARK: - List Jobs via RPC (Combine)

    @MainActor
    func listJobsViaRPC(request: JobListRequest, shouldReplace: Bool) -> AnyPublisher<JobListResponse, DataServiceError> {
        let token = UUID()
        let cacheKey = makeJobListDedupKey(for: request)

        // Only set isLoading = true on initial load (when jobsById is empty)
        // This prevents loading spinners during background refreshes
        if jobsById.isEmpty {
            isLoading = true
        }

        return Future<JobListResponse, DataServiceError> { [weak self] promise in
            Task { @MainActor in
                guard let self = self else {
                    promise(.failure(.invalidState("JobsDataService deallocated")))
                    return
                }

                // ATOMIC check-and-store: Check for in-flight request and coalesce
                // IMPORTANT: Don't set token until AFTER these checks - coalesced requests
                // should NOT invalidate the original request's token
                if let existingTask = self.jobsFetchInFlight[cacheKey] {
                    // Coalesce with existing request - do NOT set token
                    Task {
                        do {
                            let result = try await existingTask.value
                            promise(.success(result))
                        } catch let error as DataServiceError {
                            promise(.failure(error))
                        } catch {
                            promise(.failure(.networkError(error)))
                        }
                    }
                    return
                }

                // Short-window dedup (1 second) - do NOT set token
                let now = Date()
                if let lastAt = self.lastJobsFetchAt[cacheKey],
                   now.timeIntervalSince(lastAt) < 1.0 {
                    // Return current state from canonical store
                    let currentJobs = Array(self.jobsById.values)
                    let response = JobListResponse(
                        jobs: currentJobs,
                        totalCount: UInt32(currentJobs.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? UInt32(currentJobs.count),
                        hasMore: false
                    )
                    promise(.success(response))
                    return
                }

                // Connection check - do NOT set token on early return
                if let activeId = MultiConnectionManager.shared.activeDeviceId {
                    if !(MultiConnectionManager.shared.connectionStates[activeId]?.isConnected ?? false) {
                        if shouldReplace {
                            promise(.failure(DataServiceError.connectionError("No active device connection")))
                        } else {
                            let emptyResponse = JobListResponse(jobs: [], totalCount: 0, page: 0, pageSize: 50, hasMore: false)
                            promise(.success(emptyResponse))
                        }
                        return
                    }
                } else {
                    if shouldReplace {
                        promise(.failure(DataServiceError.connectionError("No active device connection")))
                    } else {
                        let emptyResponse = JobListResponse(jobs: [], totalCount: 0, page: 0, pageSize: 50, hasMore: false)
                        promise(.success(emptyResponse))
                    }
                    return
                }

                // NOW set the token - only for requests that will actually execute
                self.currentListJobsRequestToken = token

                // Mark fetch timestamp BEFORE creating task to prevent duplicates
                self.lastJobsFetchAt[cacheKey] = Date()

                // Create new task for this fetch and store it IMMEDIATELY (atomic with check above)
                let fetchTask = Task<JobListResponse, Error> { [weak self] in
                    guard let self = self else {
                        throw DataServiceError.invalidState("JobsDataService deallocated")
                    }

                    defer {
                        Task { @MainActor in
                            self.jobsFetchInFlight.removeValue(forKey: cacheKey)
                        }
                    }

                    let activeSessionId = request.sessionId
                    let activeProjectDirectory = request.projectDirectory

                    if activeSessionId == nil && activeProjectDirectory == nil {
                        throw DataServiceError.invalidState("sessionId or projectDirectory required")
                    }

                    var jobsData: [String: Any]?

                    for try await rpcResponse in CommandRouter.jobList(
                        sessionId: activeSessionId,
                        projectDirectory: activeProjectDirectory,
                        statusFilter: request.statusFilter?.map { $0.rawValue },
                        taskTypeFilter: request.taskTypeFilter?.map { $0 },
                        page: request.page.map { Int($0) },
                        pageSize: request.pageSize.map { Int($0) },
                        bypassCache: shouldReplace
                    ) {
                        if let error = rpcResponse.error {
                            throw DataServiceError.serverError(error.message)
                        }

                        if let result = rpcResponse.result?.value as? [String: Any] {
                            jobsData = result
                            if rpcResponse.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = jobsData else {
                        throw DataServiceError.invalidResponse("No job list data received")
                    }

                    let response = try JobsDecoding.decodeJobList(dict: data)

                    await MainActor.run {
                        if token == self.currentListJobsRequestToken {
                            // Route through canonical reducer
                            // shouldReplace == true -> snapshot (prune to exact set)
                            // shouldReplace == false -> event (merge/upsert only)
                            let source: MergeSource = shouldReplace ? .snapshot : .event
                            self.reduceJobs(response.jobs, source: source)
                            self.hasLoadedOnce = true
                        }
                    }

                    return response
                }

                // Store the task IMMEDIATELY after creation (still on MainActor, atomic with check above)
                self.jobsFetchInFlight[cacheKey] = fetchTask

                // Execute the task and handle result
                Task {
                    do {
                        let response = try await fetchTask.value
                        promise(.success(response))
                    } catch {
                        let dataServiceError = error as? DataServiceError ?? .networkError(error)
                        promise(.failure(dataServiceError))
                    }
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
                    // Only set error state if:
                    // - This is a replacing fetch (shouldReplace == true), OR
                    // - The jobsById is empty (no existing data to fall back on)
                    // This prevents background refreshes from nuking the UI with error banners
                    if shouldReplace || self.jobsById.isEmpty {
                        self.error = error
                    } else {
                        // Log but don't show error to user when background refresh fails
                        self.logger.warning("Background jobs refresh failed (not shown to user): \(error.localizedDescription)")
                    }
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
    func getJobDetailsViaRPC(request: JobDetailsRequest) -> AnyPublisher<JobDetailsResponse, DataServiceError> {
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

        return Future<JobDetailsResponse, DataServiceError> { promise in
            Task {
                do {
                    var jobDetailsData: [String: Any]?

                    for try await rpcResponse in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = rpcResponse.error {
                            promise(.failure(.serverError(error.message)))
                            return
                        }

                        if let result = rpcResponse.result?.value as? [String: Any] {
                            jobDetailsData = result
                            if rpcResponse.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = jobDetailsData else {
                        promise(.failure(.invalidResponse("No job details received")))
                        return
                    }

                    let job = try JobsDecoding.decodeJobEnvelope(dict: data)

                    var metrics: JobMetrics?
                    if let metricsData = data["metrics"] as? [String: Any] {
                        let metricsJsonData = try JSONSerialization.data(withJSONObject: metricsData)
                        let metricsDecoder = JSONDecoder()
                        // Backend uses camelCase serialization - use default keys
                        metrics = try? metricsDecoder.decode(JobMetrics.self, from: metricsJsonData)
                    }

                    let response = JobDetailsResponse(job: job, metrics: metrics)

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
    func deleteJobViaRPC(jobId: String) -> AnyPublisher<Bool, DataServiceError> {
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
                    var deleteSucceeded = false

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("Failed to delete job: \(error.message)")))
                            return
                        }

                        if response.isFinal {
                            deleteSucceeded = true
                            break
                        }
                    }

                    guard deleteSucceeded else {
                        promise(.failure(.invalidResponse("No deletion response received")))
                        return
                    }

                    await MainActor.run {
                        guard let self = self else {
                            promise(.success(true))
                            return
                        }
                        // Remove from canonical store
                        self.jobsById.removeValue(forKey: jobId)
                        self.lastAccumulatedLengths.removeValue(forKey: jobId)
                        // Recompute derived state
                        self.recomputeDerivedState()
                        self.scheduleCoalescedListJobsForActiveSession()
                        promise(.success(true))
                    }
                } catch {
                    promise(.failure(.serverError("Failed to delete job: \(error.localizedDescription)")))
                }
            }
        }.eraseToAnyPublisher()
    }

    func cancelJobViaRPC(request: JobCancellationRequest) -> AnyPublisher<JobCancellationResponse, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        var params: [String: Any] = ["jobId": request.jobId]
        if let reason = request.reason, !reason.isEmpty {
            params["reason"] = reason
        }

        let rpcRequest = RpcRequest(
            method: "job.cancel",
            params: params
        )

        return Future<JobCancellationResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var cancelData: [String: Any]?

                    for try await rpcResponse in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = rpcResponse.error {
                            promise(.failure(.serverError(error.message)))
                            return
                        }

                        if let result = rpcResponse.result?.value as? [String: Any] {
                            cancelData = result
                            if rpcResponse.isFinal {
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

                    if response.success {
                        await MainActor.run {
                            guard let self = self, var job = self.jobsById[request.jobId] else { return }
                            job.status = "canceled"
                            job.updatedAt = Int64(Date().timeIntervalSince1970 * 1000)
                            // Route through reducer for consistent state
                            self.reduceJobs([job], source: .event)
                            self.scheduleCoalescedListJobsForActiveSession()
                        }
                    }

                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .eraseToAnyPublisher()
    }
}
