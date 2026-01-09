import SwiftUI
import Core
import Combine

public struct JobsMonitoringView: View {
    @EnvironmentObject private var container: AppContainer
    @ObservedObject private var jobsService: JobsDataService
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared
    @Environment(\.colorScheme) var colorScheme
    @State private var selectedJobId: IdentifiableString? = nil
    @State private var cancellingJobs = Set<String>()
    @State private var deletingJobs = Set<String>()
    @State private var errorMessage: String?
    @State private var showingError = false
    @State private var cancellables = Set<AnyCancellable>()
    @State private var successMessage: String?
    @State private var showingSuccess = false

    public init(jobsService: JobsDataService) {
        self._jobsService = ObservedObject(wrappedValue: jobsService)
    }

    // Base filtered jobs (session + job type filtering, no search)
    private var baseFilteredJobs: [BackgroundJob] {
        guard let currentSessionId = container.sessionService.currentSession?.id else {
            return []
        }

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
                // Use centralized visibility filter
                JobTypeFilters.isVisibleInJobsList(job)
            }
    }

    // Filtered jobs sorted by date with defensive deduplication
    private var filteredJobs: [BackgroundJob] {
        // Defensive dedup by job.id - prefer job with newest timestamp
        var dedupedById: [String: BackgroundJob] = [:]
        for job in baseFilteredJobs {
            if let existing = dedupedById[job.id] {
                let existingTimestamp = existing.updatedAt ?? existing.createdAt ?? 0
                let newTimestamp = job.updatedAt ?? job.createdAt ?? 0
                if newTimestamp > existingTimestamp {
                    dedupedById[job.id] = job
                }
            } else {
                dedupedById[job.id] = job
            }
        }

        return Array(dedupedById.values)
            .sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    // Whether to show inline loading indicator (when we have jobs but are refreshing)
    // Once isRefreshing is available from JobsDataService, this should use jobsService.isRefreshing
    private var showInlineLoading: Bool {
        // Show inline loading when refreshing with existing jobs
        // This should NOT cause subtree replacement - only shows a small indicator inside the list
        jobsService.isLoading && jobsService.hasLoadedOnce
    }

    // Show full loading state ONLY when:
    // 1. We haven't loaded once yet (hasLoadedOnce == false)
    // 2. AND we are currently loading
    // 3. AND the list is empty
    // This prevents full-screen loading from replacing a previously rendered list
    private var showFullLoading: Bool {
        !jobsService.hasLoadedOnce && jobsService.isLoading && filteredJobs.isEmpty
    }

    // Grouped jobs for display
    private var groupedJobs: [JobGroup] {
        groupJobsForDisplay(filteredJobs)
    }

    public var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                // Job List - View tree stability fix:
                // Only show full-screen loading before first load completes
                // Once hasLoadedOnce is true, ALWAYS render ScrollView to prevent branch-flip flicker
                if !jobsService.hasLoadedOnce && showFullLoading {
                    // Full-screen loading: only shown before first load completes
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
                } else {
                    // Once hasLoadedOnce is true, ALWAYS keep ScrollView mounted
                    // Empty state is shown INSIDE the ScrollView to prevent branch swapping
                    ScrollView {
                        LazyVStack(spacing: Theme.Spacing.cardSpacing) {
                            // Inline loading indicator when refreshing with existing jobs
                            if showInlineLoading {
                                HStack(spacing: 8) {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                    Text("Refreshing...")
                                        .font(.system(size: 13))
                                        .foregroundColor(Color.textMuted)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                            }

                            // Show empty state INSIDE the ScrollView when list is empty
                            // This keeps the container mounted and avoids branch-flip flicker
                            if filteredJobs.isEmpty && !showInlineLoading {
                                VStack(spacing: 16) {
                                    Spacer()
                                        .frame(height: 80)
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
                                        .frame(height: 80)
                                }
                                .frame(maxWidth: .infinity)
                            } else {
                                // Job list content with row transitions
                                ForEach(groupedJobs) { group in
                                    if group.workflowId != nil && group.jobs.count > 1 {
                                        // Workflow group - wrap in dashed container
                                        VStack(spacing: Theme.Spacing.cardSpacing) {
                                            ForEach(group.jobs) { job in
                                                jobCardView(for: job)
                                                    .transition(.opacity.combined(with: .move(edge: .top)))
                                            }
                                        }
                                        .padding(Theme.Spacing.sm)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: Theme.Radii.md)
                                                .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5, 3]))
                                                .foregroundColor(Color.border.opacity(0.6))
                                        )
                                    } else {
                                        // Standalone job or single-job workflow
                                        ForEach(group.jobs) { job in
                                            jobCardView(for: job)
                                                .transition(.opacity.combined(with: .move(edge: .top)))
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .padding(.top, 4)
                        // List-level animation driven by jobsVersion when available
                        // For now, animate on jobs array changes
                        .animation(.easeInOut(duration: 0.2), value: jobsService.jobs.map { $0.id })
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
            Task { await jobsService.reconcileJobs(reason: .sessionChanged) }
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

            // Trigger reconciliation to load jobs (handles dedup internally)
            Task {
                await jobsService.reconcileJobs(reason: .initialLoad)
            }

            jobsService.startSessionScopedSync(
                sessionId: session.id,
                projectDirectory: session.projectDirectory
            )
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

    // MARK: - View Builders

    @ViewBuilder
    private func jobCardView(for job: BackgroundJob) -> some View {
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
                receiveValue: { _ in }
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

