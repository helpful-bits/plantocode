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
                        }
                    }
            } else if let error = error {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 48))
                        .foregroundColor(.red)
                    Text("Error loading job")
                        .font(.headline)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
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
                            .foregroundColor(.red)
                        }
                    }

                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
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
        // Extract meaningful title from job
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
        if let cachedJob = jobsService.jobs.first(where: { $0.id == jobId }) {
            self.job = cachedJob
            self.isLoading = false
        } else {
            let request = JobDetailsRequest(jobId: jobId, includeFullContent: true)
            jobsService.getJobDetails(request: request)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            self.error = error.localizedDescription
                        }
                        self.isLoading = false
                    },
                    receiveValue: { response in
                        self.job = response.job
                    }
                )
                .store(in: &cancellables)
        }
    }

    private func cancelJob() async {
        isCancelling = true
        let request = JobCancellationRequest(jobId: jobId, reason: "User requested cancellation")
        jobsService.cancelJob(request: request)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        self.error = "Failed to cancel: \(error.localizedDescription)"
                    }
                    self.isCancelling = false
                    self.dismiss()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }

    private func deleteJob() async {
        isDeleting = true
        jobsService.deleteJob(jobId: jobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        self.error = "Failed to delete: \(error.localizedDescription)"
                    }
                    self.isDeleting = false
                    self.dismiss()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
}

// MARK: - Status Header Component

struct JobStatusHeader: View {
    let job: BackgroundJob

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
                        .foregroundColor(Color(.secondaryLabel))
                }

                Text(job.formattedDate)
                    .font(.caption2)
                    .foregroundColor(Color(.secondaryLabel))
            }

            Spacer()

            if job.jobStatus.isActive, let progress = job.progressPercentage {
                CircularProgressView(progress: Double(progress) / 100)
                    .frame(width: 50, height: 50)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
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

                    if let startTime = job.startTime {
                        MetricRow(label: "Started", value: formatDate(startTime))
                    }

                    if let endTime = job.endTime {
                        MetricRow(label: "Completed", value: formatDate(endTime))
                    }

                    if let updatedAt = job.updatedAt {
                        MetricRow(label: "Last Updated", value: formatDate(updatedAt))
                    }
                }
            }

            // Error Section (if applicable)
            if let errorMessage = job.errorMessage {
                DetailSection(title: "Error Details") {
                    ScrollView {
                        Text(errorMessage)
                            .font(.system(.body, design: .monospaced))
                            .foregroundColor(.red)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 200)
                    .background(Color.red.opacity(0.1))
                    .cornerRadius(8)
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
}

// MARK: - Request Tab

struct RequestTab: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 16) {
            // Task Type
            DetailSection(title: "Task Type") {
                Text(job.taskType)
                    .font(.system(.body, design: .monospaced))
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
            }

            // Prompt
            if !job.prompt.isEmpty {
                DetailSection(title: "Prompt") {
                    ScrollView {
                        Text(job.prompt)
                            .font(.system(.body, design: .monospaced))
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 300)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
            }

            // System Prompt Template
            if let systemPrompt = job.systemPromptTemplate {
                DetailSection(title: "System Prompt") {
                    ScrollView {
                        Text(systemPrompt)
                            .font(.system(.caption, design: .monospaced))
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 200)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Response Tab

struct ResponseTab: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 16) {
            if let response = job.response, !response.isEmpty {
                DetailSection(title: "Response") {
                    ScrollView {
                        if let prettyJson = formatJSON(response) {
                            Text(prettyJson)
                                .font(.system(.caption, design: .monospaced))
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Text(response)
                                .font(.system(.body, design: .monospaced))
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .frame(maxHeight: 400)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("No response available")
                        .foregroundColor(.secondary)
                }
                .frame(maxHeight: 200)
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

// MARK: - Metadata Tab

struct MetadataTab: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 16) {
            // Job ID
            DetailSection(title: "Job ID") {
                HStack {
                    Text(job.id)
                        .font(.system(.caption, design: .monospaced))
                        .lineLimit(1)

                    Spacer()

                    Button(action: {
                        UIPasteboard.general.string = job.id
                    }) {
                        Image(systemName: "doc.on.doc")
                            .font(.caption)
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }

            // Session ID
            DetailSection(title: "Session ID") {
                HStack {
                    Text(job.sessionId)
                        .font(.system(.caption, design: .monospaced))
                        .lineLimit(1)

                    Spacer()

                    Button(action: {
                        UIPasteboard.general.string = job.sessionId
                    }) {
                        Image(systemName: "doc.on.doc")
                            .font(.caption)
                    }
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }

            // Metadata
            if let metadata = job.metadata {
                DetailSection(title: "Additional Metadata") {
                    ScrollView {
                        if let prettyJson = formatJSON(metadata) {
                            Text(prettyJson)
                                .font(.system(.caption, design: .monospaced))
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Text(metadata)
                                .font(.system(.caption, design: .monospaced))
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .frame(maxHeight: 300)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
            }

            // Project Hash
            if let projectHash = job.projectHash {
                DetailSection(title: "Project Hash") {
                    Text(projectHash)
                        .font(.system(.caption, design: .monospaced))
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
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
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.primary)
        }
        .padding(.horizontal)
        .padding(.vertical, 4)
        .background(Color(.systemGray6))
        .cornerRadius(6)
    }
}

struct CircularProgressView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.secondaryLabel).opacity(0.2), lineWidth: 4)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(Color.blue, lineWidth: 4)
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