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
                CircularProgressView(progress: Double(progress) / 100.0)
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

    var body: some View {
        VStack(spacing: 16) {
            // Metrics Section
            DetailSection(title: "Metrics") {
                VStack(spacing: 12) {
                    if let model = job.modelUsed {
                        MetricRow(label: "Model", value: model)
                    }

                    if job.tokensSent ?? 0 > 0 || job.tokensReceived ?? 0 > 0 {
                        MetricRow(label: "Tokens Sent", value: formatTokenCount(job.tokensSent))
                        MetricRow(label: "Tokens Received", value: formatTokenCount(job.tokensReceived))

                        if let cacheRead = job.cacheReadTokens, cacheRead > 0 {
                            MetricRow(label: "Cache Read", value: formatTokenCount(cacheRead))
                        }
                        if let cacheWrite = job.cacheWriteTokens, cacheWrite > 0 {
                            MetricRow(label: "Cache Write", value: formatTokenCount(cacheWrite))
                        }
                    }

                    if let cost = job.actualCost, cost > 0 {
                        MetricRow(label: "Cost", value: formatCurrency(cost))
                    }

                    if let duration = job.formattedDuration {
                        MetricRow(label: "Duration", value: duration)
                    }
                }
            }

            // Timing Section
            DetailSection(title: "Timing") {
                VStack(spacing: 12) {
                    MetricRow(label: "Created", value: formatDate(job.createdAt))

                    if let endTime = job.endTime {
                        MetricRow(label: "Completed", value: formatDate(endTime))
                    }
                }
            }

            // Error Section (if applicable)
            if let errorMessage = job.errorMessage {
                DetailSection(title: "Error Details") {
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
        .padding(.horizontal)
    }

    private func formatTokenCount(_ count: Int32?) -> String {
        guard let count = count, count > 0 else { return "0" }
        if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000.0)
        }
        return "\(count)"
    }

    private func formatCurrency(_ amount: Double) -> String {
        if amount < 0.01 {
            return String(format: "$%.4f", amount)
        } else {
            return String(format: "$%.3f", amount)
        }
    }

    private func formatDate(_ timestamp: Int64) -> String {
        let date = Date(timeIntervalSince1970: Double(timestamp) / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .medium
        return formatter.string(from: date)
    }

    private func formatTaskType(_ taskType: String) -> String {
        taskType.replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
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
                        for try await _ in CommandRouter.sessionUpdateFiles(
                            id: sessionId,
                            addIncluded: newFiles,
                            removeIncluded: nil,
                            addExcluded: nil,
                            removeExcluded: nil
                        ) {}
                    }
                },
                onUseResearch: { results in
                    // Handle Use Research action
                    guard let sessionId = container.sessionService.currentSession?.id,
                          let currentTaskDescription = container.sessionService.currentSession?.taskDescription else { return }

                    var findingsText = ""
                    for (index, result) in results.enumerated() {
                        if let findings = result["findings"] as? String ?? result["content"] as? String {
                            findingsText += "\n\n<research_finding_\(index + 1)>\n\(findings)\n</research_finding_\(index + 1)>"
                        }
                    }

                    let updatedTaskDescription = currentTaskDescription + findingsText
                    Task {
                        for try await _ in CommandRouter.sessionUpdateTaskDescription(
                            sessionId: sessionId,
                            taskDescription: updatedTaskDescription
                        ) {}
                    }
                },
                onUseFindings: { data in
                    // Handle Use Findings action
                    guard let sessionId = container.sessionService.currentSession?.id,
                          let currentTaskDescription = container.sessionService.currentSession?.taskDescription else { return }

                    let analysis = data["analysis"] as? String ?? ""
                    let videoSummary = "\n\n<video_analysis_summary>\n\(analysis)\n</video_analysis_summary>"
                    let updatedTaskDescription = currentTaskDescription + videoSummary

                    Task {
                        for try await _ in CommandRouter.sessionUpdateTaskDescription(
                            sessionId: sessionId,
                            taskDescription: updatedTaskDescription
                        ) {}
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

// MARK: - Extensions

extension JobStatus {
    var displayName: String {
        switch self {
        case .idle:
            return "Idle"
        case .created:
            return "Created"
        case .queued:
            return "Queued"
        case .acknowledgedByWorker:
            return "Acknowledged"
        case .preparing:
            return "Preparing"
        case .preparingInput:
            return "Preparing Input"
        case .running:
            return "Running"
        case .processingStream:
            return "Processing Stream"
        case .generatingStream:
            return "Generating Stream"
        case .completed:
            return "Completed"
        case .completedByTag:
            return "Completed (Tagged)"
        case .failed:
            return "Failed"
        case .canceled:
            return "Canceled"
        case .unknown:
            return "Unknown"
        }
    }
}