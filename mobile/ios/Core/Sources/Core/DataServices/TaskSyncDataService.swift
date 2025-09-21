import Foundation
import Combine
import OSLog

/// Service for syncing task descriptions with conflict resolution and real-time updates
@MainActor
public class TaskSyncDataService: ObservableObject {

    // MARK: - Published Properties
    @Published public var tasks: [TaskDescription] = []
    @Published public var conflicts: [TaskConflict] = []
    @Published public var syncStatus: TaskSyncStatus = TaskSyncStatus.disconnected
    @Published public var isLoading = false
    @Published public var error: DataServiceError?

    // MARK: - Private Properties
    private let desktopServerAPIClient: DesktopServerAPIClient
    private let webSocketClient: WebSocketClient
    private let cacheManager: CacheManager
    private let apiClient: APIClientProtocol
    private let deviceId: String
    private var cancellables = Set<AnyCancellable>()
    private var syncTimer: Timer?
    private let logger = Logger(subsystem: "VibeManager", category: "TaskSync")

    // Debouncing
    private var updateTaskSubject = PassthroughSubject<(taskId: String, content: String, expectedVersion: UInt32?), Never>()
    private let debounceInterval: TimeInterval

    // MARK: - Initialization
    public init(
        desktopServerAPIClient: DesktopServerAPIClient,
        webSocketClient: WebSocketClient,
        deviceId: String,
        cacheManager: CacheManager = CacheManager.shared,
        apiClient: APIClientProtocol = APIClient.shared,
        debounceInterval: TimeInterval = 0.5
    ) {
        self.desktopServerAPIClient = desktopServerAPIClient
        self.webSocketClient = webSocketClient
        self.deviceId = deviceId
        self.cacheManager = cacheManager
        self.apiClient = apiClient
        self.debounceInterval = debounceInterval

        setupAutoSync()
        setupWebSocketSubscriptions()
        setupDebouncedUpdates()
    }

    deinit {
        syncTimer?.invalidate()
    }

    // MARK: - Public Methods

    /// Update task with debouncing
    public func updateTaskWithDebouncing(taskId: String, content: String, expectedVersion: UInt32? = nil) {
        logger.info("Queuing task update for \(taskId)")
        updateTaskSubject.send((taskId: taskId, content: content, expectedVersion: expectedVersion))
    }

    /// Create a new task description
    public func createTask(request: CreateTaskRequest) -> AnyPublisher<CreateTaskResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .createTask,
            method: .POST,
            body: request
        )
        .decode(type: CreateTaskResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(receiveOutput: { [weak self] response in
            if response.created {
                self?.tasks.append(response.task)
                self?.invalidateCache()
            }
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Update an existing task description
    public func updateTask(request: UpdateTaskRequest) -> AnyPublisher<UpdateTaskResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .updateTask,
            method: .POST,
            body: request
        )
        .decode(type: UpdateTaskResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(receiveOutput: { [weak self] response in
            if response.updated {
                self?.updateLocalTask(response.task)
                self?.invalidateCache()
            }
            if response.conflictDetected {
                self?.refreshConflicts()
            }
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Sync a task description with conflict detection
    public func syncTask(request: SyncTaskRequest) -> AnyPublisher<SyncTaskResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .syncTask,
            method: .POST,
            body: request
        )
        .decode(type: SyncTaskResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(receiveOutput: { [weak self] response in
            self?.handleSyncResponse(response)
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Batch sync multiple tasks
    public func batchSync(request: BatchSyncRequest) -> AnyPublisher<BatchSyncResponse, DataServiceError> {
        isLoading = true

        return apiClient.request(
            endpoint: .batchSync,
            method: .POST,
            body: request
        )
        .decode(type: BatchSyncResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(
            receiveOutput: { [weak self] response in
                self?.handleBatchSyncResponse(response)
                self?.isLoading = false
            },
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    self?.error = DataServiceError.networkError(error)
                }
            }
        )
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Resolve a task conflict
    public func resolveConflict(request: ResolveConflictRequest) -> AnyPublisher<ResolveConflictResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .resolveConflict,
            method: .POST,
            body: request
        )
        .decode(type: ResolveConflictResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(receiveOutput: { [weak self] response in
            if response.success {
                self?.removeConflict(sessionId: request.sessionId)
                self?.updateLocalTask(response.resolvedTask)
                self?.invalidateCache()
            }
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get active tasks
    public func getActiveTasks(request: GetActiveTasksRequest) -> AnyPublisher<GetActiveTasksResponse, DataServiceError> {
        let cacheKey = "active_tasks_\(request.cacheKey)"

        if let cached: GetActiveTasksResponse = cacheManager.get(key: cacheKey) {
            tasks = cached.tasks
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        return apiClient.request(
            endpoint: .getActiveTasks,
            method: .POST,
            body: request
        )
        .decode(type: GetActiveTasksResponse.self, decoder: JSONDecoder.apiDecoder)
        .map { [weak self] response in
            self?.tasks = response.tasks
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 300) // 5 min cache
            return response
        }
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get task history
    public func getTaskHistory(request: GetTaskHistoryRequest) -> AnyPublisher<GetTaskHistoryResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .getTaskHistory,
            method: .POST,
            body: request
        )
        .decode(type: GetTaskHistoryResponse.self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get sync status
    public func getSyncStatus(projectDirectory: String? = nil) -> AnyPublisher<TaskSyncStatusResponse, DataServiceError> {
        let request = GetSyncStatusRequest(
            deviceId: deviceId,
            projectDirectory: projectDirectory
        )

        return apiClient.request(
            endpoint: .getSyncStatus,
            method: .POST,
            body: request
        )
        .decode(type: TaskSyncStatusResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(receiveOutput: { [weak self] response in
            self?.syncStatus = TaskSyncStatus(
                lastSyncAt: Date(timeIntervalSince1970: TimeInterval(response.lastSyncAt)),
                pendingSyncs: Int(response.pendingSyncs),
                conflictsCount: Int(response.conflictsCount),
                isOnline: response.isOnline
            )
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    // MARK: - Convenience Methods

    /// Create a task for a session
    public func createTaskForSession(_ sessionId: String, content: String) -> AnyPublisher<TaskDescription, DataServiceError> {
        let request = CreateTaskRequest(
            sessionId: sessionId,
            content: content,
            deviceId: deviceId
        )

        return createTask(request: request)
            .map(\.task)
            .eraseToAnyPublisher()
    }

    /// Update task content
    public func updateTaskContent(_ taskId: String, content: String, expectedVersion: UInt32? = nil) -> AnyPublisher<TaskDescription, DataServiceError> {
        let request = UpdateTaskRequest(
            taskId: taskId,
            content: content,
            deviceId: deviceId,
            expectedVersion: expectedVersion
        )

        return updateTask(request: request)
            .map(\.task)
            .eraseToAnyPublisher()
    }

    /// Auto-resolve conflict with last-write-wins strategy
    public func autoResolveConflict(_ sessionId: String) -> AnyPublisher<TaskDescription, DataServiceError> {
        let request = ResolveConflictRequest(
            sessionId: sessionId,
            conflictId: sessionId, // Simplified for demo
            resolutionStrategy: .lastWriteWins,
            deviceId: deviceId
        )

        return resolveConflict(request: request)
            .map(\.resolvedTask)
            .eraseToAnyPublisher()
    }

    /// Manual conflict resolution with custom content
    public func manualResolveConflict(_ sessionId: String, customContent: String) -> AnyPublisher<TaskDescription, DataServiceError> {
        let request = ResolveConflictRequest(
            sessionId: sessionId,
            conflictId: sessionId,
            resolutionStrategy: .userChoice,
            customContent: customContent,
            deviceId: deviceId
        )

        return resolveConflict(request: request)
            .map(\.resolvedTask)
            .eraseToAnyPublisher()
    }

    /// Force sync all tasks for a project
    public func forceSyncProject(_ projectDirectory: String) -> AnyPublisher<Void, DataServiceError> {
        // Get all sessions for project first
        let getTasksRequest = GetActiveTasksRequest(
            sessionIds: nil,
            deviceId: deviceId,
            projectDirectory: projectDirectory,
            includeInactive: false
        )

        return getActiveTasks(request: getTasksRequest)
            .flatMap { [weak self] response -> AnyPublisher<Void, DataServiceError> in
                guard let self = self else {
                    return Fail(error: DataServiceError.invalidState("Service deallocated"))
                        .eraseToAnyPublisher()
                }

                let sessionIds = response.tasks.map(\.sessionId)
                let batchRequest = BatchSyncRequest(
                    sessionIds: sessionIds,
                    deviceId: self.deviceId,
                    syncTimestamp: Int64(Date().timeIntervalSince1970)
                )

                return self.batchSync(request: batchRequest)
                    .map { _ in () }
                    .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }

    // MARK: - Private Methods

    private func setupWebSocketSubscriptions() {
        // Subscribe to task updates from WebSocket
        webSocketClient.taskUpdates
            .sink { [weak self] taskDescription in
                Task { @MainActor in
                    self?.handleRealTimeTaskUpdate(taskDescription)
                }
            }
            .store(in: &cancellables)
    }

    private func setupDebouncedUpdates() {
        // Setup debounced task updates
        updateTaskSubject
            .debounce(for: .seconds(debounceInterval), scheduler: DispatchQueue.main)
            .sink { [weak self] update in
                Task {
                    await self?.performTaskUpdate(
                        taskId: update.taskId,
                        content: update.content,
                        expectedVersion: update.expectedVersion
                    )
                }
            }
            .store(in: &cancellables)
    }

    @MainActor
    private func handleRealTimeTaskUpdate(_ taskDescription: TaskDescription) {
        logger.info("Received real-time task update for \(taskDescription.id)")

        // Update or add task in local array
        if let index = tasks.firstIndex(where: { $0.id == taskDescription.id }) {
            tasks[index] = taskDescription
        } else {
            tasks.append(taskDescription)
        }

        // Sort by updated date
        tasks.sort { $0.updatedAt > $1.updatedAt }
        invalidateCache()
    }

    private func performTaskUpdate(taskId: String, content: String, expectedVersion: UInt32?) async {
        logger.info("Performing debounced task update for \(taskId)")

        do {
            let response: UpdateTaskResponse = try await desktopServerAPIClient.executeCommand(
                command: "update_task_description_api",
                payload: UpdateTaskRequest(
                    taskId: taskId,
                    content: content,
                    deviceId: deviceId,
                    expectedVersion: expectedVersion
                )
            )

            await MainActor.run {
                if response.conflictDetected {
                    self.logger.warning("Task update conflict detected for \(taskId)")
                    self.error = DataServiceError.conflictDetected(taskId: taskId, serverTask: response.task)
                } else if response.updated {
                    self.logger.info("Task \(taskId) updated successfully via debounced update")
                    // Note: Don't update local task here since real-time WebSocket will handle it
                }
            }

        } catch {
            logger.error("Failed to update task \(taskId): \(error.localizedDescription)")
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
            }
        }
    }

    private func setupAutoSync() {
        // Auto-sync every 30 seconds
        syncTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.performAutoSync()
        }
    }

    private func performAutoSync() {
        // Get current project directory from some state
        // For now, we'll skip auto-sync implementation
        // In real app, this would sync active project tasks
    }

    private func handleSyncResponse(_ response: SyncTaskResponse) {
        if response.success {
            if let resolvedTask = response.resolvedTask {
                updateLocalTask(resolvedTask)
            }
        }

        if response.conflictDetected {
            refreshConflicts()
        }

        updateSyncStatus(connected: true)
    }

    private func handleBatchSyncResponse(_ response: BatchSyncResponse) {
        // Update local tasks
        for task in response.syncedTasks {
            updateLocalTask(task)
        }

        // Add new conflicts
        conflicts.append(contentsOf: response.conflicts)

        updateSyncStatus(connected: true)
        invalidateCache()
    }

    private func updateLocalTask(_ task: TaskDescription) {
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index] = task
        } else {
            tasks.append(task)
        }
    }

    private func removeConflict(sessionId: String) {
        conflicts.removeAll { $0.sessionId == sessionId }
    }

    private func refreshConflicts() {
        // In real implementation, would fetch current conflicts
        // For now, just update sync status
        updateSyncStatus(connected: true)
    }

    private func updateSyncStatus(connected: Bool) {
        syncStatus = TaskSyncStatus(
            lastSyncAt: Date(),
            pendingSyncs: 0, // Would calculate from actual pending operations
            conflictsCount: conflicts.count,
            isOnline: connected
        )
    }

    private func invalidateCache() {
        cacheManager.invalidatePattern("active_tasks_")
        cacheManager.invalidatePattern("task_history_")
    }
}

// MARK: - Supporting Types

public struct TaskDescription: Codable, Identifiable {
    public let id: String
    public let sessionId: String
    public let content: String
    public let createdAt: Int64
    public let updatedAt: Int64
    public let createdBy: String
    public let version: UInt32
    public let isActive: Bool
    public let checksum: String

    public var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(updatedAt))
        return DateFormatter.medium.string(from: date)
    }
}

public struct CreateTaskRequest: Codable {
    public let sessionId: String
    public let content: String
    public let deviceId: String

    public init(sessionId: String, content: String, deviceId: String) {
        self.sessionId = sessionId
        self.content = content
        self.deviceId = deviceId
    }
}

public struct CreateTaskResponse: Codable {
    public let task: TaskDescription
    public let created: Bool
}

public struct UpdateTaskRequest: Codable {
    public let taskId: String
    public let content: String
    public let deviceId: String
    public let expectedVersion: UInt32?

    public init(taskId: String, content: String, deviceId: String, expectedVersion: UInt32? = nil) {
        self.taskId = taskId
        self.content = content
        self.deviceId = deviceId
        self.expectedVersion = expectedVersion
    }
}

public struct UpdateTaskResponse: Codable {
    public let task: TaskDescription
    public let updated: Bool
    public let conflictDetected: Bool
}

public struct SyncTaskRequest: Codable {
    public let sessionId: String
    public let taskDescription: TaskDescription
    public let forceUpdate: Bool?
    public let deviceId: String
    public let syncTimestamp: Int64

    public init(sessionId: String, taskDescription: TaskDescription, forceUpdate: Bool? = false, deviceId: String) {
        self.sessionId = sessionId
        self.taskDescription = taskDescription
        self.forceUpdate = forceUpdate
        self.deviceId = deviceId
        self.syncTimestamp = Int64(Date().timeIntervalSince1970)
    }
}

public struct SyncTaskResponse: Codable {
    public let success: Bool
    public let conflictDetected: Bool
    public let resolvedTask: TaskDescription?
    public let conflictResolution: ConflictResolution?
    public let syncTimestamp: Int64
    public let message: String
}

public struct BatchSyncRequest: Codable {
    public let sessionIds: [String]
    public let deviceId: String
    public let syncTimestamp: Int64
    public let includeHistory: Bool?

    public init(sessionIds: [String], deviceId: String, syncTimestamp: Int64, includeHistory: Bool? = false) {
        self.sessionIds = sessionIds
        self.deviceId = deviceId
        self.syncTimestamp = syncTimestamp
        self.includeHistory = includeHistory
    }
}

public struct BatchSyncResponse: Codable {
    public let syncedTasks: [TaskDescription]
    public let conflicts: [TaskConflict]
    public let syncTimestamp: Int64
    public let totalSynced: UInt32
    public let totalConflicts: UInt32
}

public struct TaskConflict: Codable, Identifiable {
    public let id: String
    public let sessionId: String
    public let localVersion: TaskDescription
    public let remoteVersion: TaskDescription
    public let conflictType: ConflictType
    public let detectedAt: Int64

    public var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(detectedAt))
        return DateFormatter.medium.string(from: date)
    }
}

public enum ConflictType: String, Codable {
    case contentMismatch
    case versionMismatch
    case timestampConflict
    case checksumMismatch
}

public struct ResolveConflictRequest: Codable {
    public let sessionId: String
    public let conflictId: String
    public let resolutionStrategy: ResolutionStrategy
    public let chosenVersion: TaskDescription?
    public let customContent: String?
    public let deviceId: String

    public init(
        sessionId: String,
        conflictId: String,
        resolutionStrategy: ResolutionStrategy,
        chosenVersion: TaskDescription? = nil,
        customContent: String? = nil,
        deviceId: String
    ) {
        self.sessionId = sessionId
        self.conflictId = conflictId
        self.resolutionStrategy = resolutionStrategy
        self.chosenVersion = chosenVersion
        self.customContent = customContent
        self.deviceId = deviceId
    }
}

public enum ResolutionStrategy: String, Codable, CaseIterable {
    case lastWriteWins
    case firstWriteWins
    case manual
    case contentMerge
    case userChoice

    public var displayName: String {
        switch self {
        case .lastWriteWins: return "Use Latest Version"
        case .firstWriteWins: return "Use Original Version"
        case .manual: return "Manual Resolution"
        case .contentMerge: return "Merge Content"
        case .userChoice: return "Custom Content"
        }
    }
}

public struct ResolveConflictResponse: Codable {
    public let success: Bool
    public let resolvedTask: TaskDescription
    public let resolution: ConflictResolution
}

public struct ConflictResolution: Codable {
    public let resolutionStrategy: ResolutionStrategy
    public let winningVersion: TaskDescription
    public let losingVersion: TaskDescription
    public let mergedContent: String?
    public let resolvedAt: Int64
    public let resolvedBy: String
}

public struct GetActiveTasksRequest: Codable {
    public let sessionIds: [String]?
    public let deviceId: String?
    public let projectDirectory: String?
    public let includeInactive: Bool?

    public init(
        sessionIds: [String]? = nil,
        deviceId: String? = nil,
        projectDirectory: String? = nil,
        includeInactive: Bool? = false
    ) {
        self.sessionIds = sessionIds
        self.deviceId = deviceId
        self.projectDirectory = projectDirectory
        self.includeInactive = includeInactive
    }

    var cacheKey: String {
        let components = [
            sessionIds?.joined(separator: ",") ?? "nil",
            deviceId ?? "nil",
            projectDirectory ?? "nil"
        ]
        return components.joined(separator: "_")
    }
}

public struct GetActiveTasksResponse: Codable {
    public let tasks: [TaskDescription]
    public let totalCount: UInt32
}

public struct GetTaskHistoryRequest: Codable {
    public let sessionId: String
    public let limit: UInt32?
    public let offset: UInt32?
    public let includeDeleted: Bool?
    public let fromTimestamp: Int64?
    public let toTimestamp: Int64?

    public init(
        sessionId: String,
        limit: UInt32? = 50,
        offset: UInt32? = 0,
        includeDeleted: Bool? = false,
        fromTimestamp: Int64? = nil,
        toTimestamp: Int64? = nil
    ) {
        self.sessionId = sessionId
        self.limit = limit
        self.offset = offset
        self.includeDeleted = includeDeleted
        self.fromTimestamp = fromTimestamp
        self.toTimestamp = toTimestamp
    }
}

public struct GetTaskHistoryResponse: Codable {
    public let history: [TaskDescriptionHistory]
    public let totalCount: UInt32
    public let hasMore: Bool
}

public struct TaskDescriptionHistory: Codable, Identifiable {
    public let id: String
    public let taskDescriptionId: String
    public let sessionId: String
    public let content: String
    public let createdAt: Int64
    public let createdBy: String
    public let version: UInt32
    public let changeType: ChangeType
    public let changeSummary: String?
    public let checksum: String
}

public enum ChangeType: String, Codable {
    case create
    case update
    case delete
    case sync
    case conflict
}

public struct GetSyncStatusRequest: Codable {
    public let deviceId: String
    public let projectDirectory: String?

    public init(deviceId: String, projectDirectory: String? = nil) {
        self.deviceId = deviceId
        self.projectDirectory = projectDirectory
    }
}

public struct TaskSyncStatusResponse: Codable {
    public let lastSyncAt: Int64
    public let pendingSyncs: UInt32
    public let conflictsCount: UInt32
    public let deviceId: String
    public let isOnline: Bool
}

public struct TaskSyncStatus {
    public let lastSyncAt: Date
    public let pendingSyncs: Int
    public let conflictsCount: Int
    public let isOnline: Bool

    public static let disconnected = TaskSyncStatus(
        lastSyncAt: Date.distantPast,
        pendingSyncs: 0,
        conflictsCount: 0,
        isOnline: false
    )

    public var statusText: String {
        if !isOnline {
            return "Offline"
        } else if conflictsCount > 0 {
            return "\(conflictsCount) conflict(s)"
        } else if pendingSyncs > 0 {
            return "\(pendingSyncs) pending"
        } else {
            return "Synced"
        }
    }

    public var statusColor: String {
        if !isOnline {
            return "red"
        } else if conflictsCount > 0 {
            return "orange"
        } else if pendingSyncs > 0 {
            return "yellow"
        } else {
            return "green"
        }
    }
}
