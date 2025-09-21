import Foundation
import Combine

/// Service for accessing implementation plans data from desktop
@MainActor
public class PlansDataService: ObservableObject {

    // MARK: - Published Properties
    @Published public var plans: [PlanSummary] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?

    // MARK: - Private Properties
    private let desktopAPIClient: DesktopAPIClient
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(
        desktopAPIClient: DesktopAPIClient,
        apiClient: APIClientProtocol = APIClient.shared,
        cacheManager: CacheManager = CacheManager.shared
    ) {
        self.desktopAPIClient = desktopAPIClient
        self.apiClient = apiClient
        self.cacheManager = cacheManager
    }

    // MARK: - Public Methods

    /// List implementation plans with filtering and pagination
    public func listPlans(request: PlanListRequest) -> AnyPublisher<PlanListResponse, DataServiceError> {
        isLoading = true
        error = nil

        let cacheKey = "plans_\(request.cacheKey)"

        // Try cache first
        if let cached: PlanListResponse = cacheManager.get(key: cacheKey) {
            isLoading = false
            plans = cached.plans
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Try DesktopAPIClient first, fallback to RPC if unavailable
        if let _ = MultiConnectionManager.shared.activeDeviceId,
           let _ = MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId!) {
            return desktopAPIClient.invoke(
                command: "list_plans_api",
                payload: request
            )
            .map { [weak self] (response: PlanListResponse) in
                self?.plans = response.plans
                self?.cacheManager.set(response, forKey: cacheKey, ttl: 600) // 10 min cache
                return response
            }
            .handleEvents(
                receiveOutput: { [weak self] _ in self?.isLoading = false },
                receiveCompletion: { [weak self] completion in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = DataServiceError.networkError(error)
                    }
                }
            )
            .mapError { DataServiceError.networkError($0) }
            .eraseToAnyPublisher()
        } else {
            // Use RPC fallback
            return listPlansViaRPC(request: request, cacheKey: cacheKey)
        }
    }

    /// Get plan content with chunking support
    public func getPlanContent(request: PlanContentRequest) -> AnyPublisher<PlanContentResponse, DataServiceError> {
        let cacheKey = "plan_content_\(request.jobId)_\(request.chunkIndex ?? 0)"

        if let cached: PlanContentResponse = cacheManager.get(key: cacheKey) {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Try DesktopAPIClient first, fallback to RPC if unavailable
        if let _ = MultiConnectionManager.shared.activeDeviceId,
           let _ = MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId!) {
            return desktopAPIClient.invoke(
                command: "get_plan_content_api",
                payload: request
            )
            .map { [weak self] (response: PlanContentResponse) in
                self?.cacheManager.set(response, forKey: cacheKey, ttl: 1800) // 30 min cache
                return response
            }
            .mapError { DataServiceError.networkError($0) }
            .eraseToAnyPublisher()
        } else {
            // Use RPC fallback
            return getPlanContentViaRPC(request: request, cacheKey: cacheKey)
        }
    }

    /// Get all chunks of a plan
    public func getFullPlanContent(jobId: String) -> AnyPublisher<String, DataServiceError> {
        // First, get the first chunk to determine total chunks
        let firstRequest = PlanContentRequest(jobId: jobId, chunkSize: 50000, chunkIndex: 0)

        return getPlanContent(request: firstRequest)
            .flatMap { [weak self] firstResponse -> AnyPublisher<String, DataServiceError> in
                guard let self = self else {
                    return Fail(error: DataServiceError.invalidState("Service deallocated"))
                        .eraseToAnyPublisher()
                }

                if !firstResponse.isChunked {
                    // Single chunk, return content
                    return Just(firstResponse.content)
                        .setFailureType(to: DataServiceError.self)
                        .eraseToAnyPublisher()
                }

                guard let chunkInfo = firstResponse.chunkInfo else {
                    return Fail(error: DataServiceError.invalidResponse("Missing chunk info"))
                        .eraseToAnyPublisher()
                }

                // Multiple chunks, fetch all
                let chunkRequests = (1..<chunkInfo.totalChunks).map { chunkIndex in
                    PlanContentRequest(jobId: jobId, chunkSize: 50000, chunkIndex: chunkIndex)
                }

                let chunkPublishers: [AnyPublisher<String, DataServiceError>] = chunkRequests.map { (request: PlanContentRequest) in
                    self.getPlanContent(request: request)
                        .map { (response: PlanContentResponse) in response.content }
                        .eraseToAnyPublisher()
                }

                let allPublishers = [Just(firstResponse.content).setFailureType(to: DataServiceError.self).eraseToAnyPublisher()] + chunkPublishers
                return Publishers.MergeMany(allPublishers)
                    .collect()
                    .map { $0.joined() }
                    .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }

    /// Search implementation plans
    public func searchPlans(request: PlanSearchRequest) -> AnyPublisher<PlanSearchResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .searchPlans,
            method: .POST,
            body: request
        )
        .decode(type: PlanSearchResponse.self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get plan revision history
    public func getPlanRevision(request: PlanRevisionRequest) -> AnyPublisher<PlanRevisionResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .getPlanRevision,
            method: .POST,
            body: request
        )
        .decode(type: PlanRevisionResponse.self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Download plan as file
    public func downloadPlan(jobId: String, format: PlanExportFormat = .markdown) -> AnyPublisher<URL, DataServiceError> {
        return getFullPlanContent(jobId: jobId)
            .flatMap { content -> AnyPublisher<URL, DataServiceError> in
                return Future<URL, DataServiceError> { promise in
                    DispatchQueue.global(qos: .background).async {
                        do {
                            let fileName = "plan_\(jobId).\(format.fileExtension)"
                            let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                            let fileURL = documentsPath.appendingPathComponent(fileName)

                            try content.write(to: fileURL, atomically: true, encoding: .utf8)

                            DispatchQueue.main.async {
                                promise(.success(fileURL))
                            }
                        } catch {
                            DispatchQueue.main.async {
                                promise(.failure(.fileSystemError(error)))
                            }
                        }
                    }
                }
                .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }

    /// Share plan content
    public func sharePlan(jobId: String, format: PlanExportFormat = .markdown) -> AnyPublisher<ShareData, DataServiceError> {
        return getFullPlanContent(jobId: jobId)
            .map { content in
                ShareData(
                    content: content,
                    format: format,
                    fileName: "plan_\(jobId).\(format.fileExtension)"
                )
            }
            .eraseToAnyPublisher()
    }

    /// Get detailed plan information using RPC call for mobile remote access
    public func getPlanDetails(jobId: String) -> AnyPublisher<PlanDetails, DataServiceError> {
        // First try the regular API call for direct connections
        if let _ = MultiConnectionManager.shared.activeDeviceId,
           let _ = MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId!) {
            return getPlanDetailsViaAPI(jobId: jobId)
        }

        // Use RPC call via relay for remote connections
        return getPlanDetailsViaRPC(jobId: jobId)
    }

    private func getPlanDetailsViaAPI(jobId: String) -> AnyPublisher<PlanDetails, DataServiceError> {
        let request = PlanContentRequest(jobId: jobId, chunkSize: nil, chunkIndex: nil, includeDiff: true)

        return getPlanContent(request: request)
            .map { response in
                PlanDetails(
                    jobId: jobId,
                    title: response.metadata.title,
                    content: response.content,
                    filePath: response.metadata.filePath,
                    createdAt: Date(timeIntervalSince1970: TimeInterval(response.metadata.createdAt)),
                    updatedAt: response.metadata.updatedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) },
                    sizeBytes: response.metadata.sizeBytes,
                    wordCount: response.metadata.wordCount,
                    lineCount: response.metadata.lineCount,
                    estimatedReadTimeMinutes: response.metadata.estimatedReadTimeMinutes,
                    isChunked: response.isChunked,
                    chunkInfo: response.chunkInfo
                )
            }
            .eraseToAnyPublisher()
    }

    private func getPlanDetailsViaRPC(jobId: String) -> AnyPublisher<PlanDetails, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let request = RpcRequest(
            method: "actions.readImplementationPlan",
            params: [
                "jobId": AnyCodable(jobId),
                "includeMetadata": AnyCodable(true)
            ]
        )

        return Future<PlanDetails, DataServiceError> { promise in
            Task {
                do {
                    var planData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error \(error.code): \(error.message)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any] {
                            planData = result
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = planData else {
                        promise(.failure(.invalidResponse("No plan data received")))
                        return
                    }

                    let planDetails = try self.parsePlanDetailsFromRPC(data: data, jobId: jobId)
                    promise(.success(planDetails))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    private func listPlansViaRPC(request: PlanListRequest, cacheKey: String) -> AnyPublisher<PlanListResponse, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let rpcRequest = RpcRequest(
            method: "job.list",
            params: [
                "projectDirectory": AnyCodable(request.projectDirectory),
                "filter": AnyCodable("implementation_plan")
            ]
        )

        return Future<PlanListResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var jobsData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error: \(error)")))
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

                    let plans = jobs.compactMap { jobData -> PlanSummary? in
                        guard let jobId = jobData["id"] as? String,
                              let status = jobData["status"] as? String,
                              let sessionId = jobData["session_id"] as? String,
                              let createdAt = jobData["created_at"] as? Int64 else {
                            return nil
                        }

                        return PlanSummary(
                            id: jobId,
                            jobId: jobId,
                            title: jobData["title"] as? String,
                            filePath: jobData["file_path"] as? String,
                            createdAt: createdAt,
                            updatedAt: jobData["updated_at"] as? Int64,
                            sizeBytes: jobData["size_bytes"] as? UInt,
                            status: status,
                            sessionId: sessionId,
                            executionStatus: nil
                        )
                    }

                    let response = PlanListResponse(
                        plans: plans,
                        totalCount: UInt32(plans.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? 20,
                        hasMore: false
                    )

                    self?.plans = response.plans
                    self?.cacheManager.set(response, forKey: cacheKey, ttl: 600)
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

    private func getPlanContentViaRPC(request: PlanContentRequest, cacheKey: String) -> AnyPublisher<PlanContentResponse, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let rpcRequest = RpcRequest(
            method: "actions.readImplementationPlan",
            params: [
                "jobId": AnyCodable(request.jobId),
                "includeMetadata": AnyCodable(true)
            ]
        )

        return Future<PlanContentResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var planData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            promise(.failure(.serverError("RPC Error: \(error)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any] {
                            planData = result
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = planData,
                          let planContent = data["plan"] as? [String: Any],
                          let content = planContent["content"] as? String else {
                        promise(.failure(.invalidResponse("No plan content received")))
                        return
                    }

                    let metadata = planContent["metadata"] as? [String: Any] ?? [:]
                    let planMetadata = PlanMetadata(
                        title: metadata["title"] as? String,
                        filePath: metadata["filePath"] as? String,
                        createdAt: metadata["createdAt"] as? Int64 ?? 0,
                        updatedAt: metadata["updatedAt"] as? Int64,
                        sizeBytes: metadata["sizeBytes"] as? UInt ?? UInt(content.utf8.count),
                        wordCount: metadata["wordCount"] as? UInt,
                        lineCount: metadata["lineCount"] as? UInt,
                        estimatedReadTimeMinutes: metadata["estimatedReadTimeMinutes"] as? UInt32,
                        complexityScore: metadata["complexityScore"] as? Float
                    )

                    let response = PlanContentResponse(
                        jobId: request.jobId,
                        content: content,
                        isChunked: false,
                        chunkInfo: nil,
                        metadata: planMetadata,
                        diffInfo: nil
                    )

                    self?.cacheManager.set(response, forKey: cacheKey, ttl: 1800)
                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .eraseToAnyPublisher()
    }

    private func parsePlanDetailsFromRPC(data: [String: Any], jobId: String) throws -> PlanDetails {
        guard let content = data["content"] as? String else {
            throw DataServiceError.invalidResponse("Missing plan content")
        }

        let metadata = data["metadata"] as? [String: Any] ?? [:]

        let createdAt = (metadata["createdAt"] as? Double).map { Date(timeIntervalSince1970: $0) } ?? Date()
        let updatedAt = (metadata["updatedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }

        return PlanDetails(
            jobId: jobId,
            title: metadata["title"] as? String,
            content: content,
            filePath: metadata["filePath"] as? String,
            createdAt: createdAt,
            updatedAt: updatedAt,
            sizeBytes: metadata["sizeBytes"] as? UInt ?? UInt(content.utf8.count),
            wordCount: metadata["wordCount"] as? UInt,
            lineCount: metadata["lineCount"] as? UInt,
            estimatedReadTimeMinutes: metadata["estimatedReadTimeMinutes"] as? UInt32,
            isChunked: data["isChunked"] as? Bool ?? false,
            chunkInfo: nil // Would need to parse chunk info if present
        )
    }

    // MARK: - Cache Management

    public func invalidateCache() {
        cacheManager.invalidatePattern("plans_")
        cacheManager.invalidatePattern("plan_content_")
    }

    public func preloadPlans(for projectDirectory: String) {
        let request = PlanListRequest(
            projectDirectory: projectDirectory,
            page: 0,
            pageSize: 20,
            includeMetadataOnly: true
        )

        listPlans(request: request)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
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

public struct PlanListRequest: Codable {
    public let projectDirectory: String?
    public let dateFrom: Int64?
    public let dateTo: Int64?
    public let page: UInt32?
    public let pageSize: UInt32?
    public let sortBy: PlanSortBy?
    public let sortOrder: SortOrder?
    public let includeMetadataOnly: Bool?

    public init(
        projectDirectory: String? = nil,
        dateFrom: Int64? = nil,
        dateTo: Int64? = nil,
        page: UInt32? = 0,
        pageSize: UInt32? = 20,
        sortBy: PlanSortBy? = .createdAt,
        sortOrder: SortOrder? = .desc,
        includeMetadataOnly: Bool? = true
    ) {
        self.projectDirectory = projectDirectory
        self.dateFrom = dateFrom
        self.dateTo = dateTo
        self.page = page
        self.pageSize = pageSize
        self.sortBy = sortBy
        self.sortOrder = sortOrder
        self.includeMetadataOnly = includeMetadataOnly
    }

    var cacheKey: String {
        let components = [
            projectDirectory ?? "nil",
            String(page ?? 0),
            String(pageSize ?? 20),
            sortBy?.rawValue ?? "createdAt"
        ]
        return components.joined(separator: "_")
    }
}

public struct PlanListResponse: Codable {
    public let plans: [PlanSummary]
    public let totalCount: UInt32
    public let page: UInt32
    public let pageSize: UInt32
    public let hasMore: Bool
}

public struct PlanSummary: Codable, Identifiable {
    public let id: String
    public let jobId: String
    public let title: String?
    public let filePath: String?
    public let createdAt: Int64
    public let updatedAt: Int64?
    public let sizeBytes: UInt?
    public let status: String
    public let sessionId: String
    public let executionStatus: PlanExecutionStatus?

    public var size: String {
        guard let bytes = sizeBytes else { return "Unknown" }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    public var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(createdAt))
        return DateFormatter.medium.string(from: date)
    }
}

public struct PlanContentRequest: Codable {
    public let jobId: String
    public let chunkSize: UInt?
    public let chunkIndex: UInt?
    public let includeDiff: Bool?

    public init(
        jobId: String,
        chunkSize: UInt? = 50000,
        chunkIndex: UInt? = 0,
        includeDiff: Bool? = false
    ) {
        self.jobId = jobId
        self.chunkSize = chunkSize
        self.chunkIndex = chunkIndex
        self.includeDiff = includeDiff
    }
}

public struct PlanContentResponse: Codable {
    public let jobId: String
    public let content: String
    public let isChunked: Bool
    public let chunkInfo: ChunkInfo?
    public let metadata: PlanMetadata
    public let diffInfo: DiffInfo?
}

public struct ChunkInfo: Codable {
    public let chunkIndex: UInt
    public let totalChunks: UInt
    public let chunkSize: UInt
    public let totalSize: UInt
    public let hasMore: Bool
}

public struct PlanMetadata: Codable {
    public let title: String?
    public let filePath: String?
    public let createdAt: Int64
    public let updatedAt: Int64?
    public let sizeBytes: UInt
    public let wordCount: UInt?
    public let lineCount: UInt?
    public let estimatedReadTimeMinutes: UInt32?
    public let complexityScore: Float?

    public var formattedReadTime: String {
        guard let minutes = estimatedReadTimeMinutes else { return "Unknown" }
        if minutes < 60 {
            return "\(minutes) min"
        } else {
            let hours = minutes / 60
            let remainingMinutes = minutes % 60
            return "\(hours)h \(remainingMinutes)m"
        }
    }
}

public struct DiffInfo: Codable {
    public let hasRevisions: Bool
    public let revisionCount: UInt
    public let latestRevisionAt: Int64?
    public let diffSummary: DiffSummary?
}

public struct DiffSummary: Codable {
    public let linesAdded: UInt
    public let linesRemoved: UInt
    public let linesModified: UInt
    public let sectionsChanged: [String]
}

public struct PlanExecutionStatus: Codable {
    public let isExecuting: Bool
    public let progressPercentage: Float?
    public let currentStep: String?
    public let stepsCompleted: UInt
    public let totalSteps: UInt
    public let startedAt: Int64?
    public let estimatedCompletion: Int64?
}

public struct PlanSearchRequest: Codable {
    public let projectDirectory: String?
    public let query: String
    public let searchContent: Bool?
    public let searchTitles: Bool?
    public let page: UInt32?
    public let pageSize: UInt32?

    public init(
        projectDirectory: String? = nil,
        query: String,
        searchContent: Bool? = true,
        searchTitles: Bool? = true,
        page: UInt32? = 0,
        pageSize: UInt32? = 20
    ) {
        self.projectDirectory = projectDirectory
        self.query = query
        self.searchContent = searchContent
        self.searchTitles = searchTitles
        self.page = page
        self.pageSize = pageSize
    }
}

public struct PlanSearchResponse: Codable {
    public let results: [PlanSearchResult]
    public let totalCount: UInt32
    public let page: UInt32
    public let pageSize: UInt32
    public let query: String
}

public struct PlanSearchResult: Codable, Identifiable {
    public let id: String
    public let jobId: String
    public let title: String?
    public let snippet: String
    public let relevanceScore: Float
    public let matchLocations: [MatchLocation]
    public let createdAt: Int64
}

public struct MatchLocation: Codable {
    public let lineNumber: UInt
    public let startChar: UInt
    public let endChar: UInt
    public let context: String
}

public struct PlanRevisionRequest: Codable {
    public let jobId: String
    public let revisionIndex: UInt?
    public let compareWith: UInt?

    public init(jobId: String, revisionIndex: UInt? = nil, compareWith: UInt? = nil) {
        self.jobId = jobId
        self.revisionIndex = revisionIndex
        self.compareWith = compareWith
    }
}

public struct PlanRevisionResponse: Codable {
    public let jobId: String
    public let revisionIndex: UInt
    public let content: String
    public let createdAt: Int64
    public let diff: String?
    public let changeSummary: String?
}

public enum PlanSortBy: String, Codable, CaseIterable {
    case createdAt
    case updatedAt
    case size
    case title
}

public enum PlanExportFormat: String, CaseIterable {
    case markdown = "md"
    case text = "txt"
    case html = "html"

    public var fileExtension: String {
        return rawValue
    }

    public var mimeType: String {
        switch self {
        case .markdown:
            return "text/markdown"
        case .text:
            return "text/plain"
        case .html:
            return "text/html"
        }
    }
}

public struct ShareData {
    public let content: String
    public let format: PlanExportFormat
    public let fileName: String
}

public struct PlanDetails {
    public let jobId: String
    public let title: String?
    public let content: String
    public let filePath: String?
    public let createdAt: Date
    public let updatedAt: Date?
    public let sizeBytes: UInt
    public let wordCount: UInt?
    public let lineCount: UInt?
    public let estimatedReadTimeMinutes: UInt32?
    public let isChunked: Bool
    public let chunkInfo: ChunkInfo?

    public init(
        jobId: String,
        title: String?,
        content: String,
        filePath: String?,
        createdAt: Date,
        updatedAt: Date?,
        sizeBytes: UInt,
        wordCount: UInt?,
        lineCount: UInt?,
        estimatedReadTimeMinutes: UInt32?,
        isChunked: Bool,
        chunkInfo: ChunkInfo?
    ) {
        self.jobId = jobId
        self.title = title
        self.content = content
        self.filePath = filePath
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.sizeBytes = sizeBytes
        self.wordCount = wordCount
        self.lineCount = lineCount
        self.estimatedReadTimeMinutes = estimatedReadTimeMinutes
        self.isChunked = isChunked
        self.chunkInfo = chunkInfo
    }
}

// MARK: - Extensions
// DateFormatter.medium is defined in SharedTypes.swift
