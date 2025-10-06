import SwiftUI
import Core

public struct JobDetailsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer

    let jobId: String
    @State private var job: BackgroundJob?
    @State private var isLoading = true
    @State private var error: String?

    private var jobsService: JobsDataService {
        container.jobsService
    }

    public init(jobId: String) {
        self.jobId = jobId
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    ProgressView()
                        .padding(.top, 100)
                } else if let error = error {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 48))
                            .foregroundColor(.red)
                        Text("Error loading job")
                            .font(.headline)
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                } else if let job = job {
                    VStack(spacing: 20) {
                        // Status Section
                        DetailSection(title: "Status") {
                            StatusInfoView(job: job)
                        }

                        // Metrics Section
                        DetailSection(title: "Metrics") {
                            MetricsView(job: job)
                        }

                        // Prompt Section
                        if !job.prompt.isEmpty {
                            DetailSection(title: "Prompt") {
                                Text(job.prompt)
                                    .font(.system(.body, design: .monospaced))
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(.systemGray6))
                                    .cornerRadius(8)
                            }
                        }

                        // Response Section
                        if let response = job.response, !response.isEmpty {
                            DetailSection(title: "Response") {
                                Text(response)
                                    .font(.system(.body, design: .monospaced))
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(.systemGray6))
                                    .cornerRadius(8)
                            }
                        }

                        // Error Section
                        if let errorMessage = job.errorMessage, !errorMessage.isEmpty {
                            DetailSection(title: "Error") {
                                Text(errorMessage)
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundColor(.red)
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.red.opacity(0.1))
                                    .cornerRadius(8)
                            }
                        }

                        // Metadata Section
                        if let metadata = job.metadata, !metadata.isEmpty {
                            DetailSection(title: "Metadata") {
                                Text(metadata)
                                    .font(.system(.caption, design: .monospaced))
                                    .padding()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(.systemGray6))
                                    .cornerRadius(8)
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Job Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }

                if let job = job, job.jobStatus.isActive {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Cancel Job", role: .destructive) {
                            Task {
                                await cancelJob()
                            }
                        }
                    }
                }
            }
            .onAppear {
                Task {
                    await loadJobDetails()
                }
            }
        }
    }

    private func loadJobDetails() async {
        isLoading = true
        defer { isLoading = false }

        // First check if job is in memory
        if let cachedJob = jobsService.jobs.first(where: { $0.id == jobId }) {
            job = cachedJob
        }

        // Then fetch latest from server
        // This would use jobsService.getJobDetails(request: JobDetailsRequest(jobId: jobId))
        // For now, just use the cached version
    }

    private func cancelJob() async {
        guard let job = job else { return }
        // Implement job cancellation
        // await jobsService.cancelJob(request: JobCancellationRequest(jobId: job.id))
        dismiss()
    }
}

// Status Info View
private struct StatusInfoView: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 12) {
            InfoRow(label: "Status", value: job.jobStatus.displayName, valueColor: statusColor)
            InfoRow(label: "Task Type", value: job.taskType)
            InfoRow(label: "Created", value: job.formattedDate)
            if let progress = job.progressPercentage {
                InfoRow(label: "Progress", value: "\(progress)%")
            }
            if let subStatus = job.subStatusMessage {
                InfoRow(label: "Sub-status", value: subStatus)
            }
        }
    }

    private var statusColor: Color {
        switch job.jobStatus {
        case .completed, .completedByTag: return .green
        case .failed: return .red
        case .canceled: return .orange
        case .running, .generatingStream, .processingStream: return .blue
        default: return .primary
        }
    }
}

// Metrics View
private struct MetricsView: View {
    let job: BackgroundJob

    var body: some View {
        VStack(spacing: 12) {
            if let model = job.modelUsed {
                InfoRow(label: "Model", value: model)
            }
            if job.totalTokens > 0 {
                InfoRow(label: "Total Tokens", value: "\(job.totalTokens)")
            }
            if let sent = job.tokensSent {
                InfoRow(label: "Tokens Sent", value: "\(sent)")
            }
            if let received = job.tokensReceived {
                InfoRow(label: "Tokens Received", value: "\(received)")
            }
            if let cost = job.actualCost {
                InfoRow(label: "Cost", value: String(format: "$%.4f", cost))
            }
            if let duration = job.formattedDuration {
                InfoRow(label: "Duration", value: duration)
            }
        }
    }
}

// Detail Section Container
private struct DetailSection<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundColor(.primary)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// Info Row
private struct InfoRow: View {
    let label: String
    let value: String
    var valueColor: Color = .primary

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .foregroundColor(valueColor)
        }
        .font(.body)
    }
}

#Preview {
    JobDetailsSheet(jobId: "test-job-1")
}
