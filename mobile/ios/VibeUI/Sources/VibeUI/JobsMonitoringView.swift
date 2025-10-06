import SwiftUI
import Core

public struct JobsMonitoringView: View {
    @EnvironmentObject private var container: AppContainer
    @State private var searchQuery: String = ""
    @State private var selectedJobId: String? = nil
    @State private var showingJobDetails = false

    private var jobsService: JobsDataService {
        container.jobsService
    }

    // Filter jobs based on search query
    private var filteredJobs: [BackgroundJob] {
        let jobs = jobsService.jobs

        if searchQuery.isEmpty {
            return jobs.sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
        }

        return jobs.filter { job in
            job.taskType.localizedCaseInsensitiveContains(searchQuery) ||
            job.id.localizedCaseInsensitiveContains(searchQuery) ||
            job.status.localizedCaseInsensitiveContains(searchQuery)
        }.sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    // Summary counts
    private var activeJobs: [BackgroundJob] {
        jobsService.jobs.filter { $0.jobStatus.isActive }
    }

    private var completedJobs: [BackgroundJob] {
        jobsService.jobs.filter { $0.jobStatus == .completed }
    }

    private var failedJobs: [BackgroundJob] {
        jobsService.jobs.filter { $0.jobStatus == .failed }
    }

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Search Bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search jobs...", text: $searchQuery)
                    .textFieldStyle(.plain)
                if !searchQuery.isEmpty {
                    Button(action: { searchQuery = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(12)
            .background(Color(.systemGray6))
            .cornerRadius(10)
            .padding()

            // Summary Cards
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    SummaryCard(title: "Active", count: activeJobs.count, color: .blue)
                    SummaryCard(title: "Completed", count: completedJobs.count, color: .green)
                    SummaryCard(title: "Failed", count: failedJobs.count, color: .red)
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 8)

            // Job List
            if filteredJobs.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "tray")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text(searchQuery.isEmpty ? "No jobs yet" : "No matching jobs")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(filteredJobs) { job in
                            JobCardView(job: job)
                                .onTapGesture {
                                    selectedJobId = job.id
                                    showingJobDetails = true
                                }
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Background Jobs")
        .sheet(isPresented: $showingJobDetails) {
            if let jobId = selectedJobId {
                JobDetailsSheet(jobId: jobId)
                    .environmentObject(container)
            }
        }
        .onAppear {
            Task {
                await loadJobs()
            }
        }
    }

    private func loadJobs() async {
        let request = JobListRequest(
            pageSize: 100,
            sortBy: .createdAt,
            sortOrder: .desc,
            includeContent: false
        )

        _ = jobsService.listJobs(request: request)
    }
}

// Summary Card Component
private struct SummaryCard: View {
    let title: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
            Text("\(count)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(color)
        }
        .frame(minWidth: 100)
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

#Preview {
    NavigationStack {
        JobsMonitoringView()
    }
}
