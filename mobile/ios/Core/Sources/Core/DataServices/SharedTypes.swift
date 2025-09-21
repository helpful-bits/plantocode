import Foundation

// MARK: - Common Types

public enum JobStatus: String, Codable, CaseIterable {
    case idle
    case created
    case queued
    case acknowledgedByWorker
    case preparing
    case preparingInput
    case generatingStream
    case processingStream
    case running
    case completedByTag
    case completed
    case failed
    case canceled

    public var isActive: Bool {
        switch self {
        case .idle, .created, .queued, .acknowledgedByWorker, .preparing,
             .preparingInput, .generatingStream, .processingStream, .running:
            return true
        case .completedByTag, .completed, .failed, .canceled:
            return false
        }
    }

    public var displayName: String {
        switch self {
        case .idle: return "Idle"
        case .created: return "Created"
        case .queued: return "Queued"
        case .acknowledgedByWorker: return "Acknowledged"
        case .preparing: return "Preparing"
        case .preparingInput: return "Preparing Input"
        case .generatingStream: return "Generating"
        case .processingStream: return "Processing"
        case .running: return "Running"
        case .completedByTag: return "Completed by Tag"
        case .completed: return "Completed"
        case .failed: return "Failed"
        case .canceled: return "Canceled"
        }
    }

    public var color: String {
        switch self {
        case .idle: return "gray"
        case .created, .queued: return "blue"
        case .acknowledgedByWorker, .preparing, .preparingInput: return "orange"
        case .generatingStream, .processingStream, .running: return "purple"
        case .completed, .completedByTag: return "green"
        case .failed: return "red"
        case .canceled: return "yellow"
        }
    }
}

public struct BackgroundJob: Codable, Identifiable {
    public let id: String
    public let sessionId: String
    public let taskType: String
    public var status: String
    public let prompt: String
    public let response: String?
    public let errorMessage: String?
    public let tokensUsed: Int32?
    public let actualCost: Double?
    public let createdAt: Int64
    public var updatedAt: Int64?

    public var jobStatus: JobStatus {
        JobStatus(rawValue: status) ?? .idle
    }

    public var formattedCost: String {
        guard let cost = actualCost else { return "Unknown" }
        return String(format: "$%.4f", cost)
    }

    public var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(createdAt))
        return DateFormatter.medium.string(from: date)
    }
}

// MARK: - API Endpoints

public enum APIEndpoint {
    // Jobs API
    case listJobs
    case getJobDetails
    case cancelJob
    case subscribeJobUpdates
    case getJobStatusUpdates

    // Plans API
    case listPlans
    case getPlanContent
    case searchPlans
    case getPlanRevision

    // Files API
    case searchFiles
    case getFileContent
    case listDirectory
    case getFilesMetadata
    case validatePath

    // Tasks API
    case createTask
    case updateTask
    case syncTask
    case batchSync
    case resolveConflict
    case getActiveTasks
    case getTaskHistory
    case getSyncStatus

    // SQLite API
    case executeSQLiteQuery
    case validateSQLiteQuery
    case getQueryTemplates
    case getDatabaseSchema
    case getQueryStats

    public var path: String {
        switch self {
        // Jobs
        case .listJobs: return "/api/jobs/list"
        case .getJobDetails: return "/api/jobs/details"
        case .cancelJob: return "/api/jobs/cancel"
        case .subscribeJobUpdates: return "/api/jobs/subscribe"
        case .getJobStatusUpdates: return "/api/jobs/status-updates"

        // Plans
        case .listPlans: return "/api/plans/list"
        case .getPlanContent: return "/api/plans/content"
        case .searchPlans: return "/api/plans/search"
        case .getPlanRevision: return "/api/plans/revision"

        // Files
        case .searchFiles: return "/api/files/search"
        case .getFileContent: return "/api/files/content"
        case .listDirectory: return "/api/files/directory"
        case .getFilesMetadata: return "/api/files/metadata"
        case .validatePath: return "/api/files/validate-path"

        // Tasks
        case .createTask: return "/api/tasks/create"
        case .updateTask: return "/api/tasks/update"
        case .syncTask: return "/api/tasks/sync"
        case .batchSync: return "/api/tasks/batch-sync"
        case .resolveConflict: return "/api/tasks/resolve-conflict"
        case .getActiveTasks: return "/api/tasks/active"
        case .getTaskHistory: return "/api/tasks/history"
        case .getSyncStatus: return "/api/tasks/sync-status"

        // SQLite
        case .executeSQLiteQuery: return "/api/sqlite/execute"
        case .validateSQLiteQuery: return "/api/sqlite/validate"
        case .getQueryTemplates: return "/api/sqlite/templates"
        case .getDatabaseSchema: return "/api/sqlite/schema"
        case .getQueryStats: return "/api/sqlite/stats"
        }
    }
}


// MARK: - HTTP Method

public enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
    case PATCH = "PATCH"
}

// MARK: - Data Service Errors

public enum DataServiceError: Error, LocalizedError {
    case networkError(Error)
    case invalidResponse(String)
    case invalidRequest(String)
    case invalidState(String)
    case fileSystemError(Error)
    case cacheError(String)
    case authenticationError(String)
    case permissionDenied(String)
    case rateLimitExceeded
    case serviceUnavailable
    case connectionError(String)
    case timeout
    case serverError(String)
    case conflictDetected(taskId: String, serverTask: TaskDescription)

    public var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidResponse(let message):
            return "Invalid response: \(message)"
        case .invalidRequest(let message):
            return "Invalid request: \(message)"
        case .invalidState(let message):
            return "Invalid state: \(message)"
        case .fileSystemError(let error):
            return "File system error: \(error.localizedDescription)"
        case .cacheError(let message):
            return "Cache error: \(message)"
        case .authenticationError(let message):
            return "Authentication error: \(message)"
        case .permissionDenied(let message):
            return "Permission denied: \(message)"
        case .rateLimitExceeded:
            return "Rate limit exceeded. Please try again later."
        case .serviceUnavailable:
            return "Service is currently unavailable. Please try again later."
        case .connectionError(let message):
            return "Connection error: \(message)"
        case .timeout:
            return "The request timed out. Please try again."
        case .serverError(let message):
            return "Server error: \(message)"
        case .conflictDetected(let taskId, _):
            return "Task \(taskId) has conflicting changes. Review before continuing."
        }
    }

    public var recoverySuggestion: String? {
        switch self {
        case .networkError:
            return "Check your internet connection and try again."
        case .invalidResponse, .invalidRequest:
            return "Please restart the app and try again."
        case .invalidState:
            return "Please refresh the data and try again."
        case .fileSystemError:
            return "Check file permissions and available storage."
        case .cacheError:
            return "Clear app cache and try again."
        case .authenticationError:
            return "Please log in again."
        case .permissionDenied:
            return "Check app permissions in settings."
        case .rateLimitExceeded:
            return "Wait a moment before making more requests."
        case .serviceUnavailable:
            return "The desktop app may not be running or connected."
        case .connectionError:
            return "Check connection to the desktop app."
        case .timeout:
            return "Please try again."
        case .serverError:
            return "Contact support if this issue persists."
        case .conflictDetected:
            return "Review the conflicting changes and merge manually."
        }
    }
}

// MARK: - Connection Types

public enum ConnectionMode {
    case direct(url: URL)
    case relay(serverUrl: URL, deviceId: String)
    case offline

    public var isOnline: Bool {
        switch self {
        case .direct, .relay:
            return true
        case .offline:
            return false
        }
    }
}

public struct ConnectionStatus {
    public let mode: ConnectionMode
    public let isConnected: Bool
    public let lastConnectedAt: Date?
    public let latencyMs: Double?

    public static let disconnected = ConnectionStatus(
        mode: .offline,
        isConnected: false,
        lastConnectedAt: nil,
        latencyMs: nil
    )
}

// MARK: - Cache Manager Protocol

public protocol CacheManagerProtocol {
    func get<T: Codable>(key: String) -> T?
    func set<T: Codable>(_ value: T, forKey key: String, ttl: TimeInterval)
    func remove(key: String)
    func invalidatePattern(_ pattern: String)
    func clear()
}

// MARK: - API Client Protocol

public protocol APIClientProtocol {
    func request<T: Codable>(
        endpoint: APIEndpoint,
        method: HTTPMethod,
        body: T?
    ) -> AnyPublisher<Data, Error>

    func requestStream<T: Codable>(
        endpoint: APIEndpoint,
        method: HTTPMethod,
        body: T?
    ) -> AnyPublisher<Data, Error>
}

// MARK: - Simple Cache Manager Implementation

public class CacheManager: CacheManagerProtocol {
    public static let shared = CacheManager()

    private let cache = NSCache<NSString, CacheItem>()
    private let queue = DispatchQueue(label: "cache.queue", attributes: .concurrent)

    private init() {
        cache.countLimit = 1000
        cache.totalCostLimit = 50 * 1024 * 1024 // 50MB
    }

    public func get<T: Codable>(key: String) -> T? {
        return queue.sync {
            guard let item = cache.object(forKey: key as NSString) else {
                return nil
            }

            if item.expiresAt < Date() {
                cache.removeObject(forKey: key as NSString)
                return nil
            }

            return item.value as? T
        }
    }

    public func set<T: Codable>(_ value: T, forKey key: String, ttl: TimeInterval) {
        queue.async(flags: .barrier) { [weak self] in
            let expiresAt = Date().addingTimeInterval(ttl)
            let item = CacheItem(value: value, expiresAt: expiresAt)
            self?.cache.setObject(item, forKey: key as NSString)
        }
    }

    public func remove(key: String) {
        queue.async(flags: .barrier) { [weak self] in
            self?.cache.removeObject(forKey: key as NSString)
        }
    }

    public func invalidatePattern(_ pattern: String) {
        queue.async(flags: .barrier) { [weak self] in
            // Simple pattern matching - in production would use more sophisticated approach
            // For now, just clear all cache entries
            self?.cache.removeAllObjects()
        }
    }

    public func clear() {
        queue.async(flags: .barrier) { [weak self] in
            self?.cache.removeAllObjects()
        }
    }
}

private class CacheItem {
    let value: Any
    let expiresAt: Date

    init(value: Any, expiresAt: Date) {
        self.value = value
        self.expiresAt = expiresAt
    }
}

// MARK: - Simple API Client Implementation

import Combine

public class APIClient: APIClientProtocol {
    public static let shared: APIClient = {
        guard let url = URL(string: Config.serverURL) else {
            fatalError("Invalid server URL configuration: \(Config.serverURL)")
        }
        return APIClient(baseURL: url)
    }()

    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(baseURL: URL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)

        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .secondsSince1970

        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .secondsSince1970
    }

    public var endpoint: URL {
        baseURL
    }

    public func request<T: Codable>(
        endpoint: APIEndpoint,
        method: HTTPMethod,
        body: T?
    ) -> AnyPublisher<Data, Error> {
        let url = baseURL.appendingPathComponent(endpoint.path)
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let body = body {
            do {
                request.httpBody = try encoder.encode(body)
            } catch {
                return Fail(error: error).eraseToAnyPublisher()
            }
        }

        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .mapError { (error: URLError) -> Error in
                return error as Error
            }
            .eraseToAnyPublisher()
    }

    public func requestStream<T: Codable>(
        endpoint: APIEndpoint,
        method: HTTPMethod,
        body: T?
    ) -> AnyPublisher<Data, Error> {
        // For streaming, would implement WebSocket or Server-Sent Events
        // For now, just use regular request
        return request(endpoint: endpoint, method: method, body: body)
    }
}

// MARK: - Extensions

extension DateFormatter {
    static let medium: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}
