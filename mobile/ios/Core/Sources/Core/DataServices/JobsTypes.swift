import Foundation

// MARK: - Job List Types

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
        sortOrder: SortOrder? = .desc
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
    public let jobs: [BackgroundJobListItem]
    public let totalCount: UInt32
    public let page: UInt32
    public let pageSize: UInt32
    public let hasMore: Bool

    public init(
        jobs: [BackgroundJobListItem],
        totalCount: UInt32,
        page: UInt32 = 0,
        pageSize: UInt32 = 50,
        hasMore: Bool
    ) {
        self.jobs = jobs
        self.totalCount = totalCount
        self.page = page
        self.pageSize = pageSize
        self.hasMore = hasMore
    }
}

public struct JobSummaryListResponse: Codable {
    public let jobs: [BackgroundJobListItem]
    public let totalCount: UInt32
    public let page: UInt32
    public let pageSize: UInt32
    public let hasMore: Bool

    public init(
        jobs: [BackgroundJobListItem],
        totalCount: UInt32,
        page: UInt32 = 0,
        pageSize: UInt32 = 50,
        hasMore: Bool
    ) {
        self.jobs = jobs
        self.totalCount = totalCount
        self.page = page
        self.pageSize = pageSize
        self.hasMore = hasMore
    }
}

// MARK: - Job Details Types

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

// MARK: - Job Metrics Types

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

// MARK: - Job Cancellation Types

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

// MARK: - Job Progress Types

public struct JobProgressUpdate: Codable {
    public let jobId: String
    public let status: JobStatus
    public let progressPercentage: Float?
    public let currentStep: String?
    public let estimatedCompletionTime: Int64?
    public let metrics: JobMetrics?
    public let timestamp: Int64
}

// MARK: - Sorting Types

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

// MARK: - Sync Status

public struct JobSyncStatus {
    public let activeJobs: Int
    public let lastUpdate: Date
    public let isConnected: Bool

    public init(activeJobs: Int, lastUpdate: Date, isConnected: Bool) {
        self.activeJobs = activeJobs
        self.lastUpdate = lastUpdate
        self.isConnected = isConnected
    }
}

// MARK: - JSON Decoder Extension

extension JSONDecoder {
    static let apiDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        // Backend uses camelCase serialization - use default keys
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()
}
