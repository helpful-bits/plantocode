import SwiftUI
import Core
import Combine

/// Simplified plan viewer for mobile - maximum reading space
public struct PlanDetailView: View {
    let plan: PlanSummary
    let allPlans: [PlanSummary]
    let plansService: PlansDataService
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
    @State private var selectedCopyButtonId: String? = nil

    @State private var cancellables = Set<AnyCancellable>()
    @FocusState private var isEditorFocused: Bool
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var isLandscape: Bool {
        return verticalSizeClass == .compact
    }

    public init(plan: PlanSummary, allPlans: [PlanSummary], plansService: PlansDataService) {
        self.plan = plan
        self.allPlans = allPlans
        self.plansService = plansService
        let index = allPlans.firstIndex { $0.jobId == plan.jobId } ?? 0
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
        .navigationTitle(currentPlan.title ?? "Implementation Plan")
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
                RemoteTerminalView(jobId: currentPlan.jobId, initialCopyButtonId: selectedCopyButtonId)
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
            loadPlanContent()
            setupRealTimeUpdates()
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
                    Text(currentPlan.formattedDate)
                        .small()
                        .foregroundColor(Color.mutedForeground)

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
                        selectedCopyButtonId = nil
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
                    get: { content },
                    set: { newValue in
                        if newValue != content {
                            hasUnsavedChanges = true
                        }
                        content = newValue
                    }
                ),
                isReadOnly: !isEditMode,
                languageHint: "markdown"
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
                            selectedCopyButtonId = nil
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

    private var currentPlan: PlanSummary {
        guard currentIndex >= 0 && currentIndex < allPlans.count else {
            return plan
        }
        return allPlans[currentIndex]
    }

    private var canGoPrevious: Bool {
        return currentIndex > 0
    }

    private var canGoNext: Bool {
        return currentIndex < allPlans.count - 1
    }

    // MARK: - Navigation

    private enum NavigationDirection {
        case previous
        case next
    }

    private func navigateToPlan(direction: NavigationDirection) {
        guard canGoPrevious || canGoNext else { return }

        let newIndex = direction == .previous ? currentIndex - 1 : currentIndex + 1
        guard newIndex >= 0 && newIndex < allPlans.count else { return }

        currentIndex = newIndex
        loadToken = UUID()
        hasUnsavedChanges = false
        isEditMode = false
        isEditorFocused = false

        // Reset cancellables
        cancellables.removeAll()
        cancellables = Set<AnyCancellable>()

        // Prefetch neighbors
        prefetchNeighbors()

        loadPlanContent()
    }

    // MARK: - Data Loading

    private func loadPlanContent() {
        let planToLoad = currentPlan
        let localToken = loadToken

        isLoading = true
        errorMessage = nil
        hasRetriedLoad = false

        plansService.getFullPlanContent(jobId: planToLoad.jobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    // Guard: only process if token matches
                    guard localToken == self.loadToken else { return }

                    self.isLoading = false
                    if case .failure(let error) = completion {
                        let errorDescription = error.localizedDescription

                        // Treat in-progress states as non-fatal
                        if errorDescription.contains("not completed") ||
                           errorDescription.contains("response is not available") ||
                           errorDescription.contains("still being generated") {
                            // Plan is still being created, wait and retry
                            self.isLoading = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                                self.loadPlanContent()
                            }
                            return
                        }

                        // Handle "Job not found" with retry
                        if errorDescription.contains("Job not found") || errorDescription.contains("Not found") {
                            if !self.hasRetriedLoad {
                                self.hasRetriedLoad = true
                                self.container.plansService.invalidateCache()
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                    self.loadPlanContent()
                                }
                                return
                            }
                            // After retry, show user-friendly message
                            self.errorMessage = "This plan no longer exists or has been deleted."
                            return
                        }

                        // Handle other errors
                        if let range = errorDescription.range(of: "message: ") {
                            let startIndex = errorDescription.index(range.upperBound, offsetBy: 0)
                            if let endRange = errorDescription[startIndex...].range(of: ")") {
                                let cleanMessage = String(errorDescription[startIndex..<endRange.lowerBound])
                                self.errorMessage = cleanMessage.replacingOccurrences(of: "AnyCodable(value: \"", with: "")
                                    .replacingOccurrences(of: "\")", with: "")
                            } else {
                                self.errorMessage = errorDescription
                            }
                        } else {
                            self.errorMessage = errorDescription
                        }
                    }
                },
                receiveValue: { planContent in
                    // Guard: only process if token matches
                    guard localToken == self.loadToken else { return }

                    self.content = planContent
                    self.isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    private func prefetchNeighbors() {
        // Prefetch previous plan
        if currentIndex > 0 {
            let prevPlan = allPlans[currentIndex - 1]
            plansService.getFullPlanContent(jobId: prevPlan.jobId)
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        }

        // Prefetch next plan
        if currentIndex < allPlans.count - 1 {
            let nextPlan = allPlans[currentIndex + 1]
            plansService.getFullPlanContent(jobId: nextPlan.jobId)
                .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        }
    }

    private func savePlan() {
        let planToSave = currentPlan

        isSaving = true
        errorMessage = nil

        Task {
            do {
                for try await result in plansService.savePlan(id: planToSave.jobId, content: content) {
                    await MainActor.run {
                        if let resultDict = result as? [String: Any],
                           let success = resultDict["success"] as? Bool, success {
                            hasUnsavedChanges = false
                        }
                    }
                }

                await MainActor.run {
                    isSaving = false
                }

            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = "Save failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func setupRealTimeUpdates() {
        container.plansService.$lastUpdateEvent
            .compactMap { $0 }
            .sink { event in
                DispatchQueue.main.async {
                    // Extract jobId from event payload
                    let eventJobId = event.data["jobId"]?.value as? String

                    switch event.eventType {
                    case "PlanModified":
                        // Reload content when this plan is modified on desktop
                        if let planJobId = eventJobId, planJobId == self.currentPlan.jobId {
                            self.loadPlanContent()
                        }

                    case "job:deleted":
                        let eventJobId = (event.data["jobId"]?.value as? String) ?? (event.data["id"]?.value as? String)
                        if eventJobId == self.currentPlan.jobId {
                            self.errorMessage = "This plan has been deleted on desktop."
                            self.content = ""
                        }

                    case "job:response-appended":
                        // Only process if matches current plan
                        guard let jobId = eventJobId, jobId == self.currentPlan.jobId else { return }

                        if let chunk = event.data["chunk"]?.value as? String {
                            self.content += chunk
                        } else {
                            self.loadPlanContent()
                        }

                    case "job:finalized":
                        // Reload on finalization
                        if let jobId = eventJobId, jobId == self.currentPlan.jobId {
                            self.loadPlanContent()
                        }

                    case "job:status-changed":
                        // Check if status is completed
                        if let jobId = eventJobId, jobId == self.currentPlan.jobId,
                           let status = event.data["status"]?.value as? String,
                           status == "completed" {
                            self.loadPlanContent()
                        }

                    default:
                        break
                    }
                }
            }
            .store(in: &cancellables)
    }
}

// MARK: - Supporting Views
// (None needed - all inline)

#Preview {
    let planJSON = """
    {
        "id": "1",
        "jobId": "job-1",
        "title": "Sample Implementation Plan",
        "filePath": "/path/to/file.swift",
        "createdAt": \(Int64(Date().timeIntervalSince1970)),
        "sizeBytes": 1024,
        "status": "completed",
        "sessionId": "session-1"
    }
    """

    guard let jsonData = planJSON.data(using: .utf8),
          let samplePlan = try? JSONDecoder().decode(PlanSummary.self, from: jsonData),
          let serverURL = URL(string: Config.serverURL) else {
        return Text("Preview data unavailable")
    }

    let allPlans = [samplePlan]
    let plansService = DataServicesManager(baseURL: serverURL, deviceId: DeviceManager.shared.getOrCreateDeviceID()).plansService

    return PlanDetailView(plan: samplePlan, allPlans: allPlans, plansService: plansService)
}