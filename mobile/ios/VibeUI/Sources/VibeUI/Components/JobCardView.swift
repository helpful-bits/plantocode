import SwiftUI
import Core

public struct JobCardView: View {
    let job: BackgroundJob
    let onCancel: ((String) async -> Void)?
    let onDelete: ((String) async -> Void)?
    let onSelect: () -> Void
    let onApplyFiles: ((BackgroundJob) async -> Void)?
    let onContinueWorkflow: ((BackgroundJob) async -> Void)?
    let currentSessionId: String?
    let hasContinuationJob: Bool
    let isWorkflowActive: Bool

    @State private var isCancelling = false
    @State private var isDeleting = false
    @State private var progress: Double = 0
    @State private var progressTimer: Timer?

    public init(
        job: BackgroundJob,
        onCancel: ((String) async -> Void)? = nil,
        onDelete: ((String) async -> Void)? = nil,
        onSelect: @escaping () -> Void = {},
        onApplyFiles: ((BackgroundJob) async -> Void)? = nil,
        onContinueWorkflow: ((BackgroundJob) async -> Void)? = nil,
        currentSessionId: String? = nil,
        hasContinuationJob: Bool = false,
        isWorkflowActive: Bool = false
    ) {
        self.job = job
        self.onCancel = onCancel
        self.onDelete = onDelete
        self.onSelect = onSelect
        self.onApplyFiles = onApplyFiles
        self.onContinueWorkflow = onContinueWorkflow
        self.currentSessionId = currentSessionId
        self.hasContinuationJob = hasContinuationJob
        self.isWorkflowActive = isWorkflowActive
    }

    // MARK: - Computed Properties

    private var isCurrentSession: Bool {
        currentSessionId != nil && job.sessionId == currentSessionId
    }

    private var isJobRunning: Bool {
        ["running", "processingStream", "generatingStream", "preparing", "preparing_input"].contains(job.status)
    }

    private var canCancel: Bool {
        job.jobStatus.isActive
    }

    private var statusColor: Color {
        switch job.jobStatus {
        case .completed, .completedByTag:
            return .green
        case .failed:
            return .red
        case .canceled:
            return .orange
        case .running, .generatingStream, .processingStream:
            return .blue
        case .queued, .created, .preparing, .preparingInput:
            return .purple
        default:
            return .gray
        }
    }

    private var statusIcon: String {
        switch job.jobStatus {
        case .completed, .completedByTag:
            return "checkmark.circle.fill"
        case .failed:
            return "exclamationmark.circle.fill"
        case .canceled:
            return "xmark.circle.fill"
        case .running, .generatingStream, .processingStream:
            return "arrow.clockwise"
        case .queued, .created, .preparing, .preparingInput:
            return "clock.fill"
        default:
            return "circle.fill"
        }
    }

    private var statusDisplay: String {
        switch job.status {
        case "running", "processingStream":
            return "Processing"
        case "preparing", "created", "queued", "preparing_input", "generating_stream":
            return "Preparing"
        case "completed", "completed_by_tag":
            return "Completed"
        case "failed":
            return "Failed"
        case "canceled":
            return "Canceled"
        default:
            return job.status.capitalized
        }
    }

    private var jobDisplayName: String {
        // Extract from metadata if available
        if let metadata = job.metadata,
           let data = metadata.data(using: .utf8),
           let metaDict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let taskData = metaDict["taskData"] as? [String: Any] {

            // For implementation plans
            if job.taskType == "implementation_plan",
               let sessionName = taskData["sessionName"] as? String {
                return sessionName
            }

            // For video analysis
            if job.taskType == "video_analysis",
               let videoPath = taskData["videoPath"] as? String {
                let fileName = URL(fileURLWithPath: videoPath).lastPathComponent
                return "Video: \(fileName)"
            }
        }

        // Format task type as fallback
        return formatTaskType(job.taskType)
    }

    private func formatTaskType(_ taskType: String) -> String {
        taskType.replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    private func formatTokenCount(_ count: Int32?) -> String {
        guard let count = count, count > 0 else { return "0" }
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }

    private func formatCurrency(_ amount: Double) -> String {
        // Match desktop's formatUsdCurrencyPrecise logic
        if amount < 0.01 {
            // For very small amounts, use 4-6 decimal places
            return String(format: "$%.4f", amount)
        } else {
            // For larger amounts, use 2-4 decimal places
            // Use 4 decimal places for amounts < $0.10, otherwise 2
            if amount < 0.10 {
                return String(format: "$%.4f", amount)
            } else {
                return String(format: "$%.2f", amount)
            }
        }
    }

    // MARK: - Body

    public var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(alignment: .center, spacing: 8) {
                // Status Icon
                Image(systemName: statusIcon)
                    .foregroundColor(statusColor)
                    .font(.system(size: 14))
                    .frame(width: 16, height: 16)
                    .if(isJobRunning) { view in
                        view.rotationEffect(.degrees(progress * 360))
                            .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: progress)
                    }

                // Job Name and Type
                VStack(alignment: .leading, spacing: 2) {
                    Text(jobDisplayName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Text(formatTaskType(job.taskType))
                            .font(.system(size: 10))
                            .foregroundColor(Color(.label))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(.tertiarySystemFill))
                            .cornerRadius(4)

                        Text(job.formattedTimeAgo)
                            .font(.system(size: 10))
                            .foregroundColor(Color(.secondaryLabel))
                    }
                }

                Spacer()

                // Action Buttons
                HStack(spacing: 4) {
                    if canCancel, let onCancel = onCancel {
                        Button {
                            Task {
                                isCancelling = true
                                await onCancel(job.id)
                                isCancelling = false
                            }
                        } label: {
                            if isCancelling {
                                ProgressView()
                                    .scaleEffect(0.6)
                            } else {
                                Image(systemName: "xmark")
                                    .font(.system(size: 12))
                            }
                        }
                        .frame(width: 24, height: 24)
                        .foregroundColor(Color(.secondaryLabel))
                        .disabled(isCancelling)
                    } else if let onDelete = onDelete {
                        Button {
                            Task {
                                isDeleting = true
                                await onDelete(job.id)
                                isDeleting = false
                            }
                        } label: {
                            if isDeleting {
                                ProgressView()
                                    .scaleEffect(0.6)
                            } else {
                                Image(systemName: "trash")
                                    .font(.system(size: 12))
                            }
                        }
                        .frame(width: 24, height: 24)
                        .foregroundColor(Color(.secondaryLabel))
                        .disabled(isDeleting)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 8)

            // Progress Bar (for active jobs)
            if isJobRunning {
                VStack(spacing: 4) {
                    if let progressPct = job.progressPercentage, progressPct > 0 {
                        ProgressView(value: Double(progressPct), total: 100)
                            .tint(statusColor)
                            .frame(height: 3)
                            .padding(.horizontal, 12)

                        HStack {
                            if let subStatus = job.subStatusMessage {
                                Text(subStatus)
                                    .font(.system(size: 9))
                                    .foregroundColor(Color(.secondaryLabel))
                                    .lineLimit(1)
                            }
                            Spacer()
                            Text("\(progressPct)%")
                                .font(.system(size: 9))
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        .padding(.horizontal, 12)
                    } else {
                        ProgressView()
                            .progressViewStyle(LinearProgressViewStyle())
                            .tint(statusColor)
                            .frame(height: 3)
                            .padding(.horizontal, 12)

                        if let subStatus = job.subStatusMessage {
                            Text(subStatus)
                                .font(.system(size: 9))
                                .foregroundColor(Color(.secondaryLabel))
                                .lineLimit(1)
                                .padding(.horizontal, 12)
                        }
                    }
                }
                .padding(.bottom, 6)
            }

            // Metrics Row (tokens, model, duration)
            if job.tokensSent ?? 0 > 0 || job.tokensReceived ?? 0 > 0 || job.modelUsed != nil {
                HStack(spacing: 8) {
                    // Token counts
                    if job.tokensSent ?? 0 > 0 || job.tokensReceived ?? 0 > 0 {
                        HStack(spacing: 2) {
                            Text("Tokens:")
                                .font(.system(size: 9))
                                .foregroundColor(Color(.secondaryLabel))
                            Text(formatTokenCount(job.tokensSent))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(Color(.label))
                            Image(systemName: "arrow.right")
                                .font(.system(size: 7))
                                .foregroundColor(Color(.secondaryLabel))
                            Text(formatTokenCount(job.tokensReceived))
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundColor(Color(.label))

                            // Cache tokens if present
                            if let cacheRead = job.cacheReadTokens, cacheRead > 0,
                               let cacheWrite = job.cacheWriteTokens, cacheWrite > 0 {
                                Text("(cache: R\(formatTokenCount(cacheRead))/W\(formatTokenCount(cacheWrite)))")
                                    .font(.system(size: 8))
                                    .foregroundColor(.teal)
                            }
                        }
                    }

                    Spacer()

                    // Duration
                    if let duration = job.formattedDuration {
                        Text(duration)
                            .font(.system(size: 9))
                            .foregroundColor(Color(.secondaryLabel))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 6)

                // Model
                if let model = job.modelUsed {
                    Text(model)
                        .font(.system(size: 9))
                        .foregroundColor(Color(.secondaryLabel))
                        .lineLimit(1)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                }
            }

            // Bottom Section - Results or Error
            VStack(alignment: .leading, spacing: 8) {
                if job.jobStatus == .completed || job.jobStatus == .completedByTag {
                    // Completion info
                    HStack {
                        Text(getCompletionSummary())
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.primary)

                        Spacer()

                        // Action buttons
                        HStack(spacing: 8) {
                            // Apply files button for relevant job types
                            if shouldShowApplyButton(), let onApplyFiles = onApplyFiles {
                                Button {
                                    Task {
                                        await onApplyFiles(job)
                                    }
                                } label: {
                                    Text(applyButtonLabel())
                                }
                                .buttonStyle(LinkButtonStyle())
                                .controlSize(.small)
                            }

                            // Continue workflow button
                            if job.taskType == "web_search_prompts_generation",
                               !hasContinuationJob,
                               !isWorkflowActive,
                               let onContinue = onContinueWorkflow {
                                Button {
                                    Task {
                                        await onContinue(job)
                                    }
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "play.circle")
                                        Text("Continue Research")
                                    }
                                }
                                .buttonStyle(LinkButtonStyle())
                                .controlSize(.small)
                            }

                            // Cost
                            if let cost = job.actualCost, cost > 0 {
                                Text(formatCurrency(cost))
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(.primary)
                            }
                        }
                    }
                } else if job.jobStatus == .failed || job.jobStatus == .canceled {
                    // Error message
                    if let error = job.errorMessage {
                        Text(getErrorPreview(error))
                            .font(.system(size: 10))
                            .foregroundColor(job.jobStatus == .failed ? .red : Color(.secondaryLabel))
                            .lineLimit(2)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 10)
            .padding(.top, 4)
            .background(Color(.tertiarySystemFill))
        }
        .background(isCurrentSession ? Color.blue.opacity(0.15) : Color(.secondarySystemBackground))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(
                    isCurrentSession ? Color.blue.opacity(0.3) : Color(.separator),
                    lineWidth: 1
                )
        )
        .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 1)
        .onTapGesture {
            onSelect()
        }
        .onAppear {
            if isJobRunning {
                startProgressAnimation()
            }
        }
        .onDisappear {
            progressTimer?.invalidate()
        }
    }

    // MARK: - Helper Methods

    private func startProgressAnimation() {
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            withAnimation(.linear(duration: 0.05)) {
                progress += 0.05
                if progress >= 1 {
                    progress = 0
                }
            }
        }
    }

    private func getCompletionSummary() -> String {
        // Parse response for file finding tasks
        if ["extended_path_finder", "file_relevance_assessment", "regex_file_filter", "path_correction"].contains(job.taskType) {
            if let response = job.response,
               let data = response.data(using: .utf8),
               let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {

                if let summary = responseObj["summary"] as? String {
                    return summary
                }

                if let files = responseObj["files"] as? [[String: Any]] {
                    let count = files.count
                    return count > 0 ? "\(count) file\(count != 1 ? "s" : "") found" : "No files found"
                }
            }
            return "No files found"
        }

        // Implementation plans
        if job.taskType == "implementation_plan" || job.taskType == "implementation_plan_merge" {
            return "Plan generated"
        }

        // Video analysis
        if job.taskType == "video_analysis" {
            return "Video analysis completed"
        }

        // Text improvement
        if job.taskType == "text_improvement" {
            return "Text improved"
        }

        // Web search
        if job.taskType == "web_search_prompts_generation" {
            if let response = job.response,
               let data = response.data(using: .utf8),
               let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let summary = responseObj["summary"] as? String {
                    return summary
                } else if let prompts = responseObj["prompts"] as? [String] {
                    let count = prompts.count
                    return "\(count) search prompt\(count != 1 ? "s" : "") generated"
                }
            }
            return "No prompts generated"
        }

        if job.taskType == "web_search_execution" {
            if let response = job.response,
               let data = response.data(using: .utf8),
               let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let summary = responseObj["summary"] as? String {
                    return summary
                } else if let results = responseObj["searchResults"] as? [[String: Any]] {
                    let count = results.count
                    return "\(count) research finding\(count != 1 ? "s" : "") ready"
                }
            }
            return "No research findings generated"
        }

        // Task refinement
        if job.taskType == "task_refinement" {
            if let response = job.response,
               let data = response.data(using: .utf8),
               let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let summary = responseObj["summary"] as? String {
                return summary
            }
            return "Task refined"
        }

        return "Task completed"
    }

    private func shouldShowApplyButton() -> Bool {
        // File finding tasks - only if files were found
        if ["extended_path_finder", "file_relevance_assessment", "path_correction", "regex_file_filter"].contains(job.taskType) {
            return job.status == "completed" && hasFilesInResponse()
        }

        // Video analysis with results
        if job.taskType == "video_analysis" {
            return job.status == "completed" && job.response != nil
        }

        // Web search with results
        if job.taskType == "web_search_execution" {
            if let response = job.response,
               let data = response.data(using: .utf8),
               let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let results = responseObj["searchResults"] as? [[String: Any]] {
                return !results.isEmpty
            }
        }

        return false
    }

    private func hasFilesInResponse() -> Bool {
        guard let response = job.response,
              let data = response.data(using: .utf8),
              let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let files = responseObj["files"] as? [[String: Any]] else {
            return false
        }
        return !files.isEmpty
    }

    private func applyButtonLabel() -> String {
        switch job.taskType {
        case "web_search_execution":
            return "Use Research"
        case "video_analysis":
            return "Use Findings"
        default:
            return "Use Files"
        }
    }

    private func getErrorPreview(_ error: String) -> String {
        let maxLength = 150
        return error.count > maxLength ? String(error.prefix(maxLength)) + "..." : error
    }
}

// MARK: - View Modifier Extension

extension View {
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// MARK: - BackgroundJob Extensions

extension BackgroundJob {
    var formattedTimeAgo: String {
        let timestamp = startTime ?? updatedAt ?? createdAt
        guard timestamp > 0 else { return "Unknown time" }

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

    var formattedDuration: String? {
        let duration: Int64
        if let endTime = endTime, let startTime = startTime {
            duration = endTime - startTime
        } else if let durationMs = durationMs {
            duration = Int64(durationMs)
        } else if jobStatus.isActive, let startTime = startTime {
            duration = Int64(Date().timeIntervalSince1970 * 1000) - startTime
        } else {
            return nil
        }

        if duration < 1000 {
            return "\(duration)ms"
        } else if duration < 60000 {
            return String(format: "%.1fs", Double(duration) / 1000)
        } else {
            let mins = duration / 60000
            let secs = (duration % 60000) / 1000
            return "\(mins)m \(secs)s"
        }
    }

    var totalTokens: Int {
        Int((tokensSent ?? 0) + (tokensReceived ?? 0))
    }
}

// For backward compatibility - Simple preview version
extension JobCardView {
    public init(job: BackgroundJob) {
        self.init(
            job: job,
            onCancel: nil,
            onDelete: nil,
            onSelect: {},
            onApplyFiles: nil,
            onContinueWorkflow: nil,
            currentSessionId: nil,
            hasContinuationJob: false,
            isWorkflowActive: false
        )
    }
}

#Preview {
    VStack(spacing: 16) {
        // Active job
        JobCardView(job: BackgroundJob(
            id: "1",
            sessionId: "session-1",
            taskType: "file_search",
            status: "running",
            prompt: "Find all TypeScript files",
            response: nil,
            errorMessage: nil,
            tokensUsed: nil,
            actualCost: nil,
            createdAt: Int64(Date().timeIntervalSince1970),
            updatedAt: nil,
            projectHash: nil,
            tokensSent: 1500,
            tokensReceived: 800,
            modelUsed: "gpt-4",
            durationMs: 5000,
            metadata: nil,
            systemPromptTemplate: nil,
            startTime: nil,
            endTime: nil,
            cacheWriteTokens: nil,
            cacheReadTokens: nil,
            isFinalized: false,
            progressPercentage: 65,
            subStatusMessage: "Scanning project files..."
        ))

        // Completed job
        JobCardView(job: BackgroundJob(
            id: "2",
            sessionId: "session-1",
            taskType: "implementation_plan",
            status: "completed",
            prompt: "Create a plan",
            response: "Plan created",
            errorMessage: nil,
            tokensUsed: 5000,
            actualCost: 0.025,
            createdAt: Int64(Date().timeIntervalSince1970 - 3600),
            updatedAt: Int64(Date().timeIntervalSince1970),
            projectHash: nil,
            tokensSent: 3000,
            tokensReceived: 2000,
            modelUsed: "claude-3-5-sonnet",
            durationMs: 12500,
            metadata: nil,
            systemPromptTemplate: nil,
            startTime: nil,
            endTime: nil,
            cacheWriteTokens: nil,
            cacheReadTokens: nil,
            isFinalized: true,
            progressPercentage: nil,
            subStatusMessage: nil
        ))
    }
    .padding()
}