import SwiftUI
import Core
import Combine

/// Simplified plan viewer for mobile - maximum reading space
public struct PlanDetailView: View {
    let jobId: String
    let allPlanJobIds: [String]
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    @State private var content: String = ""
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var currentIndex: Int
    @State private var showingTerminal = false
    @State private var hasUnsavedChanges = false
    @State private var showingSaveConfirmation = false
    @State private var hasRetriedLoad = false
    @State private var loadToken = UUID()
    @State private var isEditMode = false
    @State private var retryTask: Task<Void, Never>?

    @State private var cancellables = Set<AnyCancellable>()
    @FocusState private var isEditorFocused: Bool
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isLandscape: Bool {
        return verticalSizeClass == .compact
    }

    private var jobsService: JobsDataService {
        return container.jobsService
    }

    private var observedJob: BackgroundJob? {
        container.jobsService.jobs.first(where: { $0.id == currentJobId })
    }

    private var isStreaming: Bool {
        let status = observedJob?.status.lowercased() ?? ""
        if status == "running" || status == "processingstream" { return true }
        if let job = observedJob,
           let md = job.metadata,
           let data = md.data(using: .utf8),
           let dict = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
           let taskData = dict["taskData"] as? [String: Any],
           let flag = taskData["isStreaming"] as? Bool, flag { return true }
        return false
    }

    public init(jobId: String, allPlanJobIds: [String]) {
        self.jobId = jobId
        self.allPlanJobIds = allPlanJobIds
        let index = allPlanJobIds.firstIndex(of: jobId) ?? 0
        self._currentIndex = State(initialValue: index)
    }

    public var body: some View {
        ZStack {
            Color.background.ignoresSafeArea()

            if isLoading {
                loadingView()
            } else if let error = errorMessage {
                errorView(message: error)
            } else {
                editorView()
            }
        }
        .navigationTitle(
            PlanContentParser.extractPlanTitle(metadata: observedJob?.metadata, response: observedJob?.response)
            ?? observedJob?.taskType
            ?? "Implementation Plan"
        )
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarHidden(isLandscape)
        .statusBarHidden(isLandscape)
        .toolbar {
            // Save button (only if changes)
            if hasUnsavedChanges {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        savePlan()
                    } label: {
                        if isSaving {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "checkmark")
                        }
                    }
                    .disabled(isSaving)
                }
            }
        }
        .sheet(isPresented: $showingTerminal) {
            NavigationStack {
                RemoteTerminalView(jobId: currentJobId)
            }
        }
        .alert("Unsaved Changes", isPresented: $showingSaveConfirmation) {
            Button("Discard", role: .destructive) {
                dismiss()
            }
            Button("Save") {
                savePlan()
                dismiss()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("You have unsaved changes. What would you like to do?")
        }
        .task {
            if let dir = container.sessionService.currentSession?.projectDirectory, !dir.isEmpty {
                try? await container.settingsService.fetchProjectTaskModelSettings(projectDirectory: dir)
            }
        }
        .onAppear {
            container.jobsService.setViewedImplementationPlanId(currentJobId)
            hydrateJob()
            loadPlanContent()
        }
        .onDisappear {
            container.jobsService.setViewedImplementationPlanId(nil)
            retryTask?.cancel()
            retryTask = nil
        }
    }

    // MARK: - Loading & Error Views

    @ViewBuilder
    private func loadingView() -> some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                .scaleEffect(1.2)

            Text("Loading plan content...")
                .paragraph()
                .foregroundColor(Color.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.background)
    }

    @ViewBuilder
    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Spacer()

            StatusAlertView(
                variant: .destructive,
                title: "Error Loading Plan",
                message: message
            )
            .padding()

            Button("Retry") {
                loadPlanContent()
            }
            .buttonStyle(PrimaryButtonStyle())

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.appBackground)
    }

    // MARK: - Editor View

    @ViewBuilder
    private func editorView() -> some View {
        VStack(spacing: 0) {
            // Minimal status bar with navigation (hidden in landscape for max space)
            if !isLandscape {
                HStack(spacing: 0) {
                    if let createdAt = observedJob?.createdAt {
                        Text(formatDate(createdAt))
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }

                    // Merged marker
                    if observedJob?.taskType == "implementation_plan_merge" {
                        Text("Merged")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.15))
                            .foregroundColor(.secondary)
                            .clipShape(Capsule())
                            .padding(.leading, 8)
                    }

                    Spacer()

                    // Edit mode toggle
                    Button {
                        isEditMode.toggle()
                        if !isEditMode {
                            isEditorFocused = false
                        }
                    } label: {
                        Image(systemName: isEditMode ? "pencil.circle.fill" : "pencil.circle")
                            .font(.title3)
                            .foregroundColor(Color.primary)
                    }

                    Spacer()
                        .frame(width: 24)

                    // Previous plan
                    Button {
                        navigateToPlan(direction: .previous)
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.title3)
                            .foregroundColor(canGoPrevious ? Color.primary : Color.mutedForeground)
                    }
                    .disabled(!canGoPrevious)

                    Spacer()
                        .frame(width: 24)

                    // Next plan
                    Button {
                        navigateToPlan(direction: .next)
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.title3)
                            .foregroundColor(canGoNext ? Color.primary : Color.mutedForeground)
                    }
                    .disabled(!canGoNext)

                    Spacer()
                        .frame(width: 40)

                    // Terminal button - launch directly
                    Button {
                        showingTerminal = true
                    } label: {
                        Image(systemName: "terminal")
                            .font(.title3)
                            .foregroundColor(Color.primary)
                    }
                }
                .padding(.horizontal)
                .padding(.top, 4)
                .padding(.bottom, 8)
                .background(Color.card)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(Color.border),
                    alignment: .bottom
                )
            }

            // Maximum space for editor
            PlanRunestoneEditorView(
                text: Binding(
                    get: { observedJob?.response ?? content },
                    set: { newValue in
                        if !isStreaming && newValue != content {
                            hasUnsavedChanges = true
                        }
                        content = newValue
                    }
                ),
                isReadOnly: isStreaming || !isEditMode,
                languageHint: "xml"
            )
            .focused($isEditorFocused)
            .ignoresSafeArea(.keyboard)
            .background(Color.codeBackground)

            // Keyboard toolbar (when keyboard is visible) - compact in landscape
            if isEditorFocused {
                HStack(spacing: 0) {
                    // In landscape, add navigation controls here since they're hidden above
                    if isLandscape {
                        // Edit mode toggle
                        Button {
                            isEditMode.toggle()
                            if !isEditMode {
                                isEditorFocused = false
                            }
                        } label: {
                            Image(systemName: isEditMode ? "pencil.circle.fill" : "pencil.circle")
                                .font(.title3)
                        }

                        Spacer()
                            .frame(width: 24)

                        Button {
                            navigateToPlan(direction: .previous)
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.title3)
                        }
                        .disabled(!canGoPrevious)

                        Spacer()
                            .frame(width: 24)

                        Button {
                            navigateToPlan(direction: .next)
                        } label: {
                            Image(systemName: "chevron.right")
                                .font(.title3)
                        }
                        .disabled(!canGoNext)

                        Spacer()
                            .frame(width: 40)

                        Button {
                            showingTerminal = true
                        } label: {
                            Image(systemName: "terminal")
                                .font(.title3)
                        }
                    }

                    Spacer()

                    Button("Done") {
                        isEditorFocused = false
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                .padding(.horizontal)
                .padding(.vertical, isLandscape ? 4 : 8)
                .background(Color.card)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(Color.border),
                    alignment: .top
                )
            }
        }
    }


    // MARK: - Computed Properties

    private var currentJobId: String {
        guard currentIndex >= 0 && currentIndex < allPlanJobIds.count else {
            return jobId
        }
        return allPlanJobIds[currentIndex]
    }

    private var canGoPrevious: Bool {
        return currentIndex > 0
    }

    private var canGoNext: Bool {
        return currentIndex < allPlanJobIds.count - 1
    }

    private func formatDate(_ timestamp: Int64) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000)
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    // MARK: - Navigation

    private enum NavigationDirection {
        case previous
        case next
    }

    private func navigateToPlan(direction: NavigationDirection) {
        guard canGoPrevious || canGoNext else { return }

        let newIndex = direction == .previous ? currentIndex - 1 : currentIndex + 1
        guard newIndex >= 0 && newIndex < allPlanJobIds.count else { return }

        // Cancel any pending retry tasks
        retryTask?.cancel()
        retryTask = nil

        currentIndex = newIndex
        container.jobsService.setViewedImplementationPlanId(currentJobId)
        loadToken = UUID()
        hasUnsavedChanges = false
        isEditMode = false
        isEditorFocused = false

        // Hydrate job for streaming content
        hydrateJob()

        loadPlanContent()
    }

    // MARK: - Data Loading

    private func loadPlanContent() {
        let localToken = loadToken

        // Cancel any pending retry tasks
        retryTask?.cancel()
        retryTask = nil

        // Streaming-aware logic
        if let job = observedJob {
            if job.status == "active" || job.status == "queued" {
                // Job is currently generating
                if let response = job.response, !response.isEmpty {
                    // We have streaming content, use it
                    content = response
                    isLoading = false
                    errorMessage = nil
                    return
                } else {
                    // Active but no response yet, schedule retry
                    isLoading = true
                    retryTask = Task {
                        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
                        await MainActor.run {
                            guard localToken == self.loadToken else { return }
                            self.loadPlanContent()
                        }
                    }
                    return
                }
            }
        }

        // Job is completed/failed or not found - fetch full content
        isLoading = true
        errorMessage = nil
        hasRetriedLoad = false

        jobsService.getJobFast(jobId: currentJobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    guard localToken == self.loadToken else { return }

                    self.isLoading = false
                    if case .failure(let error) = completion {
                        let errorDescription = error.localizedDescription

                        // Handle "Job not found" with retry
                        if errorDescription.contains("Job not found") || errorDescription.contains("Not found") {
                            if !self.hasRetriedLoad {
                                self.hasRetriedLoad = true
                                self.retryTask = Task {
                                    try? await Task.sleep(nanoseconds: 200_000_000) // 0.2 seconds
                                    await MainActor.run {
                                        guard localToken == self.loadToken else { return }
                                        self.loadPlanContent()
                                    }
                                }
                                return
                            }
                            self.errorMessage = "This plan no longer exists or has been deleted."
                            return
                        }

                        self.errorMessage = errorDescription
                    }
                },
                receiveValue: { job in
                    guard localToken == self.loadToken else { return }

                    self.content = job.response ?? ""
                    self.isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    private func savePlan() {
        isSaving = true
        errorMessage = nil

        Task {
            do {
                for try await _ in jobsService.updateJobContent(jobId: currentJobId, newContent: content) {
                    // Consume stream
                }
                await MainActor.run {
                    self.isSaving = false
                    self.hasUnsavedChanges = false
                }
            } catch {
                await MainActor.run {
                    self.isSaving = false
                    self.errorMessage = "Save failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func hydrateJob() {
        // Check if job is already present in jobsService
        if jobsService.jobs.contains(where: { $0.id == currentJobId }) {
            return
        }

        // Fetch job to populate jobsService.jobs array
        jobsService.getJobFast(jobId: currentJobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        // Don't set error here, let loadPlanContent handle it
                        print("Failed to hydrate job: \(error.localizedDescription)")
                    }
                },
                receiveValue: { _ in
                    // Job is now in jobsService.jobs, observedJob computed property will pick it up
                }
            )
            .store(in: &cancellables)
    }

}

// MARK: - Supporting Views
// (None needed - all inline)

#Preview {
    let jobId = "job-1"
    let allPlanJobIds = ["job-1", "job-2", "job-3"]

    PlanDetailView(jobId: jobId, allPlanJobIds: allPlanJobIds)
        .environmentObject(AppContainer.preview)
}