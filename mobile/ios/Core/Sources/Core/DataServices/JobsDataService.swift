import Foundation
import Combine

/// Service for accessing background jobs data from desktop
public class JobsDataService: ObservableObject {

    // MARK: - Published Properties
    @Published public var jobs: [BackgroundJob] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    @Published public var syncStatus: JobSyncStatus?

    // MARK: - Private Properties
    private let desktopAPIClient: DesktopAPIClient
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private var cancellables = Set<AnyCancellable>()
    private var progressSubscription: AnyCancellable?

    // MARK: - Initialization
    public init(
        desktopAPIClient: DesktopAPIClient,
        apiClient: APIClientProtocol = APIClient.shared,
        cacheManager: CacheManager = CacheManager.shared
    ) {
        self.desktopAPIClient = desktopAPIClient
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        setupProgressTracking()
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

        let jobListPublisher: AnyPublisher<JobListResponse, DesktopAPIError> = desktopAPIClient.invoke(
            command: "list_jobs_api",
            payload: request
        )

        return jobListPublisher
        .map { [weak self] (response: JobListResponse) in
            self?.jobs = response.jobs
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 300) // 5 min cache
            return response
        }
        .handleEvents(
            receiveOutput: { [weak self] response in self?.isLoading = false },
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    self?.error = self?.mapDesktopAPIError(error)
                }
            }
        )
        .mapError { [weak self] error in self?.mapDesktopAPIError(error) ?? DataServiceError.networkError(error) }
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

        let jobDetailsPublisher: AnyPublisher<JobDetailsResponse, DesktopAPIError> = desktopAPIClient.invoke(
            command: "get_job_details_api",
            payload: request
        )

        return jobDetailsPublisher
        .map { [weak self] (response: JobDetailsResponse) in
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 600) // 10 min cache
            return response
        }
        .mapError { [weak self] error in self?.mapDesktopAPIError(error) ?? DataServiceError.networkError(error) }
        .eraseToAnyPublisher()
    }

    /// Cancel a background job
    public func cancelJob(request: JobCancellationRequest) -> AnyPublisher<JobCancellationResponse, DataServiceError> {
        let cancellationPublisher: AnyPublisher<JobCancellationResponse, DesktopAPIError> = desktopAPIClient.invoke(
            command: "cancel_job_api",
            payload: request
        )

        return cancellationPublisher
        .handleEvents(receiveOutput: { [weak self] (_: JobCancellationResponse) in
            // Invalidate cache
            self?.cacheManager.invalidatePattern("jobs_")
            self?.cacheManager.invalidatePattern("job_details_")
        })
        .mapError { [weak self] error in self?.mapDesktopAPIError(error) ?? DataServiceError.networkError(error) }
        .eraseToAnyPublisher()
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

    /// Map DesktopAPIError to DataServiceError
    private func mapDesktopAPIError(_ error: DesktopAPIError) -> DataServiceError {
        switch error {
        case .notConnected:
            return DataServiceError.connectionError("Not connected to desktop")
        case .networkError(let networkError):
            return DataServiceError.networkError(networkError)
        case .timeout:
            return DataServiceError.timeout
        case .serverError(let code, let message):
            return DataServiceError.serverError("\(code): \(message)")
        case .encodingError(let encodingError):
            return DataServiceError.networkError(encodingError)
        case .decodingError(let decodingError):
            return DataServiceError.networkError(decodingError)
        case .invalidResponse:
            return DataServiceError.invalidResponse("Invalid server response")
        case .disconnected:
            return DataServiceError.connectionError("Disconnected from desktop")
        case .invalidURL, .invalidState:
            return DataServiceError.invalidResponse(error.localizedDescription)
        }
    }
}

// MARK: - Supporting Types

public struct JobListRequest: Codable {
    public let projectDirectory: String?
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
        let statusKey = statusFilter?.map(\.rawValue).joined(separator: ",") ?? "nil"
        let typeKey = taskTypeFilter?.joined(separator: ",") ?? "nil"
        let pageKey = String(page ?? 0)
        let sizeKey = String(pageSize ?? 50)

        let components = [projectKey, statusKey, typeKey, pageKey, sizeKey]
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
