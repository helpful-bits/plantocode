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

    /// Fetches a snapshot of visible full jobs filtered by scope and reason (includes content)
    /// - Parameters:
    ///   - reason: The reason for the fetch, affects cache bypass behavior
    /// - Returns: Array of visible full jobs with content (internal workflow steps filtered out)
    @MainActor
    public func fetchVisibleJobsSnapshot(reason: JobsReconcileReason) async throws -> [BackgroundJob] {
        let scope = determineJobScope()

        // Return empty list for invalid scope (during bootstrap when scope is not yet available)
        guard scope.isValid else {
            return []
        }

        let bypassCache: Bool
        switch reason {
        case .foregroundResume, .connectivityReconnected, .pushHint, .userRefresh, .listInvalidated, .relayRegistered, .initialLoad, .sessionChanged:
            bypassCache = true
        case .periodicSync:
            bypassCache = false
        }

        let maxAttempts = 3
        let backoffDelays: [UInt64] = [500_000_000, 1_000_000_000]
        var lastError: Error?
        var jobsData: [String: Any]?

        for attempt in 0..<maxAttempts {
            do {
                jobsData = try await invokeJobList(
                    scope: scope,
                    statusFilter: nil,
                    taskTypeFilter: nil,
                    page: 0,
                    pageSize: 50,
                    bypassCache: bypassCache,
                    includeContent: true
                )
                break
            } catch let error as ServerRelayError {
                if case .timeout = error {
                    lastError = error
                    if attempt < maxAttempts - 1 {
                        try await Task.sleep(nanoseconds: backoffDelays[attempt])
                        continue
                    }
                } else {
                    throw error
                }
            } catch let error as DataServiceError {
                if case .connectionError = error {
                    lastError = error
                    if attempt < maxAttempts - 1 {
                        try await Task.sleep(nanoseconds: backoffDelays[attempt])
                        continue
                    }
                } else {
                    throw error
                }
            } catch {
                throw error
            }
        }

        if jobsData == nil, let error = lastError {
            throw error
        }

        guard let data = jobsData else {
            throw DataServiceError.invalidResponse("No job list data received")
        }

        // Use flexible decoder for full BackgroundJob objects (with content)
        // Note: Filtering for list visibility is done at the view layer, not here,
        // so that ImplementationPlansView can access implementation_plan jobs
        let jobs = try JobsDecoding.decodeJobListFlexible(from: data)

        return jobs
    }

    /// Fetches a snapshot of visible job summaries filtered by scope and reason (lightweight, no content)
    /// - Parameters:
    ///   - reason: The reason for the fetch, affects cache bypass behavior
    /// - Returns: Array of visible job summaries without content (internal workflow steps filtered out)
    @MainActor
    public func fetchVisibleJobSummariesSnapshot(reason: JobsReconcileReason) async throws -> [BackgroundJobListItem] {
        let scope = determineJobScope()

        // Return empty list for invalid scope (during bootstrap when scope is not yet available)
        guard scope.isValid else {
            return []
        }

        let bypassCache: Bool
        switch reason {
        case .foregroundResume, .connectivityReconnected, .pushHint, .userRefresh, .listInvalidated, .relayRegistered, .initialLoad, .sessionChanged:
            bypassCache = true
        case .periodicSync:
            bypassCache = false
        }

        let maxAttempts = 3
        let backoffDelays: [UInt64] = [500_000_000, 1_000_000_000]
        var lastError: Error?
        var jobsData: [String: Any]?

        for attempt in 0..<maxAttempts {
            do {
                jobsData = try await invokeJobList(
                    scope: scope,
                    statusFilter: nil,
                    taskTypeFilter: nil,
                    page: 0,
                    pageSize: 50,
                    bypassCache: bypassCache,
                    includeContent: false
                )
                break
            } catch let error as ServerRelayError {
                if case .timeout = error {
                    lastError = error
                    if attempt < maxAttempts - 1 {
                        try await Task.sleep(nanoseconds: backoffDelays[attempt])
                        continue
                    }
                } else {
                    throw error
                }
            } catch let error as DataServiceError {
                if case .connectionError = error {
                    lastError = error
                    if attempt < maxAttempts - 1 {
                        try await Task.sleep(nanoseconds: backoffDelays[attempt])
                        continue
                    }
                } else {
                    throw error
                }
            } catch {
                throw error
            }
        }

        if jobsData == nil, let error = lastError {
            throw error
        }

        guard let data = jobsData else {
            throw DataServiceError.invalidResponse("No job list data received")
        }

        let response = try JobsDecoding.decodeJobSummaryList(dict: data)

        // Note: Filtering for list visibility is done at the view layer, not here,
        // so that ImplementationPlansView can access implementation_plan jobs
        return response.jobs
    }

    /// Determines the current job scope based on active session and project.
    /// Returns an invalid scope (isValid == false) when BOTH sessionId AND projectDirectory are missing/empty.
    /// This allows callers to gracefully handle bootstrap scenarios by returning empty results.
    ///
    /// Priority order for effectiveSessionId:
    /// 1. activeSessionId if non-empty AND NOT prefixed with "mobile-session-"
    /// 2. sessionService.currentSession?.id if non-empty AND NOT prefixed with "mobile-session-"
    /// 3. nil
    ///
    /// Only use projectDirectory-only scoping when effectiveSessionId == nil AND activeProjectDirectory is non-empty,
    /// or when the only available id is a "mobile-session-*" id.
    @MainActor
    func determineJobScope() -> JobScope {
        // Compute effectiveSessionId in priority order, filtering out mobile-session- prefixes
        var effectiveSessionId: String? = nil

        // First: try activeSessionId if non-empty and not a mobile session
        if let sid = activeSessionId, !sid.isEmpty, !sid.hasPrefix("mobile-session-") {
            effectiveSessionId = sid
        }
        // Second: try sessionService.currentSession?.id if non-empty and not a mobile session
        else if let currentSession = PlanToCodeCore.shared.dataServices?.sessionService.currentSession,
                !currentSession.id.isEmpty,
                !currentSession.id.hasPrefix("mobile-session-") {
            effectiveSessionId = currentSession.id
        }
        // Third: effectiveSessionId remains nil

        var effectiveProjectDirectory: String? = nil
        if let pd = activeProjectDirectory, !pd.isEmpty {
            effectiveProjectDirectory = pd
        } else if let sessionPd = PlanToCodeCore.shared.dataServices?.sessionService.currentSession?.projectDirectory,
                  !sessionPd.isEmpty {
            effectiveProjectDirectory = sessionPd
        }

        let normalizedSessionId: String? = (effectiveSessionId?.isEmpty == false) ? effectiveSessionId : nil
        let normalizedProjectDirectory: String? = (effectiveProjectDirectory?.isEmpty == false) ? effectiveProjectDirectory : nil

        return JobScope(sessionId: normalizedSessionId, projectDirectory: normalizedProjectDirectory)
    }

    /// Fetches visible jobs and updates the service state via canonical reducer
    /// - Parameter reason: The reason for the reconciliation
    @MainActor
    public func reconcileVisibleJobs(reason: JobsReconcileReason) async {
        do {
            let fetchedSummaries = try await fetchVisibleJobSummariesSnapshot(reason: reason)

            // Use .snapshot source since we're fetching the complete visible jobs list
            // This allows the reducer to prune jobs that no longer exist on the server
            reduceJobSummaries(fetchedSummaries, source: .snapshot)

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
        let shouldBypassCache = shouldReplace

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
                    // Return current state from canonical store (summaries)
                    let currentSummaries = Array(self.jobSummariesById.values)
                    let response = JobListResponse(
                        jobs: currentSummaries,
                        totalCount: UInt32(currentSummaries.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? UInt32(currentSummaries.count),
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

                    let normalizedSessionId: String? = {
                        guard let sid = request.sessionId, !sid.isEmpty else { return nil }
                        if sid.hasPrefix("mobile-session-") { return nil }
                        return sid
                    }()
                    let normalizedProjectDirectory: String? = {
                        guard let pd = request.projectDirectory, !pd.isEmpty else { return nil }
                        return pd
                    }()

                    if normalizedSessionId == nil && normalizedProjectDirectory == nil {
                        throw DataServiceError.invalidState("sessionId or projectDirectory required")
                    }

                    var jobsData: [String: Any]?

                    for try await rpcResponse in CommandRouter.jobList(
                        sessionId: normalizedSessionId,
                        projectDirectory: normalizedProjectDirectory,
                        statusFilter: request.statusFilter?.map { $0.rawValue },
                        taskTypeFilter: request.taskTypeFilter?.map { $0 },
                        page: request.page.map { Int($0) } ?? 0,
                        pageSize: request.pageSize.map { Int($0) } ?? 50,
                        bypassCache: shouldBypassCache,
                        includeContent: false
                    ) {
                        if let error = rpcResponse.error {
                            throw DataServiceError.serverError(error.message)
                        }

                        if let result = RpcResultExtractor.jobListEnvelopeDict(from: rpcResponse.result?.value) {
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
                            // Route through canonical reducer with merge-only semantics
                            // Paginated responses must NOT prune jobs not in the current page
                            self.reduceJobSummaries(response.jobs, source: .event)
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

                    for try await rpcResponse in relayClient.invoke(request: rpcRequest) {
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

                    for try await response in relayClient.invoke(request: rpcRequest) {
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
                        self.jobsById.removeValue(forKey: jobId)
                        self.jobSummariesById.removeValue(forKey: jobId)
                        self.lastAccumulatedLengths.removeValue(forKey: jobId)
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

                    for try await rpcResponse in relayClient.invoke(request: rpcRequest) {
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

    // MARK: - Centralized Job List Invocation

    /// Centralized helper for invoking CommandRouter.jobList with normalized parameters.
    /// - Parameters:
    ///   - scope: The job scope containing sessionId and projectDirectory
    ///   - statusFilter: Optional status filter array
    ///   - taskTypeFilter: Optional task type filter array
    ///   - page: Page number (0-indexed)
    ///   - pageSize: Number of items per page
    ///   - bypassCache: Whether to bypass cache
    ///   - includeContent: Whether to include full job content
    /// - Returns: The job list envelope dictionary
    private func invokeJobList(
        scope: JobScope,
        statusFilter: [String]?,
        taskTypeFilter: [String]?,
        page: Int,
        pageSize: Int,
        bypassCache: Bool,
        includeContent: Bool
    ) async throws -> [String: Any] {
        let normalizedSessionId: String? = {
            guard let sid = scope.sessionId, !sid.isEmpty else { return nil }
            if sid.hasPrefix("mobile-session-") { return nil }
            return sid
        }()
        let normalizedProjectDirectory: String? = {
            guard let pd = scope.projectDirectory, !pd.isEmpty else { return nil }
            return pd
        }()

        var jobsData: [String: Any]?

        for try await rpcResponse in CommandRouter.jobList(
            sessionId: normalizedSessionId,
            projectDirectory: normalizedProjectDirectory,
            statusFilter: statusFilter,
            taskTypeFilter: taskTypeFilter,
            page: page,
            pageSize: pageSize,
            bypassCache: bypassCache,
            includeContent: includeContent
        ) {
            if let error = rpcResponse.error {
                throw DataServiceError.serverError(error.message)
            }

            if let result = RpcResultExtractor.jobListEnvelopeDict(from: rpcResponse.result?.value) {
                jobsData = result
                if rpcResponse.isFinal {
                    break
                }
            }
        }

        guard let data = jobsData else {
            throw DataServiceError.invalidResponse("No job list data received")
        }

        return data
    }
}
