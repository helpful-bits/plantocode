import SwiftUI
import Core
import Combine

public struct JobsMonitoringView: View {
    @EnvironmentObject private var container: AppContainer
    @ObservedObject private var jobsService: JobsDataService
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared
    @Environment(\.colorScheme) var colorScheme
    @State private var selectedJobId: IdentifiableString? = nil
    @State private var isLoading = false
    @State private var cancellingJobs = Set<String>()
    @State private var deletingJobs = Set<String>()
    @State private var errorMessage: String?
    @State private var showingError = false
    @State private var cancellables = Set<AnyCancellable>()
    @State private var successMessage: String?
    @State private var showingSuccess = false
    @State private var hasDoneInitialLoad = false

    public init(jobsService: JobsDataService) {
        self._jobsService = ObservedObject(wrappedValue: jobsService)
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

    // Filtered jobs sorted by date
    private var filteredJobs: [BackgroundJob] {
        return baseFilteredJobs
            .sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    public var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {

                // Job List
                // Show loading if we're loading AND have no jobs for current session
                // (Don't rely on hasLoadedOnce - it's global across all sessions)
                if isLoading || (jobsService.isLoading && filteredJobs.isEmpty) {
                    VStack(spacing: 16) {
                        Spacer()
                        ProgressView()
                            .scaleEffect(1.5)
                        Text("Loading jobs...")
                            .font(.system(size: 15))
                            .foregroundColor(Color.textMuted)
                            .padding(.top, 16)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredJobs.isEmpty {
                    VStack(spacing: 16) {
                        Spacer()
                        Image(systemName: "tray")
                            .font(.system(size: 48))
                            .foregroundColor(Color.textMuted.opacity(0.6))
                        Text("No jobs yet")
                            .h4()
                            .foregroundColor(Color.textPrimary)

                        Text("Background jobs will appear here once they are created")
                            .font(.system(size: 15))
                            .foregroundColor(Color.textMuted)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: Theme.Spacing.cardSpacing) {
                            ForEach(filteredJobs) { job in
                                JobCardView(
                                    job: job,
                                    onCancel: job.jobStatus.isActive ? cancelJob : nil,
                                    onDelete: !job.jobStatus.isActive ? deleteJob : nil,
                                    onSelect: {
                                        selectedJobId = IdentifiableString(value: job.id)
                                    },
                                    onApplyFiles: applyFilesFromJob,
                                    onContinueWorkflow: continueWorkflow,
                                    currentSessionId: container.sessionService.currentSession?.id,
                                    currentIncludedFiles: container.sessionService.currentSession?.includedFiles ?? [],
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
            .background(Color.backgroundPrimary)
        }
        .navigationTitle("Background Jobs")
        .sheet(item: $selectedJobId) { identifiableJobId in
            JobDetailsSheet(jobId: identifiableJobId.value)
                .environmentObject(container)
        }
        .onReceive(container.sessionService.currentSessionPublisher.compactMap { $0 }) { newSession in
            selectedJobId = nil
            Task { await loadJobs() }
        }
        .overlay(
            Group {
                if showingSuccess, let message = successMessage {
                    VStack {
                        Spacer()
                        StatusAlertView(
                            variant: .success,
                            title: "Success",
                            message: message
                        )
                        .padding()
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showingSuccess)
        )
        .onAppear {
            guard let session = container.sessionService.currentSession else { return }

            // Start session-scoped sync
            container.setJobsViewActive(true)

            // CRITICAL: Do an initial full fetch of ALL jobs (not just active ones)
            // before starting session-scoped event sync that monitors active jobs
            // Only do this once per view lifecycle
            Task {
                if !hasDoneInitialLoad {
                    hasDoneInitialLoad = true
                    await loadJobs()
                }
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
        // NOTE: This function previously used listJobs which replaces all jobs.
        // Plan job IDs are now computed from the existing jobs array via planJobIdsForCurrentSession,
        // so no separate fetch is needed. The main job list already includes implementation_plan jobs.
    }

    private var planJobIdsForCurrentSession: Set<String> {
        let sid = container.sessionService.currentSession?.id
        return Set(container.jobsService.jobs
            .filter { $0.sessionId == sid && $0.taskType.hasPrefix("implementation_plan") }
            .map { $0.id })
    }

    private func loadJobs() async {
        // Gate: only fetch when session exists
        guard let currentSession = container.sessionService.currentSession else {
            return
        }

        // Determine if it's a mobile session
        let isMobileSession = currentSession.id.hasPrefix("mobile-session-")

        // Set effectiveSessionId to nil for mobile sessions, otherwise use the real session ID
        let effectiveSessionId: String? = isMobileSession ? nil : currentSession.id

        // Get projectDirectory from session or currentProject
        let projectDirectory = currentSession.projectDirectory ?? container.currentProject?.directory

        // Guard that for mobile sessions, projectDirectory must be non-empty
        if isMobileSession {
            guard let projectDir = projectDirectory, !projectDir.isEmpty else {
                return
            }
        }

        // Guard that for non-mobile sessions, at least one of effectiveSessionId or projectDirectory is non-empty
        if !isMobileSession {
            guard effectiveSessionId != nil || (projectDirectory != nil && !projectDirectory!.isEmpty) else {
                return
            }
        }

        // Show loading if we have no jobs for the CURRENT session (not just any jobs)
        let hasCachedJobsForCurrentSession = !baseFilteredJobs.isEmpty
        if !hasCachedJobsForCurrentSession {
            isLoading = true
        }

        // Capture RAW session ID for verification (not the transformed one)
        let capturedRawSessionId = currentSession.id

        let request = JobListRequest(
            projectDirectory: projectDirectory,
            sessionId: effectiveSessionId,
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

        // Calculate diff - only add files not already in selection
        let currentIncludedFiles = Set(container.sessionService.currentSession?.includedFiles ?? [])
        let newFiles = filePaths.filter { !currentIncludedFiles.contains($0) }

        // If all files already selected, show message and return
        guard !newFiles.isEmpty else {
            await MainActor.run {
                successMessage = "All files already in selection"
                showingSuccess = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    showingSuccess = false
                }
            }
            return
        }

        let fileCount = newFiles.count

        Task {
            do {
                try await container.sessionService.updateSessionFiles(
                    sessionId: sessionId,
                    addIncluded: newFiles,
                    removeIncluded: nil,
                    addExcluded: nil,
                    removeExcluded: newFiles
                )

                await MainActor.run {
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.success)

                    successMessage = "Added \(fileCount) new \(fileCount == 1 ? "file" : "files") to selection"
                    showingSuccess = true

                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        showingSuccess = false
                    }
                }
            } catch {
                await MainActor.run {
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.error)

                    errorMessage = "Failed to apply files"
                    showingError = true
                }
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
                        await MainActor.run {
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)

                            successMessage = "Research findings added to task description"
                            showingSuccess = true

                            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                                showingSuccess = false
                            }
                        }
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.error)

                    errorMessage = "Failed to apply research"
                    showingError = true
                }
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
                        await MainActor.run {
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)

                            successMessage = "Video analysis added to task description"
                            showingSuccess = true

                            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                                showingSuccess = false
                            }
                        }
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.error)

                    errorMessage = "Failed to apply video analysis"
                    showingError = true
                }
            }
        }
    }
}

// MARK: - Helper Types

struct IdentifiableString: Identifiable {
    let id = UUID()
    let value: String
}

