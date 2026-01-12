import SwiftUI
import Core
import Combine

public struct JobDetailsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer

    let jobId: String
    @State private var job: BackgroundJob?
    @State private var isLoading = true
    @State private var error: String?
    @State private var selectedTab = 0
    @State private var isCancelling = false
    @State private var isDeleting = false
    @State private var cancellables = Set<AnyCancellable>()

    private var jobsService: JobsDataService {
        container.jobsService
    }

    public init(jobId: String) {
        self.jobId = jobId
    }

    public var body: some View {
        NavigationStack {
            if isLoading {
                ProgressView("Loading job details...")
                    .padding(.top, 100)
                    .navigationTitle("Job Details")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Close") {
                                dismiss()
                            }
                            .buttonStyle(ToolbarButtonStyle())
                        }
                    }
            } else if let error = error {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 48))
                        .foregroundColor(Color.destructive)
                    Text("Error loading job")
                        .font(.headline)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(Color.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                .padding()
                .navigationTitle("Job Details")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Close") {
                            dismiss()
                        }
                        .buttonStyle(ToolbarButtonStyle())
                    }
                }
            } else if let job = job {
                ScrollView {
                    VStack(spacing: 20) {
                        // Status Header
                        JobStatusHeader(job: job)

                        // Tab Selection
                        Picker("Details", selection: $selectedTab) {
                            Text("Overview").tag(0)
                            Text("Request").tag(1)
                            Text("Response").tag(2)
                            Text("Metadata").tag(3)
                        }
                        .pickerStyle(SegmentedPickerStyle())
                        .padding(.horizontal)

                        // Tab Content
                        switch selectedTab {
                        case 0:
                            OverviewTab(job: job)
                        case 1:
                            RequestTab(job: job)
                        case 2:
                            ResponseTab(job: job)
                        case 3:
                            MetadataTab(job: job)
                        default:
                            EmptyView()
                        }
                    }
                    .padding(.bottom, 20)
                }
                .navigationTitle(getJobTitle(job))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        if job.jobStatus.isActive {
                            Button(action: {
                                Task {
                                    await cancelJob()
                                }
                            }) {
                                if isCancelling {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                } else {
                                    Label("Cancel", systemImage: "xmark.circle")
                                }
                            }
                            .disabled(isCancelling)
                        } else {
                            Button(action: {
                                Task {
                                    await deleteJob()
                                }
                            }) {
                                if isDeleting {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                } else {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .disabled(isDeleting)
                            .foregroundColor(Color.destructive)
                        }
                    }

                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
                        .buttonStyle(ToolbarButtonStyle())
                    }
                }
            }
        }
        .onAppear {
            loadJobDetails()
        }
    }

    // MARK: - Helper Methods

    private func getJobTitle(_ job: BackgroundJob) -> String {
        // For implementation plan types, try PlanContentParser first
        if job.taskType == "implementation_plan" || job.taskType == "implementation_plan_merge" {
            if let title = PlanContentParser.extractPlanTitle(metadata: job.metadata, response: job.response),
               !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return title
            }
        }

        // Extract meaningful title from job metadata
        if let metadata = job.metadata,
           let data = metadata.data(using: .utf8),
           let metaDict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let taskData = metaDict["taskData"] as? [String: Any] {
            if let sessionName = taskData["sessionName"] as? String {
                return sessionName
            }
        }

        return job.taskType.replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    private func loadJobDetails() {
        // Clear any existing subscriptions to prevent leaks
        cancellables.removeAll()

        // Tier 1: Immediate render with in-memory job if available
        if let existingJob = jobsService.jobs.first(where: { $0.id == jobId }) {
            self.job = existingJob
            self.isLoading = false
        }

        // Tier 2: Fast-path fetch if not in memory or missing content
        if self.job == nil || self.job?.response == nil {
            jobsService.getJobFast(jobId: jobId)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure = completion {
                            self.isLoading = false
                        }
                    },
                    receiveValue: { job in
                        self.job = job
                        self.isLoading = false
                    }
                )
                .store(in: &cancellables)
        }

        // Tier 3: Background hydration with full details (don't toggle isLoading)
        let request = JobDetailsRequest(jobId: jobId, includeFullContent: true)
        jobsService.getJobDetails(request: request)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { response in
                    self.job = response.job
                    // Don't set isLoading here - sheet is already open
                }
            )
            .store(in: &cancellables)
    }

    private func cancelJob() async {
        isCancelling = true
        error = nil

        let request = JobCancellationRequest(jobId: jobId, reason: "User requested cancellation")

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            var localCancellable: AnyCancellable?
            localCancellable = jobsService.cancelJob(request: request)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        localCancellable?.cancel()
                        continuation.resume()
                    },
                    receiveValue: { response in
                        if response.success {
                            self.isCancelling = false
                            self.dismiss()
                        } else {
                            self.error = response.message.isEmpty ? "Cancellation failed" : response.message
                            self.isCancelling = false
                        }
                    }
                )
        }
    }

    private func deleteJob() async {
        isDeleting = true
        error = nil

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            var localCancellable: AnyCancellable?
            localCancellable = jobsService.deleteJob(jobId: jobId)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        localCancellable?.cancel()
                        continuation.resume()
                    },
                    receiveValue: { success in
                        if success {
                            self.isDeleting = false
                            self.dismiss()
                        } else {
                            self.error = "Deletion failed"
                            self.isDeleting = false
                        }
                    }
                )
        }
    }
}

// MARK: - Status Header Component

struct JobStatusHeader: View {
    let job: BackgroundJob

    private var statusColor: Color {
        switch job.jobStatus {
        case .completed, .completedByTag:
            return Color.success
        case .failed:
            return Color.destructive
        case .canceled:
            return Color.warning
        case .running, .generatingStream, .processingStream:
            return Color.info
        default:
            return Color.mutedForeground
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
        default:
            return "clock.fill"
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: statusIcon)
                .font(.system(size: 32))
                .foregroundColor(statusColor)

            VStack(alignment: .leading, spacing: 4) {
                Text(job.jobStatus.displayName)
                    .font(.headline)
                    .foregroundColor(statusColor)

                if let subStatus = job.subStatusMessage {
                    Text(subStatus)
                        .font(.caption)
                        .foregroundColor(Color.mutedForeground)
                }

                Text(job.formattedDate)
                    .font(.caption2)
                    .foregroundColor(Color.mutedForeground)

                if job.taskType == "file_finder_workflow" {
                    Text("File Finder Workflow")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(Color.info)
                }
            }

            Spacer()

            if job.jobStatus.isActive, let progress = job.streamProgressPercentage {
                // Clamp progress to 0..100
                let clampedProgress = max(0, min(100, progress))
                CircularProgressView(progress: Double(clampedProgress) / 100.0)
                    .frame(width: 50, height: 50)
            }
        }
        .padding()
        .background(Color.muted)
        .cornerRadius(Theme.Radii.base)
        .padding(.horizontal)
    }
}

// MARK: - Overview Tab

struct OverviewTab: View {
    let job: BackgroundJob
    @State private var timeRefreshTrigger: Int = 0

    // Timer publisher for updating live duration
    private let refreshTimer = Timer.publish(every: 1.0, on: .main, in: .common).autoconnect()

    private var costLabel: String {
        if job.isFinalized == true {
            return "Final Cost"
        } else if job.jobStatus.isActive {
            return "Estimated Cost"
        } else {
            return "Cost"
        }
    }

    private var liveDuration: String? {
        // Use timeRefreshTrigger to force re-evaluation
        let _ = timeRefreshTrigger

        if let endTime = job.endTime, let startTime = job.startTime {
            // Job completed - use stored duration
            let duration = endTime - startTime
            return formatDurationMs(duration)
        } else if let durationMs = job.durationMs {
            // Duration already computed
            return formatDurationMs(Int64(durationMs))
        } else if job.jobStatus.isActive, let startTime = job.startTime {
            // Active job - compute live duration
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            let duration = now - startTime
            return formatDurationMs(duration)
        }
        return nil
    }

    var body: some View {
        VStack(spacing: 16) {
            // Metrics Section
            DetailSection(title: "Metrics") {
                VStack(spacing: 12) {
                    if let model = job.modelUsed {
                        MetricRow(label: "Model", value: model)
                    }

                    // Token Grid Layout
                    if job.tokensSent ?? 0 > 0 || job.tokensReceived ?? 0 > 0 {
                        TokenGridView(job: job)
                    }

                    // Cost with dynamic label
                    if let cost = job.actualCost, cost > 0 {
                        MetricRow(label: costLabel, value: formatCurrency(cost))
                    }

                    // Live duration
                    if let duration = liveDuration {
                        MetricRow(label: "Duration", value: duration)
                    }
                }
            }

            // Timing Section
            DetailSection(title: "Timing") {
                VStack(spacing: 12) {
                    MetricRow(label: "Created", value: formatDate(job.createdAt))

                    if let startTime = job.startTime {
                        MetricRow(label: "Started", value: formatDate(startTime))
                    }

                    if let endTime = job.endTime {
                        MetricRow(label: "Completed", value: formatDate(endTime))
                    }
                }
            }

            // Error Section (if applicable)
            if job.errorDetails != nil || job.errorMessage != nil {
                ErrorDetailsSection(job: job)
            }
        }
        .padding(.horizontal)
        .onReceive(refreshTimer) { _ in
            if job.jobStatus.isActive {
                timeRefreshTrigger += 1
            }
        }
    }

    private func formatDurationMs(_ duration: Int64) -> String {
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

    private func formatCurrency(_ amount: Double) -> String {
        if amount < 0.01 {
            return String(format: "$%.4f", amount)
        } else if amount < 0.10 {
            return String(format: "$%.4f", amount)
        } else {
            return String(format: "$%.2f", amount)
        }
    }

    private func formatDate(_ timestamp: Int64) -> String {
        let date = Date(timeIntervalSince1970: Double(timestamp) / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .medium
        return formatter.string(from: date)
    }
}

// MARK: - Token Grid View

struct TokenGridView: View {
    let job: BackgroundJob

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            TokenCell(label: "Sent", value: formatTokenCount(job.tokensSent))
            TokenCell(label: "Received", value: formatTokenCount(job.tokensReceived))

            if let cacheRead = job.cacheReadTokens, cacheRead > 0 {
                TokenCell(label: "Cache Read", value: formatTokenCount64(cacheRead), isCache: true)
            }
            if let cacheWrite = job.cacheWriteTokens, cacheWrite > 0 {
                TokenCell(label: "Cache Write", value: formatTokenCount64(cacheWrite), isCache: true)
            }
        }
        .padding()
        .background(Color.muted)
        .cornerRadius(Theme.Radii.md)
    }

    private func formatTokenCount(_ count: Int32?) -> String {
        guard let count = count, count > 0 else { return "0" }
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }

    private func formatTokenCount64(_ count: Int64) -> String {
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}

struct TokenCell: View {
    let label: String
    let value: String
    var isCache: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundColor(isCache ? Color.info : Color.mutedForeground)
            Text(value)
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundColor(.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Error Details Section

struct ErrorDetailsSection: View {
    let job: BackgroundJob
    @State private var isExpanded = false

    private func getErrorCodeLabel(_ code: String) -> String {
        let labels: [String: String] = [
            "context_length_exceeded": "Context Length Exceeded",
            "rate_limit_exceeded": "Rate Limit Exceeded",
            "authentication_failed": "Authentication Failed",
            "external_service_error": "External Service Error",
            "bad_request": "Bad Request",
            "internal_error": "Internal Error"
        ]
        return labels[code] ?? code.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func getProviderLabel(_ provider: String) -> String {
        let labels: [String: String] = [
            "openai": "OpenAI",
            "anthropic": "Anthropic",
            "google": "Google",
            "openrouter": "OpenRouter",
            "xai": "xAI"
        ]
        return labels[provider] ?? provider
    }

    var body: some View {
        DetailSection(title: "Error Details") {
            VStack(alignment: .leading, spacing: 12) {
                if let errorDetails = job.errorDetails {
                    // Structured error display
                    VStack(alignment: .leading, spacing: 8) {
                        // Error code and message
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(Color.destructive)
                                .font(.system(size: 16))

                            VStack(alignment: .leading, spacing: 4) {
                                if let code = errorDetails.code {
                                    Text(getErrorCodeLabel(code))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(Color.destructive)
                                }
                                if let message = errorDetails.message {
                                    Text(message)
                                        .font(.caption)
                                        .foregroundColor(Color.mutedForeground)
                                }
                            }
                        }

                        // Provider error details (expandable)
                        if let providerError = errorDetails.providerError {
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    isExpanded.toggle()
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                                        .font(.system(size: 10))
                                    Image(systemName: "server.rack")
                                        .font(.system(size: 10))
                                    if let provider = providerError.provider {
                                        Text("\(getProviderLabel(provider)) Error Details")
                                            .font(.caption2)
                                    } else {
                                        Text("Provider Error Details")
                                            .font(.caption2)
                                    }
                                    if let statusCode = providerError.statusCode {
                                        Text("(\(statusCode))")
                                            .font(.caption2)
                                    }
                                }
                                .foregroundColor(Color.mutedForeground)
                            }
                            .buttonStyle(.plain)

                            if isExpanded {
                                VStack(alignment: .leading, spacing: 8) {
                                    // Status and Type
                                    HStack(spacing: 16) {
                                        if let statusCode = providerError.statusCode {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text("Status")
                                                    .font(.caption2)
                                                    .foregroundColor(Color.mutedForeground)
                                                Text("\(statusCode)")
                                                    .font(.system(size: 12, design: .monospaced))
                                            }
                                        }
                                        if let errorType = providerError.errorType {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text("Type")
                                                    .font(.caption2)
                                                    .foregroundColor(Color.mutedForeground)
                                                Text(errorType)
                                                    .font(.system(size: 12, design: .monospaced))
                                            }
                                        }
                                    }

                                    // Context (token limits)
                                    if let context = providerError.context {
                                        if let requestedTokens = context.requestedTokens,
                                           let modelLimit = context.modelLimit {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text("Token Usage")
                                                    .font(.caption2)
                                                    .foregroundColor(Color.mutedForeground)
                                                HStack(spacing: 4) {
                                                    Text("\(requestedTokens.formatted())")
                                                        .font(.system(size: 12, design: .monospaced))
                                                        .foregroundColor(Color.destructive)
                                                    Text("/")
                                                        .foregroundColor(Color.mutedForeground)
                                                    Text("\(modelLimit.formatted())")
                                                        .font(.system(size: 12, design: .monospaced))
                                                    let percentage = Int(Double(requestedTokens) / Double(modelLimit) * 100)
                                                    Text("(\(percentage)% of limit)")
                                                        .font(.caption2)
                                                        .foregroundColor(Color.mutedForeground)
                                                }
                                            }
                                        }
                                        if let additionalInfo = context.additionalInfo, !additionalInfo.isEmpty {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text("Additional Info")
                                                    .font(.caption2)
                                                    .foregroundColor(Color.mutedForeground)
                                                Text(additionalInfo)
                                                    .font(.caption)
                                            }
                                        }
                                    }

                                    // Full details
                                    if let details = providerError.details, !details.isEmpty {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Full Details")
                                                .font(.caption2)
                                                .foregroundColor(Color.mutedForeground)
                                            ScrollView(.horizontal, showsIndicators: false) {
                                                Text(details)
                                                    .font(.system(size: 11, design: .monospaced))
                                                    .textSelection(.enabled)
                                            }
                                        }
                                    }
                                }
                                .padding(12)
                                .background(Color.background)
                                .cornerRadius(Theme.Radii.sm)
                            }
                        }

                        // Fallback attempted indicator
                        if errorDetails.fallbackAttempted == true {
                            HStack(spacing: 4) {
                                Image(systemName: "exclamationmark.circle")
                                    .font(.system(size: 10))
                                Text("A fallback to another provider was attempted")
                                    .font(.caption2)
                            }
                            .foregroundColor(Color.warning)
                        }
                    }
                    .padding()
                    .background(Color.destructive.opacity(0.1))
                    .cornerRadius(Theme.Radii.base)
                } else if let errorMessage = job.errorMessage {
                    // Fallback to simple error message display
                    ScrollView {
                        Text(errorMessage)
                            .inlineCode()
                            .foregroundColor(Color.destructive)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 200)
                    .background(Color.destructive.opacity(0.1))
                    .cornerRadius(Theme.Radii.base)
                }
            }
        }
    }
}

// MARK: - Request Tab

struct RequestTab: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 16) {
            // Task Type
            DetailSection(title: "Task Type") {
                Text(formatTaskType(job.taskType))
                    .inlineCode()
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.muted)
                    .cornerRadius(Theme.Radii.base)
            }

            // Prompt
            if !job.prompt.isEmpty {
                DetailSection(title: "Prompt") {
                    ScrollView {
                        Text(job.prompt)
                            .inlineCode()
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 300)
                    .background(Color.muted)
                    .cornerRadius(Theme.Radii.base)
                }
            }

            // System Prompt Template
            if let systemPrompt = job.systemPromptTemplate {
                DetailSection(title: "System Prompt") {
                    ScrollView {
                        Text(systemPrompt)
                            .inlineCode()
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 200)
                    .background(Color.muted)
                    .cornerRadius(Theme.Radii.base)
                }
            }
        }
        .padding(.horizontal)
    }

    private func formatTaskType(_ taskType: String) -> String {
        taskType.replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }
}

// MARK: - Response Tab

struct ResponseTab: View {
    let job: BackgroundJob
    @EnvironmentObject private var container: AppContainer

    var body: some View {
        let currentIncludedFiles = container.sessionService.currentSession?.includedFiles ?? []

        VStack(spacing: 16) {
            if let formattedView = ResponseFormatter.formattedView(
                for: job,
                currentIncludedFiles: currentIncludedFiles,
                onUseFiles: { newFiles in
                    // Handle Use Files action - newFiles is already the diff (only new files)
                    guard let sessionId = container.sessionService.currentSession?.id else { return }
                    Task {
                        _ = try? await container.sessionService.updateSessionFiles(
                            sessionId: sessionId,
                            addIncluded: newFiles,
                            removeIncluded: nil,
                            addExcluded: nil,
                            removeExcluded: nil
                        )
                    }
                },
                onUseResearch: { results in
                    // Handle Use Research action
                    guard let sessionId = container.sessionService.currentSession?.id else { return }

                    var findingsText = ""
                    for (index, result) in results.enumerated() {
                        if let findings = result["findings"] as? String ?? result["content"] as? String {
                            findingsText += "\n\n<research_finding_\(index + 1)>\n\(findings)\n</research_finding_\(index + 1)>"
                        }
                    }

                    if findingsText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        return
                    }
                    Task {
                        _ = try? await container.sessionService.appendTaskDescription(
                            sessionId: sessionId,
                            appendText: findingsText,
                            opType: "improvement"
                        )
                    }
                },
                onUseFindings: { data in
                    // Handle Use Findings action
                    guard let sessionId = container.sessionService.currentSession?.id else { return }

                    let analysis = data["analysis"] as? String ?? ""
                    let videoSummary = "\n\n<video_analysis_summary>\n\(analysis)\n</video_analysis_summary>"
                    if videoSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        return
                    }

                    Task {
                        _ = try? await container.sessionService.appendTaskDescription(
                            sessionId: sessionId,
                            appendText: videoSummary,
                            opType: "improvement"
                        )
                    }
                }
            ) {
                formattedView
                    .background(Color.muted)
                    .cornerRadius(Theme.Radii.base)
            } else {
                // Fallback to pretty-printed JSON or raw text
                if let response = job.response {
                    ScrollView {
                        Text(response.data(using: .utf8).flatMap {
                            try? JSONSerialization.jsonObject(with: $0)
                        }.flatMap {
                            try? JSONSerialization.data(withJSONObject: $0, options: .prettyPrinted)
                        }.flatMap {
                            String(data: $0, encoding: .utf8)
                        } ?? response)
                            .inlineCode()
                            .textSelection(.enabled)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .background(Color.muted)
                    .cornerRadius(Theme.Radii.base)
                } else {
                    VStack(spacing: 16) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("No response available")
                            .paragraph()
                            .foregroundColor(.secondary)
                    }
                    .padding()
                }
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Metadata Tab

struct MetadataTab: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 16) {
            // Job ID
            DetailSection(title: "Job ID") {
                HStack {
                    Text(job.id)
                        .inlineCode()
                        .lineLimit(1)

                    Spacer()

                    Button(action: {
                        UIPasteboard.general.string = job.id
                    }) {
                        Image(systemName: "doc.on.doc")
                            .font(.body)
                    }
                }
                .padding()
                .background(Color.muted)
                .cornerRadius(Theme.Radii.base)
            }

            // Session ID
            DetailSection(title: "Session ID") {
                HStack {
                    Text(job.sessionId)
                        .inlineCode()
                        .lineLimit(1)

                    Spacer()

                    Button(action: {
                        UIPasteboard.general.string = job.sessionId
                    }) {
                        Image(systemName: "doc.on.doc")
                            .font(.body)
                    }
                }
                .padding()
                .background(Color.muted)
                .cornerRadius(Theme.Radii.base)
            }

            // Metadata
            if let metadata = job.metadata {
                DetailSection(title: "Additional Metadata") {
                    ScrollView {
                        if let prettyJson = formatJSON(metadata) {
                            Text(prettyJson)
                                .inlineCode()
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Text(metadata)
                                .inlineCode()
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .frame(maxHeight: 300)
                    .background(Color.muted)
                    .cornerRadius(Theme.Radii.base)
                }
            }

            // Project Hash
            if let projectHash = job.projectHash {
                DetailSection(title: "Project Hash") {
                    Text(projectHash)
                        .inlineCode()
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.muted)
                        .cornerRadius(Theme.Radii.base)
                }
            }
        }
        .padding(.horizontal)
    }

    private func formatJSON(_ jsonString: String) -> String? {
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data),
              let prettyData = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted),
              let prettyString = String(data: prettyData, encoding: .utf8) else {
            return nil
        }
        return prettyString
    }
}

// MARK: - Helper Components

private struct DetailSection<Content: View>: View {
    let title: String
    let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundColor(.primary)

            content()
        }
    }
}

struct MetricRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .paragraph()
                .foregroundColor(Color.mutedForeground)
            Spacer()
            Text(value)
                .font(.body.weight(.medium))
                .foregroundColor(.primary)
        }
        .padding(.horizontal)
        .padding(.vertical, 4)
        .background(Color.muted)
        .cornerRadius(Theme.Radii.md)
    }
}

struct CircularProgressView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.border, lineWidth: 4)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.info, lineWidth: 4)
                .rotationEffect(.degrees(-90))
                .animation(.linear, value: progress)

            Text("\(Int(progress * 100))%")
                .font(.caption)
                .fontWeight(.medium)
        }
    }
}
