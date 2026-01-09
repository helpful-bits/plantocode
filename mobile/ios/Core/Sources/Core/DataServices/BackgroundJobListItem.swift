import Foundation

public struct BackgroundJobListItem: Codable, Identifiable {
    public let id: String
    public let sessionId: String?
    public let taskType: String
    public let status: String
    public let createdAt: Int64
    public let updatedAt: Int64?
    public let startTime: Int64?
    public let endTime: Int64?
    public let isFinalized: Bool
    public let tokensSent: Int64?
    public let tokensReceived: Int64?
    public let cacheWriteTokens: Int64?
    public let cacheReadTokens: Int64?
    public let modelUsed: String?
    public let actualCost: Double?
    public let durationMs: Int64?
    public let errorMessage: String?
    public let planTitle: String?
    public let markdownConversionStatus: String?

    public var jobStatus: JobStatus {
        JobStatus(rawValue: status) ?? .unknown
    }

    /// UI-facing timestamp for ordering/time-ago display.
    /// Prefers startTime, else updatedAt, else createdAt (all in milliseconds).
    public var displayTimestampMs: Int64 {
        startTime ?? updatedAt ?? createdAt
    }

    public init(
        id: String,
        sessionId: String?,
        taskType: String,
        status: String,
        createdAt: Int64,
        updatedAt: Int64?,
        startTime: Int64?,
        endTime: Int64?,
        isFinalized: Bool,
        tokensSent: Int64?,
        tokensReceived: Int64?,
        cacheWriteTokens: Int64?,
        cacheReadTokens: Int64?,
        modelUsed: String?,
        actualCost: Double?,
        durationMs: Int64?,
        errorMessage: String?,
        planTitle: String? = nil,
        markdownConversionStatus: String? = nil
    ) {
        self.id = id
        self.sessionId = sessionId
        self.taskType = taskType
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.startTime = startTime
        self.endTime = endTime
        self.isFinalized = isFinalized
        self.tokensSent = tokensSent
        self.tokensReceived = tokensReceived
        self.cacheWriteTokens = cacheWriteTokens
        self.cacheReadTokens = cacheReadTokens
        self.modelUsed = modelUsed
        self.actualCost = actualCost
        self.durationMs = durationMs
        self.errorMessage = errorMessage
        self.planTitle = planTitle
        self.markdownConversionStatus = markdownConversionStatus
    }
}
