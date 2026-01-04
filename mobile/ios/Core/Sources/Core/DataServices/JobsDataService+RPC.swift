import Foundation
import Combine

// MARK: - RPC Methods

extension JobsDataService {

    @MainActor
    func listJobsViaRPC(request: JobListRequest, shouldReplace: Bool) -> AnyPublisher<JobListResponse, DataServiceError> {
        let token = UUID()
        let cacheKey = makeJobListDedupKey(for: request)

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
                    // Return cached response
                    let response = JobListResponse(
                        jobs: self.jobs,
                        totalCount: UInt32(self.jobs.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? UInt32(self.jobs.count),
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

                    for try await response in CommandRouter.jobList(
                        projectDirectory: activeProjectDirectory,
                        sessionId: activeSessionId,
                        statusFilter: request.statusFilter?.map { $0.rawValue },
                        taskTypeFilter: request.taskTypeFilter?.joined(separator: ","),
                        page: request.page.map { Int($0) },
                        pageSize: request.pageSize.map { Int($0) },
                        filter: nil,
                        bypassCache: shouldReplace
                    ) {
                        if let error = response.error {
                            throw DataServiceError.serverError("RPC Error: \(error.message)")
                        }

                        if let result = response.result?.value as? [String: Any] {
                            jobsData = result
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    // Tolerant response parsing - handle missing/partial data gracefully
                    guard let data = jobsData as? [String: Any] else {
                        // No valid data dictionary - return empty response
                        return JobListResponse(
                            jobs: [],
                            totalCount: 0,
                            page: request.page ?? 0,
                            pageSize: request.pageSize ?? 50,
                            hasMore: false
                        )
                    }

                    // Safely extract jobs array, defaulting to empty if missing or wrong type
                    let jobsArray = data["jobs"] as? [[String: Any]] ?? []

                    // Decode jobs array (even if empty)
                    let jsonData = try JSONSerialization.data(withJSONObject: jobsArray)
                    let decoder = JSONDecoder()
                    let backgroundJobs = try decoder.decode([BackgroundJob].self, from: jsonData)

                    // Extract pagination fields with sensible defaults
                    let response = JobListResponse(
                        jobs: backgroundJobs,
                        totalCount: UInt32(data["totalCount"] as? Int ?? backgroundJobs.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? (backgroundJobs.isEmpty ? 50 : UInt32(backgroundJobs.count)),
                        hasMore: data["hasMore"] as? Bool ?? false
                    )

                    await MainActor.run {
                        if shouldReplace && token == self.currentListJobsRequestToken {
                            self.replaceJobsArray(with: response.jobs)
                            self.updateWorkflowCountsFromJobs(response.jobs)
                            self.updateImplementationPlanCountsFromJobs(response.jobs)
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
                    // - The jobs array is empty (no existing data to fall back on)
                    // This prevents background refreshes from nuking the UI with error banners
                    if shouldReplace || self.jobs.isEmpty {
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

    func cancelJobViaRPC(request: JobCancellationRequest) -> AnyPublisher<JobCancellationResponse, DataServiceError> {
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
