import SwiftUI
import Core
import Combine
import OSLog

public struct ImplementationPlansView: View {
    @EnvironmentObject private var container: AppContainer
    @ObservedObject var jobsService: JobsDataService
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @StateObject private var planCreatorViewModel = ImplementationPlanCreatorViewModel()
    @ObservedObject private var appState = AppState.shared
    @State private var selectedPlanJobIdForNav: String? = nil
    @State private var selectedPlans: Set<String> = []
    @State private var mergeInstructions = ""
    @State private var showMergeInstructionsCompose = false
    @State private var isMerging = false
    @State private var currentPlanIndex = 0
    @State private var showingPromptPreview = false
    @State private var refreshTrigger = UUID()
    @State private var deletingPlans = Set<String>()
    @State private var cancellables = Set<AnyCancellable>()

    // Terminal launch states
    @State private var showTerminal = false
    @State private var terminalJobId: String? = nil
    @State private var showDeviceSelector = false

    public var currentTaskDescription: String?

    public init(jobsService: JobsDataService, currentTaskDescription: String? = nil) {
        self.jobsService = jobsService
        self.currentTaskDescription = currentTaskDescription
    }

    private var sanitizedMergeInstructions: String? {
        let trimmed = mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // Computed properties for reactive data from JobsDataService
    private var plans: [PlanSummary] {
        // Get active session ID
        guard let activeSessionId = container.sessionService.currentSession?.id else {
            return []
        }

        // Determine whether to filter by session
        let shouldFilterBySession = !activeSessionId.starts(with: "mobile-session-")

        // Filter jobs
        let filteredJobs = jobsService.jobs.filter { job in
            // Must be implementation_plan or implementation_plan_merge
            guard job.taskType == "implementation_plan" || job.taskType == "implementation_plan_merge" else {
                return false
            }

            // If shouldFilterBySession is true, also filter by sessionId
            if shouldFilterBySession {
                return job.sessionId == activeSessionId
            }

            return true
        }

        // Map to PlanSummary and sort by updatedAt/createdAt descending
        return filteredJobs
            .map(PlanSummary.init(from:))
            .sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    private var isLoading: Bool {
        jobsService.isLoading && !jobsService.hasLoadedOnce
    }

    private var errorMessage: String? {
        planCreatorViewModel.localErrorMessage ?? jobsService.error?.localizedDescription
    }

    private var allPlanJobIds: [String] {
        plans.map { $0.jobId }
    }

    // MARK: - Action Bar Section
    @ViewBuilder
    private var actionBarSection: some View {
        VStack(spacing: Theme.Spacing.sectionSpacing) {
            // Token Estimation Display
            if canCreatePlan, let tokens = planCreatorViewModel.estimatedTokens {
                tokenEstimationView(tokens: tokens)
            }

            // Model Selector
            modelSelectorView

            // Toggles Section
            if canCreatePlan {
                togglesSection

                // Web Search Warning
                if planCreatorViewModel.enableWebSearch && planCreatorViewModel.isOpenAIModel {
                    webSearchWarningView
                }
            }

            // Create Plan Button
            createPlanButton

            // Loading Indicator
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }
        }
        .padding()
        .background(Color.surfaceSecondary)
    }

    @ViewBuilder
    private func tokenEstimationView(tokens: Int) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "number.square")
                .font(.footnote)
                .foregroundColor(Color.primary.opacity(0.7))

            Text("Estimated tokens: ")
                .font(.footnote)
                .foregroundColor(Color.primary.opacity(0.7))

            Text("\(tokens)")
                .font(.footnote)
                .fontWeight(.medium)
                .foregroundColor(planCreatorViewModel.tokenCountColor(tokens))

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(Color.input)
        .cornerRadius(Theme.Radii.md)
    }

    @ViewBuilder
    private var modelSelectorView: some View {
        if planCreatorViewModel.isLoadingModels {
            HStack(spacing: Theme.Spacing.xs) {
                ProgressView()
                    .scaleEffect(0.6)
                Text("Loading models...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.itemSpacing)
            .background(Color.input)
            .cornerRadius(Theme.Radii.base)
        } else if planCreatorViewModel.availableModelInfos.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                ModelSelectorToggle(
                    models: planCreatorViewModel.availableModelInfos,
                    selectedModelId: planCreatorViewModel.selectedModel,
                    onSelect: { modelId in
                        planCreatorViewModel.saveModelPreference(modelId)
                    }
                )
                .padding(.horizontal, 2)
            }
            .frame(maxHeight: 32)
        }
    }

    @ViewBuilder
    private var togglesSection: some View {
        VStack(spacing: Theme.Spacing.sm) {
            // Web Search Toggle
            if planCreatorViewModel.isOpenAIModel {
                Toggle(isOn: $planCreatorViewModel.enableWebSearch) {
                    HStack(spacing: Theme.Spacing.itemSpacing) {
                        Image(systemName: "globe")
                            .font(.footnote)
                            .foregroundColor(Color.primary.opacity(0.6))
                        Text("Web Search")
                            .font(.subheadline)
                            .foregroundColor(Color.primary)
                        Spacer()
                    }
                }
                .toggleStyle(SwitchToggleStyle(tint: Color.primary))
                .onChange(of: planCreatorViewModel.enableWebSearch) { _ in
                    planCreatorViewModel.requestTokenEstimation()
                }
            }

            // Project Structure Toggle
            Toggle(isOn: $planCreatorViewModel.includeProjectStructure) {
                HStack(spacing: Theme.Spacing.itemSpacing) {
                    Image(systemName: "folder.badge.gearshape")
                        .font(.footnote)
                        .foregroundColor(Color.primary.opacity(0.6))
                    Text("Include Project Tree")
                        .font(.subheadline)
                        .foregroundColor(Color.primary)
                    Spacer()
                }
            }
            .toggleStyle(SwitchToggleStyle(tint: Color.primary))
            .onChange(of: planCreatorViewModel.includeProjectStructure) { _ in
                planCreatorViewModel.requestTokenEstimation()
            }
        }
    }

    @ViewBuilder
    private var webSearchWarningView: some View {
        HStack(spacing: Theme.Spacing.itemSpacing) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundColor(Color.orange)
            Text("Web search will increase token usage by 3-10x")
                .font(.footnote)
                .foregroundColor(Color.primary)
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.cardSpacing)
        .padding(.vertical, Theme.Spacing.itemSpacing)
        .background(Color.warning.opacity(0.15))
        .cornerRadius(Theme.Radii.sm)
    }

    @ViewBuilder
    private var createPlanButton: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Button(action: { planCreatorViewModel.createPlan() }) {
                HStack {
                    Image(systemName: "sparkles")
                    Text("Create Implementation Plan")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canCreatePlan || planCreatorViewModel.isCreatingPlan)

            // Hint text when button is disabled
            if let hintText = createPlanHintText {
                Text(hintText)
                    .font(.footnote)
                    .foregroundColor(Color.mutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Theme.Spacing.md)
            }
        }
    }

    public var body: some View {
        // Force view dependency on refresh trigger
        let _ = refreshTrigger

        VStack(spacing: 0) {
            actionBarSection

            Divider()

            // Content Area
            // STEP 11: Restructured to prioritize showing existing plans
            // Show plans list if available
            if !plans.isEmpty {
                VStack(spacing: 0) {
                    // Show error as non-blocking banner if present
                    if let errorMessage = errorMessage {
                        StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                            .padding(.horizontal)
                            .padding(.top, Theme.Spacing.sm)
                            .padding(.bottom, Theme.Spacing.xs)
                    }

                    ScrollView {
                        LazyVStack(spacing: Theme.Spacing.cardSpacing) {
                            // Show all plans (grouped by session but without visual headers)
                            ForEach(Array(groupedPlans.keys.sorted()), id: \.self) { sessionId in
                                let sessionPlans: [PlanSummary] = groupedPlans[sessionId] ?? []
                                ForEach(sessionPlans, id: \.id) { plan in
                                    planItem(for: plan)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .padding(.top, 4)
                    }
                    .background(Color.backgroundPrimary)
                    .refreshable {
                        // STEP 13: Manual refresh affordance
                        await refreshPlans()
                    }

                    // Merge Section
                    if selectedPlans.count > 1 {
                        VStack(spacing: Theme.Spacing.md) {
                            Divider()

                            VStack(spacing: Theme.Spacing.md) {
                                // Tappable merge instructions preview
                                Button(action: { showMergeInstructionsCompose = true }) {
                                    HStack(spacing: Theme.Spacing.sm) {
                                        Image(systemName: "note.text")
                                            .font(.system(size: 14))
                                            .foregroundColor(Color.primary)

                                        if mergeInstructions.isEmpty {
                                            Text("Add merge instructions (optional)...")
                                                .small()
                                                .foregroundColor(Color.mutedForeground)
                                        } else {
                                            Text(mergeInstructions)
                                                .small()
                                                .foregroundColor(Color.foreground)
                                                .lineLimit(2)
                                        }

                                        Spacer()

                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 12))
                                            .foregroundColor(Color.mutedForeground)
                                    }
                                    .padding(Theme.Spacing.md)
                                    .background(Color.input)
                                    .cornerRadius(Theme.Radii.base)
                                }
                                .buttonStyle(PlainButtonStyle())

                                Button(action: mergePlans) {
                                    HStack {
                                        if isMerging {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                                .scaleEffect(0.7)
                                        } else {
                                            Image(systemName: "arrow.triangle.merge")
                                        }
                                        Text("Merge \(selectedPlans.count) Plans")
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(PrimaryButtonStyle())
                                .disabled(isMerging)
                            }
                            .padding()
                            .background(Color.card)
                        }
                    }
                }
            }
            // Show loading view only if loading AND no plans yet
            else if isLoading {
                VStack {
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                        .scaleEffect(0.8)
                    Text("Loading plans...")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .padding(.top, Theme.Spacing.sm)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.backgroundPrimary)
            }
            // Show error message only if no plans and not loading
            else if let errorMessage = errorMessage {
                VStack {
                    Spacer()
                    StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                        .padding()
                    Text("JobsDataService will automatically retry")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.backgroundPrimary)
            }
            // Empty State (no plans, not loading, no error)
            else {
                VStack(spacing: 20) {
                    Spacer()

                    VStack(spacing: Theme.Spacing.md) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 48))
                            .foregroundColor(Color.mutedForeground)

                        Text("No Implementation Plans")
                            .h3()
                            .foregroundColor(Color.primary)

                        Text("Implementation plans will appear here once you create some tasks.")
                            .paragraph()
                            .foregroundColor(Color.mutedForeground)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }

                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.backgroundPrimary)
            }
        }
        .sheet(isPresented: $showingPromptPreview) {
            if let prompt = planCreatorViewModel.promptContent {
                PromptPreviewSheet(
                    prompt: prompt,
                    onCopy: {
                        UIPasteboard.general.string = prompt
                    }
                )
            }
        }
        .sheet(isPresented: $showDeviceSelector) {
            DeviceSelectionView()
        }
        .sheet(isPresented: $showTerminal) {
            if let jobId = terminalJobId {
                NavigationStack {
                    RemoteTerminalView(jobId: jobId)
                }
            }
        }
        .sheet(isPresented: $showMergeInstructionsCompose) {
            MergeInstructionsComposeView(
                mergeInstructions: $mergeInstructions,
                selectedPlanCount: selectedPlans.count
            )
        }
        .refreshable {
            // JobsDataService handles automatic refresh via reactive updates
        }
        .onReceive(appState.$pendingPlanJobIdToOpen) { jobId in
            guard let jobId else { return }
            // Open the plan if it exists in our list
            if plans.contains(where: { $0.jobId == jobId }) {
                selectedPlanJobIdForNav = jobId
                appState.setPendingPlanToOpen(nil)
            }
        }
        .task(id: container.sessionService.currentSession?.id) {
            // Session-scoped sync pattern
            guard isConnected, let session = container.sessionService.currentSession else {
                return
            }

            // Set active session and start session-scoped sync
            container.jobsService.setActiveSession(sessionId: session.id, projectDirectory: session.projectDirectory)
            container.jobsService.startSessionScopedSync(sessionId: session.id, projectDirectory: session.projectDirectory)

            // Load model settings when session changes
            planCreatorViewModel.loadModelSettings()
        }
        .onReceive(multiConnectionManager.$connectionStates) { states in
            guard let activeId = multiConnectionManager.activeDeviceId,
                  let state = states[activeId] else { return }

            if state.isConnected {
                planCreatorViewModel.loadModelSettings()
            }
        }
        .onReceive(container.jobsService.$jobs) { _ in
            refreshTrigger = UUID()
        }
        .onReceive(container.sessionService.currentSessionPublisher) { session in
            if session != nil {
                refreshTrigger = UUID()
                if let session = session {
                    container.jobsService.setActiveSession(sessionId: session.id, projectDirectory: session.projectDirectory)
                    container.jobsService.startSessionScopedSync(sessionId: session.id, projectDirectory: session.projectDirectory)
                }
                planCreatorViewModel.loadModelSettings()
            }
        }
        .onAppear {
            // Set view active state
            container.setJobsViewActive(true)

            // Seed sync if already connected and session exists
            if isConnected, let session = container.sessionService.currentSession {
                container.jobsService.setActiveSession(sessionId: session.id, projectDirectory: session.projectDirectory)
                container.jobsService.startSessionScopedSync(sessionId: session.id, projectDirectory: session.projectDirectory)
            }

            planCreatorViewModel.setup(container: container, currentTaskDescription: currentTaskDescription)
            planCreatorViewModel.requestTokenEstimation()
        }
        .onDisappear {
            container.setJobsViewActive(false)
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            planCreatorViewModel.invalidateModelCache()
            planCreatorViewModel.loadModelSettings()
        }
    }

    private var isConnected: Bool {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let state = multiConnectionManager.connectionStates[deviceId] else {
            return false
        }
        return state.isConnected
    }

    private var canCreatePlan: Bool {
        guard let session = container.sessionService.currentSession else {
            return false
        }

        let hasProjectDirectory = !session.projectDirectory.isEmpty
        let rawTask = (currentTaskDescription ?? session.taskDescription) ?? ""
        let hasTaskDescription = !rawTask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasFiles = !session.includedFiles.isEmpty

        return hasProjectDirectory && hasTaskDescription && hasFiles
    }

    private var createPlanHintText: String? {
        guard let session = container.sessionService.currentSession else {
            return nil
        }

        let rawTask = (currentTaskDescription ?? session.taskDescription) ?? ""
        let hasTaskDescription = !rawTask.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasFiles = !session.includedFiles.isEmpty

        // If button is enabled, no hint needed
        if hasTaskDescription && hasFiles {
            return nil
        }

        // Generate hint based on what's missing
        var missingItems: [String] = []
        if !hasFiles {
            missingItems.append("select files")
        }
        if !hasTaskDescription {
            missingItems.append("define a task")
        }

        if missingItems.isEmpty {
            return nil
        }

        return "Please " + missingItems.joined(separator: " and ")
    }



    // STEP 13: Manual refresh function for pull-to-refresh
    private func refreshPlans() async {
        guard let session = container.sessionService.currentSession else {
            return
        }

        // Trigger a refresh by calling the jobs service to reload jobs
        await jobsService.refreshActiveJobs()
    }

    private func mergePlans() {
        guard selectedPlans.count > 1 else {
            return
        }

        Task {
            await executeMergePlans()
        }
    }

    private func executeMergePlans() async {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            await MainActor.run {
                planCreatorViewModel.localErrorMessage = "No active device connection"
            }
            return
        }

        await MainActor.run {
            isMerging = true
        }

        guard let currentSessionId = container.sessionService.currentSession?.id else {
            await MainActor.run {
                isMerging = false
            }
            return
        }

        do {
            var mergeResult: [String: Any]?

            for try await response in CommandRouter.plansMerge(
                sessionId: currentSessionId,
                sourceJobIds: Array(selectedPlans),
                mergeInstructions: sanitizedMergeInstructions ?? ""
            ) {
                if let error = response.error {
                    await MainActor.run {
                        isMerging = false
                    }
                    return
                }

                if let result = response.result?.value as? [String: Any] {
                    mergeResult = result
                    if response.isFinal {
                        break
                    }
                }
            }

            await MainActor.run {
                isMerging = false
                if let result = mergeResult {
                    if let _ = result["jobId"] as? String {
                        selectedPlans.removeAll()
                        mergeInstructions = ""
                    }
                }
            }

        } catch {
            await MainActor.run {
                isMerging = false
            }
        }
    }

    private func previousPlan() {
        if currentPlanIndex > 0 {
            currentPlanIndex -= 1
        }
    }

    private func nextPlan() {
        if currentPlanIndex < plans.count - 1 {
            currentPlanIndex += 1
        }
    }

    private var groupedPlans: [String: [PlanSummary]] {
        Dictionary(grouping: plans) { plan in
            plan.sessionId
        }
    }


    private func openTerminal(for planJobId: String) {
        if multiConnectionManager.activeDeviceId != nil {
            terminalJobId = planJobId
            showTerminal = true
        } else {
            showDeviceSelector = true
        }
    }

    // MARK: - Helper Methods for Plan Items

    @ViewBuilder
    private func planItem(for plan: PlanSummary) -> some View {
        let isSelected = selectedPlans.contains(plan.jobId)
        NavigationLink(
            tag: plan.jobId,
            selection: $selectedPlanJobIdForNav
        ) {
            PlanDetailView(jobId: plan.jobId, allPlanJobIds: allPlanJobIds)
        } label: {
            PlanCard(
                plan: plan,
                isSelected: isSelected,
                onSelectionChanged: { newValue in
                    if newValue {
                        selectedPlans.insert(plan.jobId)
                    } else {
                        selectedPlans.remove(plan.jobId)
                    }
                },
                onTap: {
                    // Trigger navigation by setting the selected plan
                    selectedPlanJobIdForNav = plan.jobId
                },
                onDelete: {
                    await deletePlanAsync(plan)
                },
                currentSessionId: container.sessionService.currentSession?.id
            )
        }
        .buttonStyle(PlainButtonStyle())
        .contextMenu {
            planItemContextMenu(for: plan)
        }
    }

    private func deletePlanAsync(_ plan: PlanSummary) async {
        guard !deletingPlans.contains(plan.id) else { return }
        deletingPlans.insert(plan.id)

        await MainActor.run {
            container.jobsService.deleteJob(jobId: plan.jobId)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        self.deletingPlans.remove(plan.id)
                        if case .failure(let error) = completion {
                            self.planCreatorViewModel.localErrorMessage = error.localizedDescription
                        }
                    },
                    receiveValue: { _ in
                        // Job deleted successfully
                    }
                )
                .store(in: &self.cancellables)
        }
    }

    @ViewBuilder
    private func planItemContextMenu(for plan: PlanSummary) -> some View {
        Button {
            openTerminal(for: plan.jobId)
        } label: {
            Label("Open Terminal", systemImage: "terminal.fill")
        }

        Divider()

        Button(role: .destructive) {
            guard !deletingPlans.contains(plan.id) else { return }
            deletingPlans.insert(plan.id)
            deletePlan(plan)
        } label: {
            Text("Delete")
        }
        .disabled(deletingPlans.contains(plan.id))
    }

    private func deletePlan(_ plan: PlanSummary) {
        container.jobsService.deleteJob(jobId: plan.jobId)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    self.deletingPlans.remove(plan.id)
                    if case .failure(let error) = completion {
                        self.planCreatorViewModel.localErrorMessage = error.localizedDescription
                    }
                },
                receiveValue: { _ in
                    // Job deleted successfully
                }
            )
            .store(in: &cancellables)
    }
}

private struct PlanCard: View {
    let plan: PlanSummary
    let isSelected: Bool
    let onSelectionChanged: (Bool) -> Void
    let onTap: () -> Void
    let onDelete: (() async -> Void)?
    let currentSessionId: String?

    @State private var progress: Double = 0
    @State private var progressTimer: Timer?
    @State private var isDeleting = false
    @State private var planStartTime: Date?

    private var isCurrentSession: Bool {
        currentSessionId != nil && plan.sessionId == currentSessionId
    }

    private var statusColor: Color {
        switch plan.statusColor {
        case "green": return .green
        case "red": return .red
        case "orange": return .orange
        case "blue": return .blue
        case "purple": return .purple
        default: return .gray
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // SECTION 1: Header with checkbox spanning title and model
            HStack(alignment: .top, spacing: Theme.Spacing.cardSpacing) {
                // Selection Checkbox (aligned with title text)
                Button(action: {
                    onSelectionChanged(!isSelected)
                }) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 24))
                        .foregroundColor(isSelected ? Color.primary : Color.primary.opacity(0.3))
                }
                .buttonStyle(PlainButtonStyle())
                .padding(.top, 2)

                // Plan Content (title, badges, model)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    // Title with inline status icon (part of text flow)
                    (Text(Image(systemName: plan.statusIcon))
                        .foregroundColor(statusColor)
                        .font(.system(size: 14))
                     + Text("  ")
                     + Text(plan.title ?? "Untitled Plan"))
                        .largeText()
                        .foregroundColor(Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: Theme.Spacing.itemSpacing) {
                        // Merged Badge
                        if plan.taskType == "implementation_plan_merge" {
                            HStack(spacing: 3) {
                                Image(systemName: "arrow.triangle.merge")
                                    .font(.system(size: 9))
                                Text("Merged")
                            }
                            .small()
                            .fontWeight(.medium)
                            .foregroundColor(Color.infoForeground)
                            .padding(.horizontal, Theme.Spacing.sm)
                            .padding(.vertical, 3)
                            .background(Color.infoBackground)
                            .cornerRadius(Theme.Radii.sm)
                        }

                        // Time Ago
                        Text(plan.formattedTimeAgo)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }

                    // Model and Tokens Row (aligned with title)
                    if (plan.tokensSent ?? 0 > 0 || plan.tokensReceived ?? 0 > 0) || plan.modelDisplayName != nil {
                        HStack(spacing: Theme.Spacing.sm) {
                            // Model
                            if let model = plan.modelDisplayName, !model.isEmpty {
                                Text(model)
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                                    .lineLimit(1)
                            }

                            Spacer()

                            // Token counts
                            if plan.tokensSent ?? 0 > 0 || plan.tokensReceived ?? 0 > 0 {
                                HStack(spacing: 3) {
                                    Text(plan.formatTokenCount(plan.tokensSent))
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(Color.secondaryForeground)
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 9))
                                        .foregroundColor(Color.mutedForeground)
                                    Text(plan.formatTokenCount(plan.tokensReceived))
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(Color.secondaryForeground)
                                }
                            }
                        }
                    }
                }

                Spacer()

                // Delete Button (aligned with title text)
                if let onDelete = onDelete {
                    Button {
                        Task {
                            isDeleting = true
                            await onDelete()
                            isDeleting = false
                        }
                    } label: {
                        if isDeleting {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "trash")
                                .font(.system(size: 12, weight: .medium))
                        }
                    }
                    .frame(width: 28, height: 28)
                    .foregroundColor(Color.mutedForeground)
                    .disabled(isDeleting)
                    .padding(.top, 5)
                }
            }
            .padding(.horizontal, Theme.Spacing.cardPadding)
            .padding(.top, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.cardSpacing)

            // SECTION 2: Progress Bar (if executing)
            if plan.isExecuting {
                VStack(spacing: Theme.Spacing.itemSpacing) {
                    if let progressPct = plan.executionStatus?.progressPercentage, progressPct > 0 {
                        ProgressView(value: Double(progressPct), total: 100)
                            .tint(statusColor)
                            .frame(maxWidth: .infinity)
                            .frame(height: 4)
                            .padding(.horizontal, Theme.Spacing.cardPadding)

                        HStack(alignment: .center) {
                            if let step = plan.executionStatus?.currentStep {
                                Text(step)
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Text("\(Int(progressPct))%")
                                .small()
                                .fontWeight(.medium)
                                .foregroundColor(Color.mutedForeground)
                        }
                        .padding(.horizontal, Theme.Spacing.cardPadding)
                    } else {
                        ProgressView(value: progress, total: 1.0)
                            .tint(statusColor)
                            .frame(maxWidth: .infinity)
                            .frame(height: 4)
                            .padding(.horizontal, Theme.Spacing.cardPadding)
                            .onAppear { startProgressAnimation() }
                            .onDisappear { stopProgressAnimation() }

                        if let step = plan.executionStatus?.currentStep {
                            Text(step)
                                .small()
                                .foregroundColor(Color.mutedForeground)
                                .lineLimit(1)
                                .padding(.horizontal, Theme.Spacing.cardPadding)
                        }
                    }
                }
                .padding(.bottom, Theme.Spacing.sm)
            }

            // SECTION 4: Bottom Info (file path only)
            if let filePath = plan.filePath {
                VStack(alignment: .leading, spacing: Theme.Spacing.cardSpacing) {
                    Text(filePath)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .padding(.horizontal, Theme.Spacing.cardPadding)
                .padding(.vertical, Theme.Spacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.muted)
            }
        }
        .selectableCard(
            isSelected: isSelected,
            isCurrentContext: isCurrentSession
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onTap()
        }
        .onAppear {
            if plan.isExecuting {
                startProgressAnimation()
            }
        }
        .onDisappear {
            progressTimer?.invalidate()
        }
    }

    private func getEstimatedDuration() -> TimeInterval {
        let taskDurations: [String: TimeInterval] = [
            "implementation_plan": 90,
            "implementation_plan_merge": 90,
        ]
        return taskDurations[plan.taskType] ?? 90
    }

    private func startProgressAnimation() {
        if planStartTime == nil {
            planStartTime = Date(timeIntervalSince1970: TimeInterval(plan.createdAt) / 1000.0)
        }

        progress = 0
        progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            guard let startTime = planStartTime else { return }

            let elapsed = Date().timeIntervalSince(startTime)
            let estimatedDuration = getEstimatedDuration()
            let calculatedProgress = min(0.90, elapsed / estimatedDuration)

            withAnimation(.linear(duration: 1.0)) {
                progress = calculatedProgress
            }
        }
    }

    private func stopProgressAnimation() {
        progressTimer?.invalidate()
        progressTimer = nil
        planStartTime = nil
    }
}

private struct PillBadge: View {
    let text: String
    let foreground: Color
    let background: Color
    let border: Color?
    let systemImage: String?

    init(
        text: String,
        foreground: Color,
        background: Color,
        border: Color? = nil,
        systemImage: String? = nil
    ) {
        self.text = text
        self.foreground = foreground
        self.background = background
        self.border = border
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            if let systemImage = systemImage {
                Image(systemName: systemImage)
            }
            Text(text)
                .small()
                .fontWeight(.semibold)
                .lineLimit(1)
        }
        .padding(.horizontal, Theme.Spacing.sm)
        .padding(.vertical, Theme.Spacing.xs)
        .foregroundColor(foreground)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radii.sm)
                .fill(background)
        )
        .overlay(
            border.map { borderColor in
                RoundedRectangle(cornerRadius: Theme.Radii.sm)
                    .stroke(borderColor, lineWidth: 1)
            }
        )
    }
}

private struct StatusBadge: View {
    let status: String

    var body: some View {
        let mapping = statusMapping(for: status.lowercased())
        PillBadge(
            text: status.capitalized,
            foreground: mapping.foreground,
            background: mapping.background,
            border: mapping.border,
            systemImage: mapping.icon
        )
    }

    private func statusMapping(for status: String) -> (foreground: Color, background: Color, border: Color?, icon: String?) {
        switch status {
        case "completed":
            return (Color.successForeground, Color.successBackground, Color.successBorder, "checkmark.circle.fill")
        case "running", "processing", "processingstream":
            return (Color.infoForeground, Color.infoBackground, Color.infoBorder, "arrow.circlepath")
        case "failed", "error":
            return (Color.destructive, Color.destructive.opacity(0.12), Color.destructive, "xmark.circle.fill")
        case "pending", "queued":
            return (Color.warningForeground, Color.warningBackground, Color.warningBorder, "clock.fill")
        default:
            return (Color.mutedForeground, Color.muted, Color.border, nil)
        }
    }
}

// MARK: - Model Selector Toggle (Desktop-style)

private struct ModelSelectorToggle: View {
    let models: [ModelInfo]
    let selectedModelId: String
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(models.enumerated()), id: \.element.id) { index, model in
                HStack(spacing: 0) {
                    Button(action: {
                        onSelect(model.id)
                    }) {
                        Text(model.name)
                            .font(.footnote)
                            .fontWeight(selectedModelId == model.id ? .semibold : .regular)
                            .foregroundColor(selectedModelId == model.id ? Color.primary : Color.mutedForeground)
                            .frame(height: 44)
                            .padding(.horizontal, Theme.Spacing.md)
                            .background(
                                selectedModelId == model.id ?
                                Color.primary.opacity(0.1) :
                                Color.clear
                            )
                    }
                    .buttonStyle(PlainButtonStyle())

                    // Divider between models
                    if index < models.count - 1 {
                        Rectangle()
                            .fill(Color.primary.opacity(0.15))
                            .frame(width: 1, height: 28)
                    }
                }
            }
        }
        .background(Color.input)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radii.base)
                .stroke(Color.primary.opacity(0.15), lineWidth: 1)
        )
        .cornerRadius(Theme.Radii.base)
    }
}


// MARK: - Prompt Preview Sheet

private struct PromptPreviewSheet: View {
    let prompt: String
    let onCopy: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(prompt)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.primary)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.backgroundPrimary)
            .navigationTitle("Implementation Plan Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Copy") {
                        onCopy()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .buttonStyle(ToolbarButtonStyle())
                }
            }
        }
    }
}

#Preview {
    let container = AppContainer(
        baseURL: URL(string: "http://localhost:3000")!,
        deviceId: UUID().uuidString
    )
    return ImplementationPlansView(jobsService: container.jobsService)
        .environmentObject(container)
}
