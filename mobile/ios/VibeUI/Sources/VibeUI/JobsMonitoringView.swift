import SwiftUI
import Core
import Combine

public struct JobsMonitoringView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @State private var searchQuery: String = ""
    @State private var selectedJobId: String? = nil
    @State private var showingJobDetails = false
    @State private var isLoading = false
    @State private var cancellingJobs = Set<String>()
    @State private var deletingJobs = Set<String>()
    @State private var errorMessage: String?
    @State private var showingError = false
    @State private var refreshTrigger = UUID()
    @State private var cancellables = Set<AnyCancellable>()

    private var jobsService: JobsDataService {
        container.jobsService
    }

    // Filter jobs based on search query
    private var filteredJobs: [BackgroundJob] {
        let search = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let excludedIds = planJobIdsForCurrentSession

        return jobsService.jobs
            .filter { job in
                if excludedIds.contains(job.id) { return false }
                if isPlanTaskType(job.taskType) { return false }
                return true
            }
            .filter { job in
                search.isEmpty ||
                job.taskType.localizedCaseInsensitiveContains(search) ||
                job.id.localizedCaseInsensitiveContains(search) ||
                job.status.localizedCaseInsensitiveContains(search)
            }
            .sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
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
        let _ = refreshTrigger // Force view dependency

        VStack(spacing: 0) {
            VStack(spacing: 0) {
                // Search and Summary Section
                VStack(spacing: 16) {
                    // Search Bar
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                            .frame(width: 20)
                        TextField("Search jobs...", text: $searchQuery)
                            .textFieldStyle(.plain)
                        if !searchQuery.isEmpty {
                            Button(action: { searchQuery = "" }) {
                                Image(systemName: "xmark.circle.fill")
                            }
                            .buttonStyle(CompactIconButtonStyle())
                        }
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(Theme.Radii.base)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radii.base)
                            .stroke(Color(.separator), lineWidth: 1)
                    )

                    // Summary Cards
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            SummaryCard(title: "Active", count: activeJobs.count, color: .blue)
                            SummaryCard(title: "Completed", count: completedJobs.count, color: .green)
                            SummaryCard(title: "Failed", count: failedJobs.count, color: .red)
                        }
                    }
                }
                .padding()

                // Job List
                if filteredJobs.isEmpty {
                    VStack(spacing: 16) {
                        Spacer()
                        Image(systemName: "tray")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text(searchQuery.isEmpty ? "No jobs yet" : "No matching jobs")
                            .h4()
                            .foregroundColor(.secondary)

                        if searchQuery.isEmpty {
                            Text("Background jobs will appear here once they are created")
                                .paragraph()
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(filteredJobs) { job in
                                JobCardView(
                                    job: job,
                                    onCancel: job.jobStatus.isActive ? cancelJob : nil,
                                    onDelete: !job.jobStatus.isActive ? deleteJob : nil,
                                    onSelect: {
                                        selectedJobId = job.id
                                        showingJobDetails = true
                                    },
                                    onApplyFiles: applyFilesFromJob,
                                    onContinueWorkflow: continueWorkflow,
                                    currentSessionId: container.sessionService.currentSession?.id,
                                    hasContinuationJob: checkHasContinuationJob(for: job),
                                    isWorkflowActive: checkIsWorkflowActive(for: job)
                                )
                            }
                        }
                        .padding(.horizontal)
                        .padding(.bottom)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemBackground))
        }
        .navigationTitle("Background Jobs")
        .sheet(isPresented: $showingJobDetails) {
            if let jobId = selectedJobId {
                JobDetailsSheet(jobId: jobId)
                    .environmentObject(container)
            }
        }
        .onAppear {
            if isConnected {
                Task {
                    await loadJobs()
                    loadPlansForFiltering()
                }
            }
        }
        .onReceive(multiConnectionManager.$connectionStates) { states in
            guard let activeId = multiConnectionManager.activeDeviceId,
                  let state = states[activeId] else { return }

            if state.isConnected && jobsService.jobs.isEmpty {
                Task {
                    await loadJobs()
                }
            }
        }
        .onReceive(container.sessionService.$currentSession) { _ in
            refreshTrigger = UUID()
            Task {
                await loadJobs()
                loadPlansForFiltering()
            }
        }
        .alert("Error", isPresented: $showingError) {
            Button("OK") {
                errorMessage = nil
            }
        } message: {
            Text(errorMessage ?? "An error occurred")
        }
    }

    private var isConnected: Bool {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let state = multiConnectionManager.connectionStates[deviceId] else {
            return false
        }
        return state.isConnected
    }

    private func loadPlansForFiltering() {
        guard let session = container.sessionService.currentSession else { return }
        let req = PlanListRequest(
            projectDirectory: session.projectDirectory,
            sessionId: session.id,
            includeMetadataOnly: true
        )
        container.plansService.listPlans(request: req)
            .sink(receiveCompletion: { _ in }, receiveValue: { _ in })
            .store(in: &cancellables)
    }

    private var planJobIdsForCurrentSession: Set<String> {
        let sid = container.sessionService.currentSession?.id
        return Set(container.plansService.plans
            .filter { $0.sessionId == sid }
            .compactMap { $0.jobId })
    }

    private func loadJobs() async {
        isLoading = true
        let projectDir = container.sessionService.currentSession?.projectDirectory ?? container.currentProject?.directory
        let sessionId = container.sessionService.currentSession?.id

        let request = JobListRequest(
            projectDirectory: projectDir,
            sessionId: sessionId,
            pageSize: 100,
            sortBy: .createdAt,
            sortOrder: .desc,
            includeContent: false
        )

        jobsService.listJobs(request: request)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in
                    self.isLoading = false
                },
                receiveValue: { _ in
                    self.isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    // MARK: - Job Actions

    private func cancelJob(_ jobId: String) async {
        cancellingJobs.insert(jobId)

        let request = JobCancellationRequest(jobId: jobId, reason: "User requested cancellation")
        jobsService.cancelJob(request: request)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        self.errorMessage = "Failed to cancel job: \(error.localizedDescription)"
                        self.showingError = true
                    }
                    self.cancellingJobs.remove(jobId)
                },
                receiveValue: { _ in
                    Task {
                        await self.loadJobs()
                    }
                }
            )
            .store(in: &cancellables)
    }

    private func deleteJob(_ jobId: String) async {
        deletingJobs.insert(jobId)

        jobsService.deleteJob(jobId: jobId)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        self.errorMessage = "Failed to delete job: \(error.localizedDescription)"
                        self.showingError = true
                    }
                    self.deletingJobs.remove(jobId)
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }

    private func applyFilesFromJob(_ job: BackgroundJob) async {
        // Extract files from job response and apply to session
        guard let response = job.response,
              let data = response.data(using: .utf8),
              let responseObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }

        // Handle different job types
        switch job.taskType {
        case "extended_path_finder", "file_relevance_assessment", "path_correction", "regex_file_filter":
            if let files = responseObj["files"] as? [[String: Any]] {
                // Apply files to current session
                let filePaths = files.compactMap { $0["path"] as? String }
                await applyFilesToSession(filePaths)
            }

        case "web_search_execution":
            if let searchResults = responseObj["searchResults"] as? [[String: Any]] {
                // Apply research findings to session
                await applyResearchToSession(searchResults)
            }

        case "video_analysis":
            // Apply video analysis findings
            await applyVideoAnalysisToSession(responseObj)

        default:
            break
        }
    }

    private func continueWorkflow(_ job: BackgroundJob) async {
        // Continue web search workflow
        guard job.taskType == "web_search_prompts_generation",
              job.status == "completed" else {
            return
        }

        // Trigger the web search execution
        // This would need to be implemented based on your workflow system
        print("Continue workflow for job: \(job.id)")
    }

    private func checkHasContinuationJob(for job: BackgroundJob) -> Bool {
        // Check if there's already a web_search_execution job for this prompts generation job
        guard job.taskType == "web_search_prompts_generation" else { return false }

        return jobsService.jobs.contains { otherJob in
            otherJob.taskType == "web_search_execution" &&
            otherJob.metadata?.contains(job.id) ?? false
        }
    }

    private func checkIsWorkflowActive(for job: BackgroundJob) -> Bool {
        // Check if the workflow is still active
        guard job.taskType == "web_search_prompts_generation" else { return false }

        // Check for active workflow jobs
        return jobsService.jobs.contains { otherJob in
            (otherJob.taskType == "file_finder_workflow" || otherJob.taskType == "web_search_workflow") &&
            otherJob.jobStatus.isActive &&
            otherJob.metadata?.contains(job.id) ?? false
        }
    }

    private func applyFilesToSession(_ filePaths: [String]) async {
        // Apply files to the current session
        guard let session = container.sessionService.currentSession else { return }

        // This would need to be implemented based on your session update logic
        print("Applying \(filePaths.count) files to session \(session.id)")
    }

    private func applyResearchToSession(_ searchResults: [[String: Any]]) async {
        // Apply research findings to the current session
        guard let session = container.sessionService.currentSession else { return }

        // Format and apply research findings
        let findings = searchResults.compactMap { result in
            result["findings"] as? String ?? result["content"] as? String
        }

        // This would need to be implemented based on your session update logic
        print("Applying \(findings.count) research findings to session \(session.id)")
    }

    private func applyVideoAnalysisToSession(_ analysisData: [String: Any]) async {
        // Apply video analysis findings to the current session
        guard let session = container.sessionService.currentSession else { return }

        // This would need to be implemented based on your session update logic
        print("Applying video analysis to session \(session.id)")
    }
}

// Summary Card Component
private struct SummaryCard: View {
    let title: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.secondary)
            Text("\(count)")
                .font(.title)
                .fontWeight(.bold)
                .foregroundColor(color)
        }
        .frame(minWidth: 110)
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(Theme.Radii.base)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radii.base)
                .stroke(Color(.separator), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 1)
    }
}

#Preview {
    NavigationStack {
        JobsMonitoringView()
    }
}
