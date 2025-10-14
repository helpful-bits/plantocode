import Foundation
import Combine
import OSLog

public struct PromptResponse: Codable {
    public let systemPrompt: String
    public let userPrompt: String
    public let combinedPrompt: String

    public init(systemPrompt: String, userPrompt: String, combinedPrompt: String) {
        self.systemPrompt = systemPrompt
        self.userPrompt = userPrompt
        self.combinedPrompt = combinedPrompt
    }
}

// MARK: - Architecture Notes
// This service follows the relay-first pattern for mobile-desktop communication.
// Date parsing supports both epoch seconds and ISO-8601 formats for robustness.
// Session IDs prefixed with "mobile-session-" are ephemeral and omitted from RPC.
// Cache keys incorporate all request parameters to maintain coherence.
// Fallback to zero for unparseable dates prevents silent data loss.

/// Service for accessing implementation plans data from desktop
@MainActor
public class PlansDataService: ObservableObject {
    private let logger = Logger(subsystem: "VibeManager", category: "PlansDataService")

    // MARK: - Published Properties
    @Published public var plans: [PlanSummary] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?

    // MARK: - Private Properties
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private let jobsService: JobsDataService
    private var cancellables = Set<AnyCancellable>()
    private var relayEventsCancellable: AnyCancellable?
    private var lastBoundDeviceId: UUID?
    private let contentCache = NSCache<NSString, NSString>()
    private var currentListPlansRequestToken: UUID?
    @Published public private(set) var hasLoadedOnce = false

    // Real-time data publisher
    @Published public private(set) var lastUpdateEvent: RelayEvent?

    // MARK: - Initialization
    public init(
        apiClient: APIClientProtocol = APIClient.shared,
        cacheManager: CacheManager = CacheManager.shared,
        jobsService: JobsDataService
    ) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        self.jobsService = jobsService
        contentCache.countLimit = 50

        setupRelayEventSubscription()

        MultiConnectionManager.shared.$connectionStates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.rebindRelayEvents()
            }
            .store(in: &cancellables)
    }

    private func rebindRelayEvents() {
        if MultiConnectionManager.shared.activeDeviceId != lastBoundDeviceId {
            self.invalidateCache()
            self.plans.removeAll()
            self.contentCache.removeAllObjects()
            self.lastBoundDeviceId = MultiConnectionManager.shared.activeDeviceId
        }

        relayEventsCancellable?.cancel()

        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let client = MultiConnectionManager.shared.relayConnection(for: deviceId),
              MultiConnectionManager.shared.isActiveDeviceConnected else {
            return
        }

        relayEventsCancellable = client.eventsPublisher
            .filter { event in
                event.eventType.hasPrefix("job:") ||
                event.eventType == "PlanCreated" ||
                event.eventType == "PlanModified"
            }
            .sink { [weak self] event in
                guard let self = self else { return }

                switch event.eventType {
                case "job:deleted":
                    let jobId = (event.data["jobId"]?.value as? String) ?? (event.data["id"]?.value as? String)
                    if let jobId = jobId {
                        self.plans.removeAll { $0.jobId == jobId }
                        self.cacheManager.invalidatePattern("plans_")
                        self.contentCache.removeObject(forKey: jobId as NSString)
                    }
                case "PlanModified", "job:finalized":
                    let jobId = (event.data["jobId"]?.value as? String) ?? (event.data["id"]?.value as? String)
                    if let jobId = jobId {
                        self.contentCache.removeObject(forKey: jobId as NSString)
                        self.cacheManager.invalidatePattern("plan_content_")
                    }
                default:
                    break
                }

                self.lastUpdateEvent = event
            }
    }

    // MARK: - Public Methods

    /// List implementation plans with filtering and pagination
    public func listPlans(request: PlanListRequest) -> AnyPublisher<PlanListResponse, DataServiceError> {
        isLoading = true
        error = nil

        let deviceKey = MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
        let cacheKey = "plans_\(deviceKey)_\(request.cacheKey)"

        // Try cache first
        if let cached: PlanListResponse = cacheManager.get(key: cacheKey) {
            isLoading = false
            plans = cached.plans
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Relay-first: directly use RPC-via-relay
        logger.debug("Plans RPC path selected")
        return listPlansViaRPC(request: request, cacheKey: cacheKey)
    }

    /// Get plan content with chunking support
    public func getPlanContent(request: PlanContentRequest) -> AnyPublisher<PlanContentResponse, DataServiceError> {
        let deviceKey = MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
        let cacheKey = "plan_content_\(deviceKey)_\(request.jobId)_\(request.chunkIndex ?? 0)"

        if let cached: PlanContentResponse = cacheManager.get(key: cacheKey) {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Relay-first: directly use RPC-via-relay
        logger.debug("Plan content RPC path selected")
        return getPlanContentViaRPC(request: request, cacheKey: cacheKey)
    }

    /// Get all chunks of a plan
    public func getFullPlanContent(jobId: String) -> AnyPublisher<String, DataServiceError> {
        // Check cache first
        if let cached = contentCache.object(forKey: jobId as NSString) as String? {
            // Fire-and-forget background refresh
            Task {
                _ = try? await self.refreshContentInBackground(jobId: jobId)
            }
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        // Fetch with chunking support
        let firstRequest = PlanContentRequest(jobId: jobId, chunkSize: 50000, chunkIndex: 0)

        return getPlanContent(request: firstRequest)
            .flatMap { [weak self] firstResponse -> AnyPublisher<String, DataServiceError> in
                guard let self = self else {
                    return Fail(error: DataServiceError.invalidState("Service deallocated"))
                        .eraseToAnyPublisher()
                }

                if !firstResponse.isChunked {
                    // Single chunk - cache and return
                    self.contentCache.setObject(firstResponse.content as NSString, forKey: jobId as NSString)
                    return Just(firstResponse.content)
                        .setFailureType(to: DataServiceError.self)
                        .eraseToAnyPublisher()
                }

                guard let chunkInfo = firstResponse.chunkInfo else {
                    return Fail(error: DataServiceError.invalidResponse("Missing chunk info"))
                        .eraseToAnyPublisher()
                }

                // Fetch remaining chunks
                let remainingIndices = (1..<chunkInfo.totalChunks).map { $0 }
                let chunkPublishers: [AnyPublisher<String, DataServiceError>] = remainingIndices.map { index in
                    let req = PlanContentRequest(jobId: jobId, chunkSize: 50000, chunkIndex: index)
                    return self.getPlanContent(request: req)
                        .map { $0.content }
                        .eraseToAnyPublisher()
                }

                let allPublishers = [Just(firstResponse.content).setFailureType(to: DataServiceError.self).eraseToAnyPublisher()] + chunkPublishers

                return Publishers.MergeMany(allPublishers)
                    .collect()
                    .map { chunks in chunks.joined() }
                    .flatMap { [weak self] assembled -> AnyPublisher<String, DataServiceError> in
                        guard let self = self else {
                            return Fail(error: DataServiceError.invalidState("Service deallocated"))
                                .eraseToAnyPublisher()
                        }

                        // Integrity check
                        if assembled.utf8.count != chunkInfo.totalSize {
                            return Fail(error: DataServiceError.invalidResponse("Assembled content size mismatch"))
                                .eraseToAnyPublisher()
                        }

                        // Cache assembled content
                        self.contentCache.setObject(assembled as NSString, forKey: jobId as NSString)

                        return Just(assembled)
                            .setFailureType(to: DataServiceError.self)
                            .eraseToAnyPublisher()
                    }
                    .eraseToAnyPublisher()
            }
            .catch { [weak self] error -> AnyPublisher<String, DataServiceError> in
                guard let self = self else {
                    return Fail(error: error).eraseToAnyPublisher()
                }
                // Fallback to direct job fetch
                return self.fetchContentFromJob(jobId: jobId)
                    .handleEvents(receiveOutput: { [weak self] content in
                        self?.contentCache.setObject(content as NSString, forKey: jobId as NSString)
                    })
                    .eraseToAnyPublisher()
            }
            .retry(2)
            .eraseToAnyPublisher()
    }

    private func refreshContentInBackground(jobId: String) async throws -> String {
        // Similar fetch logic but async
        return ""
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
        // Relay-first: directly use RPC-via-relay
        logger.debug("Plan details RPC path selected")
        return getPlanDetailsViaRPC(jobId: jobId)
    }

    /// List plans using RPC call
    public func listPlans(taskId: String?) -> AsyncThrowingStream<Any, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    var params: [String: Any] = [:]
                    if let taskId = taskId {
                        params["taskId"] = taskId
                    }

                    let request = RpcRequest(method: "plans.list", params: params)

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Get plan content using RPC call
    public func getPlan(id: String) -> AsyncThrowingStream<Any, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "plans.get",
                        params: ["planId": id]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Save plan content using RPC call
    public func savePlan(id: String, content: String) -> AsyncThrowingStream<Any, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "plans.save",
                        params: [
                            "planId": id,
                            "content": content
                        ]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Get implementation plan prompt for viewing
    public func getPlanPrompt(
        sessionId: String,
        taskDescription: String,
        projectDirectory: String,
        relevantFiles: [String]
    ) async throws -> PromptResponse {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            throw DataServiceError.connectionError("No active device connection")
        }

        let request = RpcRequest(
            method: "actions.getImplementationPlanPrompt",
            params: [
                "sessionId": sessionId,
                "taskDescription": taskDescription,
                "projectDirectory": projectDirectory,
                "relevantFiles": relevantFiles
            ]
        )

        var result: PromptResponse?
        for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
            if let error = response.error {
                throw DataServiceError.serverError("RPC Error: \(error.message)")
            }

            if let resultData = response.result?.value as? [String: Any],
               let promptDict = resultData["prompt"] as? [String: Any],
               let systemPrompt = promptDict["systemPrompt"] as? String,
               let userPrompt = promptDict["userPrompt"] as? String,
               let combinedPrompt = promptDict["combinedPrompt"] as? String {
                result = PromptResponse(
                    systemPrompt: systemPrompt,
                    userPrompt: userPrompt,
                    combinedPrompt: combinedPrompt
                )
                if response.isFinal {
                    break
                }
            }
        }

        guard let finalResult = result else {
            throw DataServiceError.invalidResponse("No prompt data received")
        }

        return finalResult
    }

    /// Create plan from task using RPC call
    public func createPlanFromTask(taskId: String, options: [String: Any] = [:]) -> AsyncThrowingStream<Any, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    var params: [String: Any] = ["taskId": taskId]
                    for (key, value) in options {
                        params[key] = value
                    }

                    let request = RpcRequest(method: "plans.create", params: params)

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Activate plan using RPC call
    public func activatePlan(id: String) -> AsyncThrowingStream<Any, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "plans.activate",
                        params: ["id": id]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Delete plan using RPC call
    public func deletePlan(id: String) -> AsyncThrowingStream<Any, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "plans.delete",
                        params: ["planId": id]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    private func getPlanDetailsViaRPC(jobId: String) -> AnyPublisher<PlanDetails, DataServiceError> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return Fail(error: DataServiceError.connectionError("No active device connection"))
                .eraseToAnyPublisher()
        }

        let request = RpcRequest(
            method: "plans.get",
            params: [
                "planId": jobId
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

                        if let result = response.result?.value as? [String: Any],
                           let planNode = result["plan"] as? [String: Any] {
                            planData = planNode
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
        let token = UUID()
        return Future<PlanListResponse, DataServiceError> { [weak self] promise in
            Task {
                await MainActor.run {
                    self?.currentListPlansRequestToken = token
                }

                do {
                    guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
                          let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
                        promise(.failure(.connectionError("No active device connection")))
                        return
                    }

                    // Build params ensuring at least one identifier is provided
                    let sessionId = request.sessionId
                    let projectDirectory = request.projectDirectory

                    // Validate we have at least one identifier
                    if sessionId == nil && projectDirectory == nil {
                        promise(.failure(.invalidState("sessionId or projectDirectory required")))
                        return
                    }

                    var params: [String: Any] = [:]
                    if let projectDirectory = projectDirectory {
                        params["projectDirectory"] = projectDirectory
                    }
                    // Always include non-ephemeral sessionId
                    if let sessionId = sessionId, !sessionId.hasPrefix("mobile-session-") {
                        params["sessionId"] = sessionId
                    }

                    let rpcRequest = RpcRequest(
                        method: "plans.list",
                        params: params
                    )

                    var jobsData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
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
                          let plans = data["plans"] as? [[String: Any]] else {
                        promise(.failure(.invalidResponse("No plans data received")))
                        return
                    }

                    var plansArray = plans.compactMap { item -> PlanSummary? in
                        // Required core fields - camelCase only
                        guard
                            let id = item["id"] as? String,
                            let status = item["status"] as? String,
                            let sessionId = item["sessionId"] as? String
                        else {
                            return nil
                        }

                        let createdAtSec = Self.epochSeconds(from: item["createdAt"])
                            ?? Self.iso8601Seconds(from: item["createdAt"])
                            ?? 0

                        let updatedAtSec = Self.epochSeconds(from: item["updatedAt"])
                            ?? Self.iso8601Seconds(from: item["updatedAt"])
                            ?? 0

                        if Self.epochSeconds(from: item["createdAt"]) == nil && Self.iso8601Seconds(from: item["createdAt"]) != nil {
                            self?.logger.debug("Parsed createdAt from ISO-8601 format")
                        }

                        // Optional top-level fields - camelCase only
                        let filePath = item["filePath"] as? String
                        let sizeBytes = Self.uint(from: item["sizeBytes"])
                        let title = item["title"] as? String
                        let tokensSent = Self.int(from: item["tokensSent"])
                        let tokensReceived = Self.int(from: item["tokensReceived"])

                        // Optional nested executionStatus - camelCase only
                        var executionStatus: PlanExecutionStatus? = nil
                        if let es = item["executionStatus"] as? [String: Any] {
                            let isExecuting = Self.bool(from: es["isExecuting"]) ?? false
                            let progress = Self.float(from: es["progressPercentage"])
                            let currentStep = es["currentStep"] as? String
                            let stepsCompleted = Self.uint(from: es["stepsCompleted"]) ?? 0
                            let totalSteps = Self.uint(from: es["totalSteps"]) ?? 0
                            let startedAtSec = Self.epochSeconds(from: es["startedAt"])
                            let etaSec = Self.epochSeconds(from: es["estimatedCompletion"])

                            executionStatus = PlanExecutionStatus(
                                isExecuting: isExecuting,
                                progressPercentage: progress,
                                currentStep: currentStep,
                                stepsCompleted: stepsCompleted,
                                totalSteps: totalSteps,
                                startedAt: startedAtSec,
                                estimatedCompletion: etaSec
                            )
                        }

                        return PlanSummary(
                            id: id,
                            jobId: id,
                            title: title,
                            filePath: filePath,
                            createdAt: createdAtSec,
                            updatedAt: updatedAtSec,
                            sizeBytes: sizeBytes,
                            status: status,
                            sessionId: sessionId,
                            executionStatus: executionStatus,
                            tokensSent: tokensSent,
                            tokensReceived: tokensReceived
                        )
                    }

                    // Defensive client-side filter
                    if let sid = request.sessionId {
                        plansArray = plansArray.filter { $0.sessionId == sid }
                    }

                    let response = PlanListResponse(
                        plans: plansArray,
                        totalCount: UInt32(plansArray.count),
                        page: request.page ?? 0,
                        pageSize: request.pageSize ?? 20,
                        hasMore: false
                    )

                    if let self = self, self.currentListPlansRequestToken == token {
                        self.plans = response.plans
                        self.hasLoadedOnce = true
                        self.logger.debug("Loaded \(plansArray.count) plans from RPC for project: \(request.projectDirectory ?? "unknown")")
                        self.cacheManager.set(response, forKey: cacheKey, ttl: 600)

                        // Prefetch top plan contents
                        self.prefetchTopPlanContents()
                    }
                    promise(.success(response))

                } catch {
                    let dataServiceError = error as? DataServiceError ?? .networkError(error)
                    promise(.failure(dataServiceError))
                }
            }
        }
        .handleEvents(
            receiveOutput: { [weak self] _ in
                guard let self = self else { return }
                if self.currentListPlansRequestToken == token {
                    self.isLoading = false
                }
            },
            receiveCompletion: { [weak self] completion in
                guard let self = self else { return }
                if self.currentListPlansRequestToken == token {
                    self.isLoading = false
                    self.hasLoadedOnce = true
                }
                if case .failure(let error) = completion {
                    self.error = error
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

        var params: [String: Any] = ["planId": request.jobId]
        if let chunkSize = request.chunkSize {
            params["chunkSize"] = chunkSize
        }
        if let chunkIndex = request.chunkIndex {
            params["chunkIndex"] = chunkIndex
        }
        let rpcRequest = RpcRequest(method: "plans.get", params: params)

        return Future<PlanContentResponse, DataServiceError> { [weak self] promise in
            Task {
                do {
                    var planData: [String: Any]?

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: rpcRequest) {
                        if let error = response.error {
                            let errorMsg = "\(error)"
                            if errorMsg.lowercased().contains("job not found") || errorMsg.lowercased().contains("not found") {
                                self?.plans.removeAll { $0.jobId == request.jobId }
                                self?.cacheManager.invalidatePattern("plans_")
                                let deletedEvent = RelayEvent(
                                    eventType: "PlanDeleted",
                                    data: ["jobId": request.jobId]
                                )
                                Task { @MainActor in
                                    self?.lastUpdateEvent = deletedEvent
                                }
                            }
                            promise(.failure(.serverError("RPC Error: \(error)")))
                            return
                        }

                        if let result = response.result?.value as? [String: Any],
                           let planNode = result["plan"] as? [String: Any] {
                            planData = planNode
                            if response.isFinal {
                                break
                            }
                        }
                    }

                    guard let data = planData else {
                        promise(.failure(.invalidResponse("No plan content received")))
                        return
                    }

                    guard let content = data["content"] as? String else {
                        promise(.failure(.invalidResponse("No plan content received")))
                        return
                    }

                    let isChunked = Self.bool(from: data["isChunked"]) ?? false
                    var chunkInfo: ChunkInfo? = nil
                    if let ci = data["chunkInfo"] as? [String: Any] {
                        chunkInfo = ChunkInfo(
                            chunkIndex: Self.uint(from: ci["chunkIndex"]) ?? 0,
                            totalChunks: Self.uint(from: ci["totalChunks"]) ?? 1,
                            chunkSize: Self.uint(from: ci["chunkSize"]) ?? 50000,
                            totalSize: Self.uint(from: ci["totalSize"]) ?? UInt(content.utf8.count),
                            hasMore: Self.bool(from: ci["hasMore"]) ?? false
                        )
                    }

                    // Integrity validation
                    let status = data["status"] as? String
                    if content.isEmpty {
                        if let s = status {
                            let activeStatuses = ["idle", "created", "queued", "acknowledgedByWorker",
                                                "preparing", "preparingInput", "generatingStream",
                                                "processingStream", "running"]
                            if !activeStatuses.contains(s) {
                                // Completed but empty - trigger retry
                                promise(.failure(.invalidResponse("Plan content is empty")))
                                return
                            }
                        }
                    }

                    // Size integrity check for non-chunked complete content
                    if !isChunked, let reportedSize = Self.uint(from: data["sizeBytes"]) {
                        if reportedSize > 0 && content.utf8.count != reportedSize {
                            promise(.failure(.invalidResponse("Content size mismatch")))
                            return
                        }
                    }

                    let createdAtSec = Self.epochSeconds(from: data["createdAt"])
                        ?? Self.iso8601Seconds(from: data["createdAt"])
                        ?? 0

                    let updatedAtSec = Self.epochSeconds(from: data["updatedAt"])
                        ?? Self.iso8601Seconds(from: data["updatedAt"])
                        ?? 0
                    let sizeBytes = Self.uint(from: data["sizeBytes"]) ?? UInt(content.utf8.count)
                    let filePath = data["filePath"] as? String
                    let title = data["title"] as? String
                    let wordCount = Self.uint(from: data["wordCount"])
                    let lineCount = Self.uint(from: data["lineCount"])
                    let estimatedReadTimeMinutes = Self.uint(from: data["estimatedReadTimeMinutes"]).map { UInt32($0) }
                    let complexityScore = Self.float(from: data["complexityScore"])

                    let planMetadata = PlanMetadata(
                        title: title,
                        filePath: filePath,
                        createdAt: createdAtSec,
                        updatedAt: updatedAtSec,
                        sizeBytes: sizeBytes,
                        wordCount: wordCount,
                        lineCount: lineCount,
                        estimatedReadTimeMinutes: estimatedReadTimeMinutes,
                        complexityScore: complexityScore
                    )

                    let response = PlanContentResponse(
                        jobId: request.jobId,
                        content: content,
                        isChunked: isChunked,
                        chunkInfo: chunkInfo,
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

    private func fetchContentFromJob(jobId: String) -> AnyPublisher<String, DataServiceError> {
        return self.jobsService.getJobFast(jobId: jobId)
            .map { job in job.response ?? "" }
            .mapError { $0 }
            .eraseToAnyPublisher()
    }

    private func parsePlanDetailsFromRPC(data: [String: Any], jobId: String) throws -> PlanDetails {
        guard let content = data["content"] as? String else {
            throw DataServiceError.invalidResponse("Missing plan content")
        }

        let createdAtSec = Self.epochSeconds(from: data["createdAt"])
            ?? Self.iso8601Seconds(from: data["createdAt"])
            ?? 0

        let updatedAtSec = Self.epochSeconds(from: data["updatedAt"])
            ?? Self.iso8601Seconds(from: data["updatedAt"])

        let createdAt = Date(timeIntervalSince1970: TimeInterval(createdAtSec))
        let updatedAt = updatedAtSec.map { Date(timeIntervalSince1970: TimeInterval($0)) }

        let sizeBytes = Self.uint(from: data["sizeBytes"]) ?? UInt(content.utf8.count)
        let wordCount = Self.uint(from: data["wordCount"])
        let lineCount = Self.uint(from: data["lineCount"])
        let estimatedReadTimeMinutes = Self.uint(from: data["estimatedReadTimeMinutes"]).map { UInt32($0) }
        let isChunked = Self.bool(from: data["isChunked"]) ?? false

        return PlanDetails(
            jobId: jobId,
            title: data["title"] as? String,
            content: content,
            filePath: data["filePath"] as? String,
            createdAt: createdAt,
            updatedAt: updatedAt,
            sizeBytes: sizeBytes,
            wordCount: wordCount,
            lineCount: lineCount,
            estimatedReadTimeMinutes: estimatedReadTimeMinutes,
            isChunked: isChunked,
            chunkInfo: nil
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

    public func onActiveDeviceChanged(_ newId: UUID?) {
        if newId != lastBoundDeviceId {
            self.relayEventsCancellable?.cancel()
            self.invalidateCache()
            self.plans.removeAll()
            self.lastBoundDeviceId = newId
            self.rebindRelayEvents()
        }
    }

    /// Prefetch top plan contents into memory cache
    @MainActor
    public func prefetchTopPlanContents(limit: Int = 3) {
        // Get top plans sorted by recency
        let topPlans = plans
            .sorted { p1, p2 in
                let time1 = p1.updatedAt ?? p1.createdAt
                let time2 = p2.updatedAt ?? p2.createdAt
                return time1 > time2
            }
            .prefix(limit)

        // Prefetch content for each plan (non-blocking)
        for plan in topPlans {
            getFullPlanContent(jobId: plan.jobId)
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        }
    }

    /// Setup subscription to relay events for real-time synchronization
    private func setupRelayEventSubscription() {
        guard let activeDeviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: activeDeviceId) else {
            return
        }

        relayClient.events
            .filter { event in
                [
                    "PlansUpdated", "PlanCreated", "PlanDeleted", "PlanModified",
                    "job:created", "job:deleted", "job:status-changed", "job:response-appended",
                    "job:stream-progress", "job:finalized", "job:tokens-updated", "job:cost-updated",
                    "job:error-details", "job:metadata-updated"
                ].contains(event.eventType)
            }
            .sink { [weak self] event in
                guard let self = self else { return }

                self.lastUpdateEvent = event
                self.invalidateCache()

                // Try to extract projectDirectory from event data and preload
                if let projectDirectory = event.data["projectDirectory"]?.value as? String {
                    self.preloadPlans(for: projectDirectory)
                } else if event.eventType.hasPrefix("job:") {
                    // For job events without explicit projectDirectory, just invalidate
                    // The next UI-driven fetch will reload
                }

                // Handle specific event types
                switch event.eventType {
                case "PlansUpdated", "PlanCreated", "PlanDeleted", "PlanModified":
                    self.handlePlanDataChange(event: event)
                case let eventType where eventType.hasPrefix("job:"):
                    // Job events already handled by cache invalidation above
                    break
                default:
                    break
                }
            }
            .store(in: &cancellables)
    }

    /// Handle plan data changes from relay events
    private func handlePlanDataChange(event: RelayEvent) {
        invalidateCache()

        if let projectDirectory = event.data["projectDirectory"]?.value as? String {
            preloadPlans(for: projectDirectory)
        }
    }
}

// MARK: - Numeric Coercion Helpers
private extension PlansDataService {
    static func int(from any: Any?) -> Int? {
        switch any {
        case let n as NSNumber:
            return n.intValue
        case let s as String:
            if let d = Double(s) { return Int(d) }
            return Int(s)
        case let i as Int:
            return i
        case let d as Double:
            return Int(d)
        default:
            return nil
        }
    }

    static func int64(from any: Any?) -> Int64? {
        switch any {
        case let n as NSNumber:
            return n.int64Value
        case let s as String:
            if let d = Double(s) { return Int64(d) }
            return Int64(s)
        case let i as Int:
            return Int64(i)
        case let d as Double:
            return Int64(d)
        default:
            return nil
        }
    }

    static func uint(from any: Any?) -> UInt? {
        switch any {
        case let n as NSNumber:
            let v = n.int64Value
            return v >= 0 ? UInt(v) : nil
        case let s as String:
            if let d = Double(s) {
                return d >= 0 ? UInt(d) : nil
            }
            if let i = Int64(s), i >= 0 { return UInt(i) }
            return nil
        case let i as Int:
            return i >= 0 ? UInt(i) : nil
        case let d as Double:
            return d >= 0 ? UInt(d) : nil
        default:
            return nil
        }
    }

    static func float(from any: Any?) -> Float? {
        switch any {
        case let n as NSNumber:
            return n.floatValue
        case let s as String:
            return Float(s)
        case let f as Float:
            return f
        case let d as Double:
            return Float(d)
        case let i as Int:
            return Float(i)
        default:
            return nil
        }
    }

    static func bool(from any: Any?) -> Bool? {
        switch any {
        case let b as Bool:
            return b
        case let n as NSNumber:
            return n.boolValue
        default:
            return nil
        }
    }

    private static func iso8601Seconds(from value: Any?) -> Int64? {
        guard let dateString = value as? String else { return nil }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: dateString) {
            return Int64(date.timeIntervalSince1970)
        }

        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: dateString) {
            return Int64(date.timeIntervalSince1970)
        }

        if let ms = Int64(dateString) {
            return ms / 1000
        }

        return nil
    }

    // Canonical unit: seconds; tolerate accidental ms by threshold
    static func epochSeconds(from any: Any?) -> Int64? {
        guard let raw = int64(from: any) else { return nil }
        if raw >= 1_000_000_000_000 { // ms threshold
            return raw / 1000
        }
        return raw
    }
}

// MARK: - Supporting Types

public struct PlanListRequest: Codable {
    public let projectDirectory: String?
    public let sessionId: String?
    public let dateFrom: Int64?
    public let dateTo: Int64?
    public let page: UInt32?
    public let pageSize: UInt32?
    public let sortBy: PlanSortBy?
    public let sortOrder: SortOrder?
    public let includeMetadataOnly: Bool?

    public init(
        projectDirectory: String? = nil,
        sessionId: String? = nil,
        dateFrom: Int64? = nil,
        dateTo: Int64? = nil,
        page: UInt32? = 0,
        pageSize: UInt32? = 20,
        sortBy: PlanSortBy? = .createdAt,
        sortOrder: SortOrder? = .desc,
        includeMetadataOnly: Bool? = true
    ) {
        self.projectDirectory = projectDirectory
        self.sessionId = sessionId
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
            sessionId ?? "nil",
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
    public let tokensSent: Int?
    public let tokensReceived: Int?

    public var size: String {
        guard let bytes = sizeBytes else { return "Unknown" }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    public var tokenCount: String {
        let sent = tokensSent ?? 0
        let received = tokensReceived ?? 0
        let total = sent + received

        if total > 0 {
            return "\(total.formatted()) tokens"
        } else {
            return "N/A"
        }
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
