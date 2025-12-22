import Foundation

/// Execution status information for a plan
public struct PlanExecutionStatus: Codable {
    public let isExecuting: Bool
    public let progressPercentage: Float?
    public let currentStep: String?
    public let stepsCompleted: UInt
    public let totalSteps: UInt
    public let startedAt: Int64?
    public let estimatedCompletion: Int64?

    public init(
        isExecuting: Bool,
        progressPercentage: Float? = nil,
        currentStep: String? = nil,
        stepsCompleted: UInt = 0,
        totalSteps: UInt = 0,
        startedAt: Int64? = nil,
        estimatedCompletion: Int64? = nil
    ) {
        self.isExecuting = isExecuting
        self.progressPercentage = progressPercentage
        self.currentStep = currentStep
        self.stepsCompleted = stepsCompleted
        self.totalSteps = totalSteps
        self.startedAt = startedAt
        self.estimatedCompletion = estimatedCompletion
    }
}

/// A summary of an implementation plan extracted from a BackgroundJob
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
    public let taskType: String
    public let executionStatus: PlanExecutionStatus?
    public let tokensSent: Int?
    public let tokensReceived: Int?
    public let modelUsed: String?
    public let markdownConversionStatus: String?  // "pending", "completed", or "failed"

    public var modelDisplayName: String? {
        modelUsed.map(PlanContentParser.displayModelName)
    }

    public var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(createdAt) / 1000.0)
        return DateFormatter.medium.string(from: date)
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

    public var size: String {
        guard let bytes = sizeBytes else { return "Unknown" }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    /// Relative time display (e.g., "5m ago", "2h ago")
    public var formattedTimeAgo: String {
        let timestamp = updatedAt ?? createdAt
        let date = Date(timeIntervalSince1970: Double(timestamp) / 1000)
        let interval = Date().timeIntervalSince(date)

        if interval < 60 {
            return "just now"
        } else if interval < 3600 {
            let mins = Int(interval / 60)
            return "\(mins)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }

    /// Format token count for display (e.g., "1.5K" or "150")
    public func formatTokenCount(_ count: Int?) -> String {
        guard let count = count, count > 0 else { return "0" }
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }

    /// Whether the plan is fully ready (job completed AND markdown converted)
    public var isFullyReady: Bool {
        let isJobCompleted = status.lowercased() == "completed" || status.lowercased() == "completed_by_tag"
        let isMarkdownReady = markdownConversionStatus == "completed"
        return isJobCompleted && isMarkdownReady
    }

    /// Status-based color
    /// Green checkmark only shown when both job is completed AND markdown is ready
    public var statusColor: String {
        switch status.lowercased() {
        case "completed", "completed_by_tag":
            // Only show green if markdown is also completed
            if markdownConversionStatus == "completed" {
                return "green"
            } else if markdownConversionStatus == "failed" {
                return "orange"  // Markdown conversion failed
            } else {
                return "blue"  // Still converting markdown
            }
        case "failed":
            return "red"
        case "canceled":
            return "orange"
        case "running", "processingstream", "generatingstream":
            return "blue"
        case "queued", "created", "preparing", "preparing_input":
            return "purple"
        default:
            return "gray"
        }
    }

    /// Status icon name
    /// Green checkmark only shown when both job is completed AND markdown is ready
    public var statusIcon: String {
        switch status.lowercased() {
        case "completed", "completed_by_tag":
            // Only show checkmark if markdown is also completed
            if markdownConversionStatus == "completed" {
                return "checkmark.circle.fill"
            } else if markdownConversionStatus == "failed" {
                return "exclamationmark.triangle.fill"  // Markdown conversion failed
            } else {
                return "arrow.clockwise"  // Still converting markdown
            }
        case "failed":
            return "exclamationmark.circle.fill"
        case "canceled":
            return "xmark.circle.fill"
        case "running", "processingstream", "generatingstream":
            return "arrow.clockwise"
        case "queued", "created", "preparing", "preparing_input":
            return "clock.fill"
        default:
            return "circle.fill"
        }
    }

    /// Whether the plan is currently executing
    public var isExecuting: Bool {
        executionStatus?.isExecuting ?? false
    }

    /// Initialize a PlanSummary from a BackgroundJob
    /// - Parameter job: The BackgroundJob to extract plan summary from
    public init(from job: BackgroundJob) {
        self.id = job.id
        self.jobId = job.id
        self.status = job.status
        self.createdAt = job.createdAt
        self.updatedAt = job.updatedAt
        self.sessionId = job.sessionId
        self.taskType = job.taskType

        // Parse metadata JSON string to extract filePath
        var metadataDict: [String: Any]? = nil
        if let metadataString = job.metadata,
           let metadataData = metadataString.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {
            metadataDict = parsed
        }

        // Extract title using PlanContentParser
        self.title = PlanContentParser.extractPlanTitle(metadata: job.metadata, response: job.response)
            ?? (job.taskType == "implementation_plan_merge" ? "Merged Plan" : "Implementation Plan")

        // Extract filePath from metadata
        self.filePath = metadataDict?["filePath"] as? String

        // Calculate sizeBytes: prefer metadata, fallback to response byte count
        if let sizeFromMetadata = metadataDict?["sizeBytes"] as? Int {
            self.sizeBytes = UInt(sizeFromMetadata)
        } else if let response = job.response {
            self.sizeBytes = UInt(response.utf8.count)
        } else {
            self.sizeBytes = 0
        }

        // Extract token information
        self.tokensSent = job.tokensSent.map(Int.init)
        self.tokensReceived = job.tokensReceived.map(Int.init)

        // Set model used
        self.modelUsed = job.modelUsed

        // Extract markdown conversion status from metadata
        self.markdownConversionStatus = metadataDict?["markdownConversionStatus"] as? String

        // Extract execution status from job progress fields
        if let progressPercentage = job.progressPercentage,
           let subStatus = job.subStatusMessage {
            let isExecuting = job.status.lowercased() == "running" || job.status.lowercased() == "processing"
            self.executionStatus = PlanExecutionStatus(
                isExecuting: isExecuting,
                progressPercentage: Float(progressPercentage),
                currentStep: subStatus
            )
        } else if let md = metadataDict,
                  let taskData = md["taskData"] as? [String: Any],
                  let progress = (taskData["streamProgress"] as? NSNumber)?.doubleValue {
            let streamingFlag = (taskData["isStreaming"] as? Bool) ?? false
            self.executionStatus = PlanExecutionStatus(
                isExecuting: streamingFlag || ["running","processingstream"].contains(job.status.lowercased()),
                progressPercentage: Float(progress)
            )
        } else {
            self.executionStatus = nil
        }
    }

    /// Full initializer for direct construction
    public init(
        id: String,
        jobId: String,
        title: String?,
        filePath: String?,
        createdAt: Int64,
        updatedAt: Int64?,
        sizeBytes: UInt?,
        status: String,
        sessionId: String,
        taskType: String,
        executionStatus: PlanExecutionStatus?,
        tokensSent: Int?,
        tokensReceived: Int?,
        modelUsed: String?,
        markdownConversionStatus: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.title = title
        self.filePath = filePath
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.sizeBytes = sizeBytes
        self.status = status
        self.sessionId = sessionId
        self.taskType = taskType
        self.executionStatus = executionStatus
        self.tokensSent = tokensSent
        self.tokensReceived = tokensReceived
        self.modelUsed = modelUsed
        self.markdownConversionStatus = markdownConversionStatus
    }
}
