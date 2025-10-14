import SwiftUI
import Core
import Combine

public struct JobsMonitoringView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @Environment(\.colorScheme) var colorScheme
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

    // Base filtered jobs (session + job type filtering, no search)
    private var baseFilteredJobs: [BackgroundJob] {
        guard let currentSessionId = container.sessionService.currentSession?.id else {
            return []
        }

        let excludedIds = planJobIdsForCurrentSession

        // Mobile sessions should see all jobs (not filtered by session)
        let shouldFilterBySession = !currentSessionId.hasPrefix("mobile-session-")

        return jobsService.jobs
            .filter { job in
                if shouldFilterBySession {
                    return job.sessionId == currentSessionId
                }
                // Mobile sessions see all jobs
                return true
            }
            .filter { job in
                if job.taskType == "implementation_plan" || job.taskType == "implementation_plan_merge" {
                    return false
                }
                if excludedIds.contains(job.id) {
                    return false
                }
                return true
            }
    }

    // Filtered jobs with search applied
    private var filteredJobs: [BackgroundJob] {
        let search = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return baseFilteredJobs
            .filter { job in
                search.isEmpty ||
                job.taskType.localizedCaseInsensitiveContains(search) ||
                job.id.localizedCaseInsensitiveContains(search) ||
                job.status.localizedCaseInsensitiveContains(search)
            }
            .sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    // Summary counts (use baseFilteredJobs to match list filtering)
    private var activeJobs: [BackgroundJob] {
        baseFilteredJobs.filter { $0.jobStatus.isActive }
    }

    private var completedJobs: [BackgroundJob] {
        baseFilteredJobs.filter { $0.jobStatus == .completed }
    }

    private var failedJobs: [BackgroundJob] {
        baseFilteredJobs.filter { $0.jobStatus == .failed }
    }

    public init() {}

    public var body: some View {
        let _ = refreshTrigger // Force view dependency

        VStack(spacing: 0) {
            VStack(spacing: 0) {
                // Search and Summary Section
                VStack(spacing: 16) {
                    // Search bar
                    ZStack(alignment: .leading) {
                        // Custom placeholder
                        if searchQuery.isEmpty {
                            HStack(spacing: 8) {
                                Image(systemName: "magnifyingglass")
                                    .foregroundColor(Color.mutedForeground)
                                    .frame(width: 16)
                                Text("Search jobs...")
                                    .foregroundColor(Color.mutedForeground)
                            }
                            .padding(14)
                            .allowsHitTesting(false)
                        }

                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                                .foregroundColor(Color.mutedForeground)
                                .frame(width: 16)
                            TextField("", text: $searchQuery)
                                .textFieldStyle(.plain)
                                .foregroundColor(Color.foreground)
                            if !searchQuery.isEmpty {
                                Button(action: { searchQuery = "" }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(Color.mutedForeground)
                                }
                            }
                        }
                        .padding(14)
                    }
                    .background(Color.input)
                    .cornerRadius(Theme.Radii.base)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radii.base)
                            .stroke(Color.border, lineWidth: 1)
                    )

                    // Summary Cards
                    if jobsService.hasLoadedOnce && !jobsService.jobs.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                SummaryCard(title: "Active", count: activeJobs.count, color: .info)
                                SummaryCard(title: "Completed", count: completedJobs.count, color: .success)
                                SummaryCard(title: "Failed", count: failedJobs.count, color: .destructive)
                            }
                            .padding(.horizontal, 1)
                        }
                    }
                }
                .padding()

                // Job List
                if jobsService.isLoading && !jobsService.hasLoadedOnce {
                    VStack(spacing: 16) {
                        Spacer()
                        ProgressView()
                            .scaleEffect(1.5)
                        Text("Loading jobs...")
                            .font(.system(size: 15))
                            .foregroundColor(Color.mutedForeground)
                            .padding(.top, 16)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if jobsService.hasLoadedOnce && filteredJobs.isEmpty {
                    VStack(spacing: 16) {
                        Spacer()
                        Image(systemName: "tray")
                            .font(.system(size: 48))
                            .foregroundColor(Color.mutedForeground.opacity(0.6))
                        Text(searchQuery.isEmpty ? "No jobs yet" : "No matching jobs")
                            .h4()
                            .foregroundColor(Color.foreground)

                        if searchQuery.isEmpty {
                            Text("Background jobs will appear here once they are created")
                                .font(.system(size: 15))
                                .foregroundColor(Color.mutedForeground)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                        }
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
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
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .padding(.top, 4)
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
            guard let session = container.sessionService.currentSession else { return }

            // Start session-scoped sync
            container.setJobsViewActive(true)

            // CRITICAL: Do an initial full fetch of ALL jobs (not just active ones)
            // before starting session-scoped event sync that monitors active jobs
            Task {
                await loadJobs()
            }

            jobsService.startSessionScopedSync(
                sessionId: session.id,
                projectDirectory: session.projectDirectory
            )

            // Load plans for filtering
            if isConnected {
                loadPlansForFiltering()
            }
        }
        .onDisappear {
            // Stop session-scoped sync
            jobsService.stopSessionScopedSync()
            container.setJobsViewActive(false)
            // Keep jobs cached for instant display on next view - events keep data fresh
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
        // Gate: only fetch when session exists
        guard let rawSessionId = container.sessionService.currentSession?.id else {
            return
        }

        // Mobile sessions should fetch all jobs (pass nil for sessionId)
        let sessionId: String? = rawSessionId.hasPrefix("mobile-session-") ? nil : rawSessionId

        // Cache-first strategy: only show loading if we have no cached jobs
        let hasCachedJobs = !jobsService.jobs.isEmpty
        if !hasCachedJobs {
            isLoading = true
        }

        let projectDir = container.sessionService.currentSession?.projectDirectory ?? container.currentProject?.directory

        // Capture RAW session ID for verification (not the transformed one)
        let capturedRawSessionId = rawSessionId

        let request = JobListRequest(
            projectDirectory: projectDir,
            sessionId: sessionId,
            pageSize: 100,
            sortBy: .createdAt,
            sortOrder: .desc
        )

        jobsService.listJobs(request: request)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [self] _ in
                    self.isLoading = false
                },
                receiveValue: { [self] _ in
                    // Verify session hasn't changed (compare raw IDs)
                    guard container.sessionService.currentSession?.id == capturedRawSessionId else {
                        return
                    }

                    self.isLoading = false
                    // Note: Prefetch is now triggered automatically inside JobsDataService for faster loading
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
            // Handle both array of strings and array of objects
            if let filesArray = responseObj["files"] as? [String] {
                await applyFilesToSession(filesArray)
            } else if let filesObjArray = responseObj["files"] as? [[String: Any]] {
                let filePaths = filesObjArray.compactMap { $0["path"] as? String }
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
        guard let sessionId = container.sessionService.currentSession?.id else {
            return
        }

        Task {
            do {
                for try await response in CommandRouter.sessionUpdateFiles(
                    id: sessionId,
                    addIncluded: filePaths,
                    removeIncluded: nil,
                    addExcluded: nil,
                    removeExcluded: nil
                ) {
                    if let error = response.error {
                        return
                    }
                    if response.isFinal {
                        break
                    }
                }
            } catch {
                // Silent error handling
            }
        }
    }

    private func applyResearchToSession(_ searchResults: [[String: Any]]) async {
        guard let sessionId = container.sessionService.currentSession?.id,
              let currentTaskDescription = container.sessionService.currentSession?.taskDescription else {
            return
        }

        // Extract findings and wrap in XML tags (mirror desktop pattern)
        var findingsText = ""
        for (index, result) in searchResults.enumerated() {
            if let findings = result["findings"] as? String ?? result["content"] as? String {
                findingsText += "\n\n<research_finding_\(index + 1)>\n\(findings)\n</research_finding_\(index + 1)>"
            }
        }

        let updatedTaskDescription = currentTaskDescription + findingsText

        Task {
            do {
                for try await response in CommandRouter.sessionUpdateTaskDescription(
                    sessionId: sessionId,
                    taskDescription: updatedTaskDescription
                ) {
                    if let error = response.error {
                        return
                    }
                    if response.isFinal {
                        break
                    }
                }
            } catch {
                // Silent error handling
            }
        }
    }

    private func applyVideoAnalysisToSession(_ analysisData: [String: Any]) async {
        guard let sessionId = container.sessionService.currentSession?.id,
              let currentTaskDescription = container.sessionService.currentSession?.taskDescription else {
            return
        }

        // Extract analysis and wrap in XML tags
        let analysis = analysisData["analysis"] as? String ?? ""
        let videoSummary = "\n\n<video_analysis_summary>\n\(analysis)\n</video_analysis_summary>"

        let updatedTaskDescription = currentTaskDescription + videoSummary

        Task {
            do {
                for try await response in CommandRouter.sessionUpdateTaskDescription(
                    sessionId: sessionId,
                    taskDescription: updatedTaskDescription
                ) {
                    if let error = response.error {
                        return
                    }
                    if response.isFinal {
                        break
                    }
                }
            } catch {
                // Silent error handling
            }
        }
    }
}

// Summary Card Component
private struct SummaryCard: View {
    let title: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color.mutedForeground)
            Text("\(count)")
                .h2()
                .foregroundColor(color)
        }
        .frame(minWidth: 100, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(Color.card)
        .cornerRadius(Theme.Radii.base)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radii.base)
                .stroke(Color.border, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.03), radius: 3, x: 0, y: 1)
    }
}

#Preview {
    NavigationStack {
        JobsMonitoringView()
    }
}
