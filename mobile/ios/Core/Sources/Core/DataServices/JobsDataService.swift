import Foundation
import Combine
import OSLog

/// Service for accessing background jobs data from desktop
@MainActor
public class JobsDataService: ObservableObject {
    private let logger = Logger(subsystem: "VibeManager", category: "JobsDataService")

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

    // MARK: - Initialization
    public init(
        apiClient: APIClientProtocol = APIClient.shared,
        cacheManager: CacheManager = CacheManager.shared
    ) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        setupProgressTracking()
    }

    public convenience init() {
        self.init(
            apiClient: APIClient.shared,
            cacheManager: CacheManager.shared
        )
    }

    // MARK: - Public Methods

    /// List jobs with filtering and pagination
    public func listJobs(request: JobListRequest) -> AnyPublisher<JobListResponse, DataServiceError> {
        isLoading = true
        error = nil

        let cacheKey = "jobs_\(request.cacheKey)"

        // Try cache first if enabled
        if let cached: JobListResponse = cacheManager.get(key: cacheKey) {
            isLoading = false
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Relay-first: directly use RPC-via-relay
        logger.debug("Jobs RPC path selected")
        return listJobsViaRPC(request: request, cacheKey: cacheKey)
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
            params: ["jobId": AnyCodable(jobId)]
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
                            jobData = result
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
        let cacheKey = "job_details_\(request.jobId)"

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

    // MARK: - Private Methods

    private func setupProgressTracking() {
        // Auto-refresh active jobs every 30 seconds
        Timer.publish(every: 30, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.refreshActiveJobs()
            }
            .store(in: &cancellables)
    }

    private func refreshActiveJobs() {
        let activeStatuses: [JobStatus] = [.created, .queued, .acknowledgedByWorker, .preparing, .preparingInput, .generatingStream, .processingStream, .running]

        let request = JobListRequest(
            statusFilter: activeStatuses,
            pageSize: 50,
            includeContent: false
        )

        listJobs(request: request)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] response in
                    self?.syncStatus = JobSyncStatus(
                        activeJobs: response.jobs.count,
                        lastUpdate: Date(),
                        isConnected: true
                    )
                }
            )
            .store(in: &cancellables)
    }

    private func handleJobProgressUpdate(_ update: JobProgressUpdate) {
        // Update local job if it exists
        if let index = jobs.firstIndex(where: { $0.id == update.jobId }) {
            jobs[index].status = update.status.rawValue
            jobs[index].updatedAt = update.timestamp

            // Invalidate relevant cache entries
            cacheManager.invalidatePattern("jobs_")
            cacheManager.invalidatePattern("job_details_\(update.jobId)")
        }

        // Update sync status
        syncStatus = JobSyncStatus(
            activeJobs: jobs.filter { JobStatus(rawValue: $0.status)?.isActive == true }.count,
            lastUpdate: Date(),
            isConnected: true
        )
    }

    // MARK: - RPC Helper Methods

    @MainActor
    private func listJobsViaRPC(request: JobListRequest, cacheKey: String) -> AnyPublisher<JobListResponse, DataServiceError> {
        return Future<JobListResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var jobsData: [String: Any]?

                    for try await response in CommandRouter.jobList(
                        projectDirectory: request.projectDirectory,
                        sessionId: request.sessionId,
                        statusFilter: request.statusFilter?.map { $0.rawValue },
                        taskTypeFilter: request.taskTypeFilter?.joined(separator: ","),
                        page: request.page.map { Int($0) },
                        pageSize: request.pageSize.map { Int($0) }
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
                    decoder.keyDecodingStrategy = .convertFromSnakeCase
                    let backgroundJobs = try decoder.decode([BackgroundJob].self, from: jsonData)

                    let response = JobListResponse(
                        jobs: backgroundJobs,
                        totalCount: UInt32(data["totalCount"] as? Int ?? backgroundJobs.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? 50,
                        hasMore: data["hasMore"] as? Bool ?? false
                    )

                    self?.jobs = response.jobs
                    self?.cacheManager.set(response, forKey: cacheKey, ttl: 300)
                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .handleEvents(
            receiveOutput: { [weak self] _ in self?.isLoading = false },
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    self?.error = error
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
            method: "job.get_details",
            params: [
                "jobId": AnyCodable(request.jobId),
                "includeFullContent": AnyCodable(request.includeFullContent)
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
                    decoder.keyDecodingStrategy = .convertFromSnakeCase
                    let job = try decoder.decode(BackgroundJob.self, from: jobJsonData)

                    var metrics: JobMetrics?
                    if let metricsData = data["metrics"] as? [String: Any] {
                        let metricsJsonData = try JSONSerialization.data(withJSONObject: metricsData)
                        let metricsDecoder = JSONDecoder()
                        metricsDecoder.keyDecodingStrategy = .convertFromSnakeCase
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
                "jobId": AnyCodable(jobId)
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

                        // Remove from cache and local state
                        self?.jobs.removeAll { $0.id == jobId }
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
                "jobId": AnyCodable(request.jobId),
                "reason": AnyCodable(request.reason)
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
        let dict = event.data.mapValues { $0.value }
        let jobId = dict["jobId"] as? String ?? dict["id"] as? String

        switch event.eventType {
        case "job:created":
            if let jobData = dict["job"] as? [String: Any],
               let id = jobData["id"] as? String,
               jobsIndex[id] == nil {
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: jobData)
                    let decoder = JSONDecoder()
                    decoder.keyDecodingStrategy = .convertFromSnakeCase
                    if let job = try? decoder.decode(BackgroundJob.self, from: jsonData) {
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

        case "job:status-changed", "job:tokens-updated", "job:cost-updated", "job:metadata-updated", "job:finalized":
            if let id = jobId, let idx = jobsIndex[id] {
                var job = self.jobs[idx]
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
    public let includeContent: Bool?

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
        sortOrder: SortOrder? = .desc,
        includeContent: Bool? = false
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
        self.includeContent = includeContent
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
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()
}
