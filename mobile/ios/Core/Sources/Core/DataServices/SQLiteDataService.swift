import Foundation
import Combine

/// Service for executing read-only SQLite queries against desktop database
public class SQLiteDataService: ObservableObject {

    // MARK: - Published Properties
    @Published public var templates: [QueryTemplate] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    @Published public var executionStats: [QueryExecutionStats] = []

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
        loadTemplates()
    }

    // MARK: - Public Methods

    /// Execute a parameterized query template
    public func executeQuery(request: SQLiteQueryRequest) -> AnyPublisher<SQLiteQueryResponse, DataServiceError> {
        isLoading = true
        error = nil

        // Validate query first
        let validateRequest = ValidateQueryRequest(
            templateName: request.templateName,
            parameters: request.parameters
        )

        return validateQuery(request: validateRequest)
            .flatMap { [weak self] validation -> AnyPublisher<SQLiteQueryResponse, DataServiceError> in
                guard let self = self else {
                    return Fail(error: DataServiceError.invalidState("Service deallocated"))
                        .eraseToAnyPublisher()
                }

                if !validation.isValid {
                    let errorMessage = validation.errors.map(\.message).joined(separator: "; ")
                    return Fail(error: DataServiceError.invalidRequest("Query validation failed: \(errorMessage)"))
                        .eraseToAnyPublisher()
                }

                // Check cache for identical queries
                let cacheKey = "query_\(request.cacheKey)"
                if let cached: SQLiteQueryResponse = self.cacheManager.get(key: cacheKey) {
                    self.isLoading = false
                    return Just(cached)
                        .setFailureType(to: DataServiceError.self)
                        .eraseToAnyPublisher()
                }

                return self.desktopAPIClient.invoke(
                    command: "sqlite_query_api",
                    payload: request
                )
                .map { (response: SQLiteQueryResponse) in
                    // Cache results for 5 minutes
                    self.cacheManager.set(response, forKey: cacheKey, ttl: 300)
                    return response
                }
                .mapError { (error: DesktopAPIError) -> DataServiceError in
                    return DataServiceError.networkError(error)
                }
                .eraseToAnyPublisher()
            }
            .handleEvents(
                receiveOutput: { [weak self] (response: SQLiteQueryResponse) in self?.isLoading = false },
                receiveCompletion: { [weak self] (completion: Combine.Subscribers.Completion<DataServiceError>) in
                    self?.isLoading = false
                    if case .failure(let error) = completion {
                        self?.error = error
                    }
                }
            )
            .eraseToAnyPublisher()
    }

    /// Validate a query before execution
    public func validateQuery(request: ValidateQueryRequest) -> AnyPublisher<ValidateQueryResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .validateSQLiteQuery,
            method: .POST,
            body: request
        )
        .decode(type: ValidateQueryResponse.self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get available query templates
    public func getTemplates(request: GetTemplatesRequest = GetTemplatesRequest()) -> AnyPublisher<GetTemplatesResponse, DataServiceError> {
        let cacheKey = "templates_\(request.cacheKey)"

        if let cached: GetTemplatesResponse = cacheManager.get(key: cacheKey) {
            templates = cached.templates
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        return apiClient.request(
            endpoint: .getQueryTemplates,
            method: .POST,
            body: request
        )
        .decode(type: GetTemplatesResponse.self, decoder: JSONDecoder.apiDecoder)
        .map { [weak self] (response: GetTemplatesResponse) in
            self?.templates = response.templates
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 1800) // 30 min cache
            return response
        }
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get database schema information
    public func getDatabaseSchema(request: DatabaseSchemaRequest = DatabaseSchemaRequest()) -> AnyPublisher<DatabaseSchemaResponse, DataServiceError> {
        let cacheKey = "schema_\(request.cacheKey)"

        if let cached: DatabaseSchemaResponse = cacheManager.get(key: cacheKey) {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        return apiClient.request(
            endpoint: .getDatabaseSchema,
            method: .POST,
            body: request
        )
        .decode(type: DatabaseSchemaResponse.self, decoder: JSONDecoder.apiDecoder)
        .map { [weak self] (response: DatabaseSchemaResponse) in
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 3600) // 1 hour cache
            return response
        }
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get query execution statistics
    public func getQueryStats(request: GetStatsRequest = GetStatsRequest()) -> AnyPublisher<GetStatsResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .getQueryStats,
            method: .POST,
            body: request
        )
        .decode(type: GetStatsResponse.self, decoder: JSONDecoder.apiDecoder)
        .handleEvents(receiveOutput: { [weak self] (response: GetStatsResponse) in
            self?.executionStats = response.stats
        })
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    // MARK: - Convenience Methods

    /// Execute a simple query by template name with basic parameters
    public func executeSimpleQuery(_ templateName: String, parameters: [String: Any] = [:]) -> AnyPublisher<[[String: Any]], DataServiceError> {
        let sqliteParameters = parameters.mapValues { value -> SQLiteValue in
            switch value {
            case let intValue as Int:
                return .integer(Int64(intValue))
            case let int64Value as Int64:
                return .integer(int64Value)
            case let doubleValue as Double:
                return .real(doubleValue)
            case let stringValue as String:
                return .text(stringValue)
            case let boolValue as Bool:
                return .boolean(boolValue)
            default:
                return .text(String(describing: value))
            }
        }

        let request = SQLiteQueryRequest(
            templateName: templateName,
            parameters: sqliteParameters
        )

        return executeQuery(request: request)
            .map { response in
                response.rows.map { row in
                    var dict: [String: Any] = [:]
                    for (index, column) in response.columns.enumerated() {
                        if index < row.values.count {
                            dict[column.name] = row.values[index].toAny()
                        }
                    }
                    return dict
                }
            }
            .eraseToAnyPublisher()
    }

    /// Get jobs by status
    public func getJobsByStatus(_ status: JobStatus, limit: Int = 50) -> AnyPublisher<[BackgroundJob], DataServiceError> {
        let parameters: [String: SQLiteValue] = [
            "status": .text(status.rawValue),
            "limit": .integer(Int64(limit)),
            "offset": .integer(0)
        ]

        let request = SQLiteQueryRequest(
            templateName: "jobs_by_status",
            parameters: parameters
        )

        return executeQuery(request: request)
            .map { response in
                response.rows.compactMap { row in
                    // Convert SQLite row to BackgroundJob
                    // This would need proper mapping implementation
                    self.mapRowToBackgroundJob(row, columns: response.columns)
                }
            }
            .eraseToAnyPublisher()
    }

    /// Get jobs for a project
    public func getJobsForProject(_ projectHash: String, limit: Int = 50) -> AnyPublisher<[BackgroundJob], DataServiceError> {
        let parameters: [String: SQLiteValue] = [
            "project_hash": .text(projectHash),
            "limit": .integer(Int64(limit)),
            "offset": .integer(0)
        ]

        let request = SQLiteQueryRequest(
            templateName: "jobs_by_project",
            parameters: parameters
        )

        return executeQuery(request: request)
            .map { response in
                response.rows.compactMap { row in
                    self.mapRowToBackgroundJob(row, columns: response.columns)
                }
            }
            .eraseToAnyPublisher()
    }

    /// Get sessions for a project
    public func getSessionsForProject(_ projectHash: String, limit: Int = 100) -> AnyPublisher<[SessionInfo], DataServiceError> {
        let parameters: [String: SQLiteValue] = [
            "project_hash": .text(projectHash),
            "limit": .integer(Int64(limit))
        ]

        let request = SQLiteQueryRequest(
            templateName: "sessions_by_project",
            parameters: parameters
        )

        return executeQuery(request: request)
            .map { response in
                response.rows.compactMap { row in
                    self.mapRowToSessionInfo(row, columns: response.columns)
                }
            }
            .eraseToAnyPublisher()
    }

    /// Get job statistics by date range
    public func getJobStatsByDate(from startDate: Date, to endDate: Date) -> AnyPublisher<[JobDayStats], DataServiceError> {
        let parameters: [String: SQLiteValue] = [
            "start_date": .integer(Int64(startDate.timeIntervalSince1970)),
            "end_date": .integer(Int64(endDate.timeIntervalSince1970))
        ]

        let request = SQLiteQueryRequest(
            templateName: "job_stats_by_date",
            parameters: parameters
        )

        return executeQuery(request: request)
            .map { response in
                response.rows.compactMap { row in
                    self.mapRowToJobDayStats(row, columns: response.columns)
                }
            }
            .eraseToAnyPublisher()
    }

    /// Search settings by key pattern
    public func searchSettings(_ pattern: String) -> AnyPublisher<[SettingInfo], DataServiceError> {
        let parameters: [String: SQLiteValue] = [
            "pattern": .text("%\(pattern)%")
        ]

        let request = SQLiteQueryRequest(
            templateName: "settings_by_key_pattern",
            parameters: parameters
        )

        return executeQuery(request: request)
            .map { response in
                response.rows.compactMap { row in
                    self.mapRowToSettingInfo(row, columns: response.columns)
                }
            }
            .eraseToAnyPublisher()
    }

    // MARK: - Private Methods

    private func loadTemplates() {
        getTemplates()
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }

    private func mapRowToBackgroundJob(_ row: SQLiteRow, columns: [ColumnInfo]) -> BackgroundJob? {
        // Implementation would map SQLite row to BackgroundJob
        // This is a simplified example
        guard let idIndex = columns.firstIndex(where: { $0.name == "id" }),
              case .text(let id) = row.values[safe: idIndex] else {
            return nil
        }

        // Map other fields...
        return BackgroundJob(
            id: id,
            sessionId: "", // Would extract from row
            taskType: "",
            status: "",
            prompt: "",
            response: nil,
            errorMessage: nil,
            tokensUsed: nil,
            actualCost: nil,
            createdAt: 0,
            updatedAt: nil
        )
    }

    private func mapRowToSessionInfo(_ row: SQLiteRow, columns: [ColumnInfo]) -> SessionInfo? {
        guard let idIndex = columns.firstIndex(where: { $0.name == "id" }),
              case .text(let id) = row.values[safe: idIndex] else {
            return nil
        }

        return SessionInfo(
            id: id,
            name: "", // Would extract from row
            projectDirectory: "",
            createdAt: 0,
            updatedAt: 0
        )
    }

    private func mapRowToJobDayStats(_ row: SQLiteRow, columns: [ColumnInfo]) -> JobDayStats? {
        guard let dateIndex = columns.firstIndex(where: { $0.name == "date" }),
              case .text(let dateString) = row.values[safe: dateIndex] else {
            return nil
        }

        return JobDayStats(
            date: dateString,
            totalJobs: 0, // Would extract from row
            completedJobs: 0,
            failedJobs: 0,
            avgDurationMs: 0,
            totalCost: 0.0
        )
    }

    private func mapRowToSettingInfo(_ row: SQLiteRow, columns: [ColumnInfo]) -> SettingInfo? {
        guard let keyIndex = columns.firstIndex(where: { $0.name == "key" }),
              case .text(let key) = row.values[safe: keyIndex] else {
            return nil
        }

        return SettingInfo(
            key: key,
            value: "", // Would extract from row
            type: ""
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

public struct SQLiteQueryRequest: Codable {
    public let templateName: String
    public let parameters: [String: SQLiteValue]
    public let page: UInt32?
    public let pageSize: UInt32?
    public let includeMetadata: Bool?
    public let timeoutSeconds: UInt32?

    public init(
        templateName: String,
        parameters: [String: SQLiteValue] = [:],
        page: UInt32? = 0,
        pageSize: UInt32? = 100,
        includeMetadata: Bool? = false,
        timeoutSeconds: UInt32? = 30
    ) {
        self.templateName = templateName
        self.parameters = parameters
        self.page = page
        self.pageSize = pageSize
        self.includeMetadata = includeMetadata
        self.timeoutSeconds = timeoutSeconds
    }

    var cacheKey: String {
        let paramString = parameters.keys.sorted().map { key in
            "\(key)=\(parameters[key]?.description ?? "")"
        }.joined(separator: "&")
        return "\(templateName)_\(paramString)_\(page ?? 0)_\(pageSize ?? 100)".hash
    }
}

public enum SQLiteValue: Codable, CustomStringConvertible {
    case null
    case integer(Int64)
    case real(Double)
    case text(String)
    case blob(Data)
    case boolean(Bool)

    public var description: String {
        switch self {
        case .null: return "NULL"
        case .integer(let i): return String(i)
        case .real(let d): return String(d)
        case .text(let s): return s
        case .blob(let data): return "BLOB(\(data.count) bytes)"
        case .boolean(let b): return b ? "true" : "false"
        }
    }

    public func toAny() -> Any {
        switch self {
        case .null: return NSNull()
        case .integer(let i): return i
        case .real(let d): return d
        case .text(let s): return s
        case .blob(let data): return data
        case .boolean(let b): return b
        }
    }
}

public struct SQLiteQueryResponse: Codable {
    public let rows: [SQLiteRow]
    public let columns: [ColumnInfo]
    public let totalRows: UInt32?
    public let page: UInt32
    public let pageSize: UInt32
    public let hasMore: Bool
    public let executionTimeMs: UInt64
    public let queryMetadata: QueryMetadata?
}

public struct SQLiteRow: Codable {
    public let values: [SQLiteValue]
    public let rowNumber: UInt32
}

public struct ColumnInfo: Codable {
    public let name: String
    public let sqliteType: String
    public let nullable: Bool
    public let primaryKey: Bool
    public let autoIncrement: Bool
}

public struct QueryMetadata: Codable {
    public let templateUsed: String
    public let finalQuery: String
    public let parametersUsed: [String: SQLiteValue]
    public let tablesAccessed: [String]
    public let rowsExamined: UInt64?
    public let queryPlan: String?
    public let cacheHit: Bool
}

public struct ValidateQueryRequest: Codable {
    public let templateName: String
    public let parameters: [String: SQLiteValue]

    public init(templateName: String, parameters: [String: SQLiteValue]) {
        self.templateName = templateName
        self.parameters = parameters
    }
}

public struct ValidateQueryResponse: Codable {
    public let isValid: Bool
    public let errors: [SQLiteValidationError]
    public let warnings: [ValidationWarning]
    public let estimatedCost: QueryCost?
}

public struct SQLiteValidationError: Codable {
    public let errorType: ValidationErrorType
    public let message: String
    public let parameter: String?
}

public enum ValidationErrorType: String, Codable {
    case missingParameter
    case invalidParameterType
    case parameterOutOfRange
    case invalidParameterValue
    case templateNotFound
    case templateInactive
    case securityViolation
}

public struct ValidationWarning: Codable {
    public let warningType: ValidationWarningType
    public let message: String
    public let parameter: String?
}

public enum ValidationWarningType: String, Codable {
    case performanceImpact
    case largeResultSet
    case deprecatedParameter
    case suboptimalParameter
}

public struct QueryCost: Codable {
    public let estimatedRows: UInt64
    public let estimatedTimeMs: UInt64
    public let complexityScore: Float
    public let usesIndex: Bool
}

public struct GetTemplatesRequest: Codable {
    public let category: String?
    public let tags: [String]?
    public let search: String?
    public let includeInactive: Bool?

    public init(
        category: String? = nil,
        tags: [String]? = nil,
        search: String? = nil,
        includeInactive: Bool? = false
    ) {
        self.category = category
        self.tags = tags
        self.search = search
        self.includeInactive = includeInactive
    }

    var cacheKey: String {
        let components = [
            category ?? "nil",
            tags?.joined(separator: ",") ?? "nil",
            search ?? "nil",
            String(includeInactive ?? false)
        ]
        return components.joined(separator: "_").hash
    }
}

public struct GetTemplatesResponse: Codable {
    public let templates: [QueryTemplate]
    public let categories: [String]
    public let allTags: [String]
    public let totalCount: UInt32
}

public struct QueryTemplate: Codable, Identifiable {
    public let id: String
    public let name: String
    public let description: String
    public let query: String
    public let parameters: [ParameterDefinition]
    public let allowedTables: [String]
    public let maxResults: UInt32?
    public let timeoutSeconds: UInt32?
    public let category: String
    public let tags: [String]
    public let createdAt: Int64
    public let updatedAt: Int64
    public let isActive: Bool

    public var parameterCount: Int { parameters.count }
    public var requiredParameterCount: Int { parameters.filter(\.required).count }
}

public struct ParameterDefinition: Codable {
    public let name: String
    public let parameterType: ParameterType
    public let required: Bool
    public let defaultValue: SQLiteValue?
    public let description: String?
    public let validation: ParameterValidation?
}

public enum ParameterType: String, Codable {
    case integer
    case real
    case text
    case boolean
    case blob
    case date
    case dateTime
}

public struct ParameterValidation: Codable {
    public let minValue: SQLiteValue?
    public let maxValue: SQLiteValue?
    public let minLength: UInt32?
    public let maxLength: UInt32?
    public let pattern: String?
    public let allowedValues: [SQLiteValue]?
}

public struct DatabaseSchemaRequest: Codable {
    public let includeIndexes: Bool?
    public let includeTriggers: Bool?
    public let tablePattern: String?

    public init(
        includeIndexes: Bool? = false,
        includeTriggers: Bool? = false,
        tablePattern: String? = nil
    ) {
        self.includeIndexes = includeIndexes
        self.includeTriggers = includeTriggers
        self.tablePattern = tablePattern
    }

    var cacheKey: String {
        let components = [
            String(includeIndexes ?? false),
            String(includeTriggers ?? false),
            tablePattern ?? "nil"
        ]
        return components.joined(separator: "_")
    }
}

public struct DatabaseSchemaResponse: Codable {
    public let tables: [TableInfo]
    public let indexes: [IndexInfo]
    public let triggers: [TriggerInfo]
    public let databaseSizeBytes: UInt64
    public let schemaVersion: String?

    public var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: Int64(databaseSizeBytes), countStyle: .file)
    }
}

public struct TableInfo: Codable, Identifiable {
    public let id: String
    public let name: String
    public let columns: [ColumnInfo]
    public let rowCount: UInt64
    public let tableType: String
    public let createdAt: String?

    public var formattedRowCount: String {
        NumberFormatter.localizedString(from: NSNumber(value: rowCount), number: .decimal)
    }
}

public struct IndexInfo: Codable, Identifiable {
    public let id: String
    public let name: String
    public let tableName: String
    public let columns: [String]
    public let isUnique: Bool
    public let isPrimary: Bool
    public let createdAt: String?
}

public struct TriggerInfo: Codable, Identifiable {
    public let id: String
    public let name: String
    public let tableName: String
    public let triggerType: String
    public let event: String
    public let sql: String
}

public struct GetStatsRequest: Codable {
    public let templateNames: [String]?
    public let fromTimestamp: Int64?
    public let toTimestamp: Int64?
    public let includeErrors: Bool?

    public init(
        templateNames: [String]? = nil,
        fromTimestamp: Int64? = nil,
        toTimestamp: Int64? = nil,
        includeErrors: Bool? = true
    ) {
        self.templateNames = templateNames
        self.fromTimestamp = fromTimestamp
        self.toTimestamp = toTimestamp
        self.includeErrors = includeErrors
    }
}

public struct GetStatsResponse: Codable {
    public let stats: [QueryExecutionStats]
    public let summary: ExecutionSummary
}

public struct QueryExecutionStats: Codable, Identifiable {
    public let id: String
    public let templateName: String
    public let executionCount: UInt64
    public let totalExecutionTimeMs: UInt64
    public let averageExecutionTimeMs: Double
    public let minExecutionTimeMs: UInt64
    public let maxExecutionTimeMs: UInt64
    public let totalRowsReturned: UInt64
    public let averageRowsReturned: Double
    public let errorCount: UInt64
    public let lastExecutedAt: Int64

    public var successRate: Double {
        guard executionCount > 0 else { return 0 }
        return Double(executionCount - errorCount) / Double(executionCount)
    }
}

public struct ExecutionSummary: Codable {
    public let totalQueriesExecuted: UInt64
    public let totalExecutionTimeMs: UInt64
    public let averageExecutionTimeMs: Double
    public let totalRowsReturned: UInt64
    public let totalErrors: UInt64
    public let mostUsedTemplate: String?
    public let slowestTemplate: String?
}

// MARK: - Helper Types for Common Queries

public struct SessionInfo: Identifiable {
    public let id: String
    public let name: String
    public let projectDirectory: String
    public let createdAt: Int64
    public let updatedAt: Int64
}

public struct JobDayStats: Identifiable {
    public let id = UUID()
    public let date: String
    public let totalJobs: Int
    public let completedJobs: Int
    public let failedJobs: Int
    public let avgDurationMs: Double
    public let totalCost: Double

    public var successRate: Double {
        guard totalJobs > 0 else { return 0 }
        return Double(completedJobs) / Double(totalJobs)
    }
}

public struct SettingInfo: Identifiable {
    public let id = UUID()
    public let key: String
    public let value: String
    public let type: String
}

// MARK: - Extensions

extension String {
    var hash: String {
        return String(self.hashValue)
    }
}

extension Array {
    subscript(safe index: Index) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}
