import SwiftUI
import Core

public struct JobCardView: View {
    let job: BackgroundJob

    public init(job: BackgroundJob) {
        self.job = job
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
        case .queued, .created:
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
            return "xmark.circle.fill"
        case .canceled:
            return "stop.circle.fill"
        case .running, .generatingStream, .processingStream:
            return "play.circle.fill"
        case .queued, .created:
            return "clock.fill"
        default:
            return "circle.fill"
        }
    }

    private var taskTypeDisplay: String {
        // Convert task_type snake_case to Title Case
        job.taskType.replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header: Status + Task Type
            HStack {
                Image(systemName: statusIcon)
                    .foregroundColor(statusColor)
                    .font(.system(size: 20))

                VStack(alignment: .leading, spacing: 2) {
                    Text(taskTypeDisplay)
                        .font(.headline)
                        .foregroundColor(.primary)

                    Text(job.jobStatus.displayName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                // Progress indicator for active jobs
                if job.jobStatus.isActive {
                    if let progress = job.progressPercentage, progress > 0 {
                        Text("\(progress)%")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    } else {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                }
            }

            // Progress Bar (for active jobs with known progress)
            if job.jobStatus.isActive, let progress = job.progressPercentage {
                ProgressView(value: Double(progress), total: 100)
                    .tint(statusColor)
            }

            // Sub-status message (if available)
            if let subStatus = job.subStatusMessage, !subStatus.isEmpty {
                Text(subStatus)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            // Metrics Row
            HStack(spacing: 16) {
                if let model = job.modelUsed {
                    MetricItem(icon: "cpu", text: model)
                }

                if job.totalTokens > 0 {
                    MetricItem(icon: "number", text: "\(job.totalTokens)")
                }

                if let cost = job.actualCost {
                    MetricItem(icon: "dollarsign.circle", text: String(format: "$%.4f", cost))
                }

                if let duration = job.formattedDuration {
                    MetricItem(icon: "clock", text: duration)
                }
            }
            .font(.caption)

            // Timestamp
            HStack {
                Spacer()
                Text(job.formattedDate)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

// Helper view for metrics
private struct MetricItem: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .foregroundColor(.secondary)
            Text(text)
                .foregroundColor(.primary)
        }
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
