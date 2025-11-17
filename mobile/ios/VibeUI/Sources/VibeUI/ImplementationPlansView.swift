import SwiftUI
import Core
import Combine
import OSLog

public struct ImplementationPlansView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @StateObject private var settingsService = SettingsDataService()
    @ObservedObject private var appState = AppState.shared
    @State private var selectedPlanJobIdForNav: String? = nil
    @State private var selectedPlans: Set<String> = []
    @State private var mergeInstructions = ""
    @FocusState private var isMergeInstructionsFocused: Bool
    @State private var isMerging = false
    @State private var localErrorMessage: String?
    @State private var currentPlanIndex = 0
    @State private var selectedModel: String = ""
    @State private var availableModels: [String] = []
    @State private var projectTaskSettings: ProjectTaskSettings = [:]
    @State private var providers: [ProviderWithModels] = []
    @State private var isLoadingModels: Bool = false

    // Desktop feature parity states
    @State private var estimatedTokens: Int?
    @State private var isEstimatingTokens = false
    @State private var enableWebSearch = false
    @State private var includeProjectStructure = true
    @State private var showingPromptPreview = false
    @State private var promptContent: String?
    @State private var isCreatingPlan = false
    @State private var refreshTrigger = UUID()
    @State private var deletingPlans = Set<String>()
    @State private var cancellables = Set<AnyCancellable>()

    // Terminal launch states
    @State private var showTerminal = false
    @State private var terminalJobId: String? = nil
    @State private var showDeviceSelector = false

    public init() {}

    private var sanitizedMergeInstructions: String? {
        let trimmed = mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // Computed properties for reactive data from JobsDataService
    private var plans: [PlanSummary] {
        container.jobsService.jobs
            .filter { $0.taskType == "implementation_plan" || $0.taskType == "implementation_plan_merge" }
            .map(PlanSummary.init(from:))
            .sorted { ($0.updatedAt ?? $0.createdAt) > ($1.updatedAt ?? $1.createdAt) }
    }

    private var isLoading: Bool {
        container.jobsService.isLoading && !container.jobsService.hasLoadedOnce
    }

    private var errorMessage: String? {
        localErrorMessage ?? container.jobsService.error?.localizedDescription
    }

    private var allPlanJobIds: [String] {
        plans.map { $0.jobId }
    }

    // MARK: - Action Bar Section
    @ViewBuilder
    private var actionBarSection: some View {
        VStack(spacing: Theme.Spacing.sectionSpacing) {
            // Token Estimation Display
            if canCreatePlan, let tokens = estimatedTokens {
                tokenEstimationView(tokens: tokens)
            }

            // Model Selector
            modelSelectorView

            // Toggles Section
            if canCreatePlan {
                togglesSection

                // Web Search Warning
                if enableWebSearch && isOpenAIModel {
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
        .background(Color(.systemGroupedBackground))
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
                .foregroundColor(tokenCountColor(tokens))

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.sm)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(Theme.Radii.md)
    }

    @ViewBuilder
    private var modelSelectorView: some View {
        if isLoadingModels {
            HStack(spacing: Theme.Spacing.xs) {
                ProgressView()
                    .scaleEffect(0.6)
                Text("Loading models...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.itemSpacing)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(Theme.Radii.base)
        } else if availableModelInfos.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                ModelSelectorToggle(
                    models: availableModelInfos,
                    selectedModelId: selectedModel,
                    onSelect: { modelId in
                        selectedModel = modelId
                        saveModelPreference(modelId)
                        requestTokenEstimation()
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
            if isOpenAIModel {
                Toggle(isOn: $enableWebSearch) {
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
                .onChange(of: enableWebSearch) { _ in
                    requestTokenEstimation()
                }
            }

            // Project Structure Toggle
            Toggle(isOn: $includeProjectStructure) {
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
            .onChange(of: includeProjectStructure) { _ in
                requestTokenEstimation()
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
        .background(Color.orange.opacity(0.2))
        .cornerRadius(Theme.Radii.sm)
    }

    @ViewBuilder
    private var createPlanButton: some View {
        Button(action: createPlan) {
            HStack {
                Image(systemName: "sparkles")
                Text("Create Implementation Plan")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(!canCreatePlan || isCreatingPlan || isTokenLimitExceeded)
    }

    public var body: some View {
        // Force view dependency on refresh trigger
        let _ = refreshTrigger

        VStack(spacing: 0) {
            actionBarSection

            Divider()

            // Content Area
            // Avoid repeated full-screen spinner after first load
            if isLoading && !container.jobsService.hasLoadedOnce {
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
                .background(Color.background)
            }
            // Error Message
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
                .background(Color.background)
            }
            // Plans List
            else if !plans.isEmpty {
                ScrollView {
                    LazyVStack(spacing: Theme.Spacing.sm) {
                        // Show all plans (grouped by session but without visual headers)
                        ForEach(Array(groupedPlans.keys.sorted()), id: \.self) { sessionId in
                            let sessionPlans: [PlanSummary] = groupedPlans[sessionId] ?? []
                            ForEach(sessionPlans, id: \.id) { plan in
                                planItem(for: plan)
                                    .padding(.horizontal)
                                    .padding(.bottom, Theme.Spacing.sm)
                            }
                        }
                    }
                    .padding(.vertical, Theme.Spacing.sm)
                }
                .background(Color.background)

                // Merge Section
                if selectedPlans.count > 1 {
                    VStack(spacing: Theme.Spacing.md) {
                        Divider()

                        VStack(spacing: Theme.Spacing.md) {
                            TextField("Merge instructions (optional)...", text: $mergeInstructions, axis: .vertical)
                                .lineLimit(2...3)
                                .textFieldStyle(PlainTextFieldStyle())
                                .padding(Theme.Spacing.md)
                                .background(Color(UIColor.secondarySystemBackground))
                                .cornerRadius(Theme.Radii.base)
                                .submitLabel(.done)
                                .focused($isMergeInstructionsFocused)
                                .toolbar {
                                    ToolbarItemGroup(placement: .keyboard) {
                                        Spacer()
                                        Button("Done") {
                                            isMergeInstructionsFocused = false
                                        }
                                    }
                                }

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
            // Empty State
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
                .background(Color.background)
            }
        }
        .sheet(isPresented: $showingPromptPreview) {
            if let prompt = promptContent {
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
            // Load model settings when session changes
            // Plans are automatically reactive through JobsDataService
            if isConnected, container.sessionService.currentSession != nil {
                loadModelSettings()
            }
        }
        .onReceive(multiConnectionManager.$connectionStates) { states in
            guard let activeId = multiConnectionManager.activeDeviceId,
                  let state = states[activeId] else { return }

            if state.isConnected {
                loadModelSettings()
            }
        }
        .onReceive(container.sessionService.currentSessionPublisher) { session in
            // Trigger view refresh on session change
            if session != nil {
                refreshTrigger = UUID()
                loadModelSettings()
            }
        }
        .onAppear {
            requestTokenEstimation()
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
        let hasTaskDescription = (session.taskDescription?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
        let hasFiles = !session.includedFiles.isEmpty
        let hasSessionId = !session.id.isEmpty

        return hasProjectDirectory && hasTaskDescription && hasFiles && hasSessionId && !isCreatingPlan
    }

    private var canEstimateTokens: Bool {
        guard isConnected,
              let session = container.sessionService.currentSession,
              !session.id.isEmpty,
              !session.projectDirectory.isEmpty,
              let taskDescription = session.taskDescription, !taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !selectedModel.isEmpty
        else { return false }
        return true
    }

    private var modelDisplayName: String {
        if selectedModel.isEmpty {
            return "Select Model"
        }

        // Find the model in the providers data
        for provider in providers {
            if let model = provider.models.first(where: { $0.id == selectedModel }) {
                return model.name
            }
        }

        // Fallback to showing the last component of the model ID
        let components = selectedModel.split(separator: "/")
        return String(components.last ?? "")
    }

    private var availableModelInfos: [ModelInfo] {
        var modelInfos: [ModelInfo] = []
        for provider in providers {
            for model in provider.models {
                if availableModels.contains(model.id) {
                    modelInfos.append(model)
                }
            }
        }
        return modelInfos
    }

    // Removed loadPlans() and refreshPlans() - plans are now reactive through JobsDataService computed property

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
                localErrorMessage = "No active device connection"
            }
            return
        }

        await MainActor.run {
            isMerging = true
        }

        // Get actual session ID from container
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
                    // Handle successful merge
                    if let _ = result["jobId"] as? String {
                        // Clear selection and instructions
                        selectedPlans.removeAll()
                        mergeInstructions = ""
                        // JobsDataService will automatically update via events
                    }
                }
            }

        } catch {
            await MainActor.run {
                isMerging = false
            }
        }
    }

    private func loadModelSettings() {
        Task {
            await MainActor.run {
                isLoadingModels = true
            }

            defer {
                Task { @MainActor in
                    isLoadingModels = false
                }
            }

            do {
                // Load project directory from current session
                guard let projectDirectory = container.sessionService.currentSession?.projectDirectory else { return }

                // Fetch providers and models from server
                try await settingsService.fetchProviders()

                // Fetch project-specific settings
                try await settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDirectory)

                await MainActor.run {
                    // Store the providers data
                    providers = settingsService.providers
                    projectTaskSettings = settingsService.projectTaskSettings

                    // Get the implementation plan settings
                    if let planSettings = projectTaskSettings["implementationPlan"] {
                        selectedModel = planSettings.model

                        // If allowedModels is configured and non-empty, use it
                        // Otherwise, use ALL models from providers (matches desktop behavior)
                        if let allowed = planSettings.allowedModels, !allowed.isEmpty {
                            availableModels = allowed
                        } else {
                            // No restrictions - show all models from all providers
                            availableModels = providers.flatMap { $0.models.map { $0.id } }
                        }
                    } else {
                        // Fall back to server defaults
                        Task {
                            do {
                                let defaults = try await settingsService.fetchServerDefaults()
                                await MainActor.run {
                                    if let planSettings = defaults["implementationPlan"] {
                                        selectedModel = planSettings.model

                                        // Same logic for defaults
                                        if let allowed = planSettings.allowedModels, !allowed.isEmpty {
                                            availableModels = allowed
                                        } else {
                                            // No restrictions - show all models
                                            availableModels = providers.flatMap { $0.models.map { $0.id } }
                                        }
                                    } else {
                                        // No settings at all - use all available models
                                        availableModels = providers.flatMap { $0.models.map { $0.id } }
                                        // Set a reasonable default model if available
                                        if let firstModel = availableModels.first {
                                            selectedModel = firstModel
                                        }
                                    }
                                }
                            } catch {
                                // Even on error, show all available models
                                await MainActor.run {
                                    availableModels = providers.flatMap { $0.models.map { $0.id } }
                                }
                            }
                        }
                    }
                }
            } catch {
                // Failed to load model settings
            }

            // Trigger token estimation after loading model settings
            await MainActor.run {
                requestTokenEstimation()
            }
        }
    }

    private func saveModelPreference(_ model: String) {
        Task {
            do {
                guard let projectDirectory = container.sessionService.currentSession?.projectDirectory else { return }

                // Save the model preference for implementation plans
                try await settingsService.setProjectTaskSetting(
                    projectDirectory: projectDirectory,
                    taskKey: "implementationPlan",
                    settingKey: "model",
                    value: model
                )
            } catch {
                // Failed to save model preference
            }
        }
    }

    private func createPlan() {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId),
              let currentSessionId = container.sessionService.currentSession?.id,
              let taskDescription = container.sessionService.currentSession?.taskDescription,
              let projectDirectory = container.sessionService.currentSession?.projectDirectory else {
            localErrorMessage = "Missing session information. Please select a session first."
            return
        }

        let files = container.sessionService.currentSession?.includedFiles ?? []

        Task {
            await MainActor.run {
                isCreatingPlan = true
                localErrorMessage = nil
            }

            defer {
                Task { @MainActor in
                    isCreatingPlan = false
                }
            }

            do {
                var params: [String: Any] = [
                    "sessionId": currentSessionId,
                    "taskDescription": taskDescription,
                    "projectDirectory": projectDirectory,
                    "relevantFiles": files,
                    "includeProjectStructure": includeProjectStructure
                ]

                // Add model if selected (not "Select Model")
                if !selectedModel.isEmpty && selectedModel != "Select Model" {
                    params["model"] = selectedModel
                }

                // Add web search for OpenAI models
                if enableWebSearch && isOpenAIModel {
                    params["enableWebSearch"] = true
                }

                let request = RpcRequest(
                    method: "actions.createImplementationPlan",
                    params: params
                )

                for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                    if let error = response.error {
                        await MainActor.run {
                            localErrorMessage = "Create plan error: \(error.message)"
                        }
                        return
                    }

                    if response.isFinal {
                        // JobsDataService will automatically update via events
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    localErrorMessage = error.localizedDescription
                }
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
                }
            )
        }
        .buttonStyle(PlainButtonStyle())
        .contextMenu {
            planItemContextMenu(for: plan)
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
                        self.localErrorMessage = error.localizedDescription
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

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            Button(action: {
                onSelectionChanged(!isSelected)
            }) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundColor(isSelected ? Color.primary : Color.mutedForeground)
            }
            .buttonStyle(PlainButtonStyle())

            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text(plan.title ?? "Untitled Plan")
                    .h4()
                    .foregroundColor(Color.cardForeground)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: Theme.Spacing.xs) {
                    if plan.taskType == "implementation_plan_merge" {
                        PillBadge(
                            text: "Merged",
                            foreground: Color.infoForeground,
                            background: Color.infoBackground,
                            border: Color.infoBorder,
                            systemImage: "arrow.triangle.merge"
                        )
                    }
                    StatusBadge(status: plan.status)
                }

                if let status = plan.executionStatus, status.isExecuting {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                        ProgressView(value: Double(status.progressPercentage ?? 0) / 100.0, total: 1.0)
                            .progressViewStyle(.linear)
                            .tint(Color.primary)

                        if let step = status.currentStep {
                            Text(step)
                                .small()
                                .foregroundColor(Color.mutedForeground)
                                .lineLimit(2)
                        }
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Theme.Spacing.xs) {
                        if let model = plan.modelDisplayName, !model.isEmpty {
                            PillBadge(
                                text: model,
                                foreground: Color.cardForeground,
                                background: Color.muted,
                                border: Color.border,
                                systemImage: "cpu"
                            )
                        }

                        PillBadge(
                            text: plan.tokenCount,
                            foreground: Color.cardForeground,
                            background: Color.muted,
                            border: Color.border,
                            systemImage: "number.square"
                        )
                    }
                }

                Text(plan.formattedDate)
                    .small()
                    .foregroundColor(Color.mutedForeground)
                    .lineLimit(1)

                if let filePath = plan.filePath {
                    Text(filePath)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(Color.mutedForeground)
        }
        .padding(Theme.Spacing.lg)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radii.base)
                .fill(isSelected ? Color.primary.opacity(0.08) : Color.card)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radii.base)
                        .stroke(
                            isSelected ? Color.primary : Color.border,
                            lineWidth: isSelected ? 2 : 1
                        )
                )
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onTap()
        }
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
                            .padding(.horizontal, Theme.Spacing.md)
                            .padding(.vertical, 7)
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
                            .fill(Color.border.opacity(0.4))
                            .frame(width: 1, height: 24)
                    }
                }
            }
        }
        .background(Color(UIColor.secondarySystemBackground))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radii.base)
                .stroke(Color.border.opacity(0.5), lineWidth: 1)
        )
        .cornerRadius(Theme.Radii.base)
    }
}

// MARK: - ImplementationPlansView Extension - Desktop Parity Functions

extension ImplementationPlansView {
    // Computed properties
    private var isOpenAIModel: Bool {
        let modelLower = selectedModel.lowercased()
        return modelLower.contains("gpt-") ||
               modelLower.contains("o1-") ||
               modelLower.contains("openai/")
    }

    private var isTokenLimitExceeded: Bool {
        guard let tokens = estimatedTokens else { return false }
        let modelInfo = availableModelInfos.first { $0.id == selectedModel }
        let contextWindow = modelInfo?.contextWindow ?? 128000
        let maxOutputTokens = projectTaskSettings["implementationPlan"]?.maxTokens ?? 8000
        return (tokens + maxOutputTokens) > contextWindow
    }

    private func tokenCountColor(_ count: Int) -> Color {
        let modelInfo = availableModelInfos.first { $0.id == selectedModel }
        let contextWindow = modelInfo?.contextWindow ?? 128000
        let maxOutputTokens = projectTaskSettings["implementationPlan"]?.maxTokens ?? 8000
        let ratio = Double(count + maxOutputTokens) / Double(contextWindow)

        if ratio > 0.9 {
            return .red
        } else if ratio > 0.7 {
            return .orange
        } else {
            return .primary
        }
    }

    // Action functions
    private func requestTokenEstimation() {
        guard canEstimateTokens else {
            estimatedTokens = nil
            return
        }

        Task {
            await performTokenEstimation()
        }
    }

    private func performTokenEstimation() async {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId),
              let session = container.sessionService.currentSession else {
            return
        }

        await MainActor.run {
            isEstimatingTokens = true
        }

        defer {
            Task { @MainActor in
                isEstimatingTokens = false
            }
        }

        do {
            let params: [String: Any] = [
                "sessionId": session.id,
                "taskDescription": session.taskDescription ?? "",
                "projectDirectory": session.projectDirectory,
                "relevantFiles": session.includedFiles ?? [],
                "taskType": "implementation_plan",
                "model": selectedModel,
                "includeProjectStructure": includeProjectStructure,
                "enableWebSearch": enableWebSearch && isOpenAIModel
            ]

            let request = RpcRequest(
                method: "actions.estimatePromptTokens",
                params: params
            )

            for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                if let result = response.result?.value as? [String: Any],
                   let totalTokens = result["totalTokens"] as? Int {
                    await MainActor.run {
                        self.estimatedTokens = totalTokens
                    }
                }

                if response.isFinal {
                    break
                }
            }
        } catch {
            // Failed to estimate tokens
        }
    }

    private func viewPrompt() {
        guard canCreatePlan else { return }

        Task {
            await fetchPromptContent()
            if promptContent != nil {
                showingPromptPreview = true
            }
        }
    }

    private func copyPrompt() {
        guard canCreatePlan else { return }

        Task {
            await fetchPromptContent()
            if let prompt = promptContent {
                UIPasteboard.general.string = prompt
                // Could show a toast notification here
            }
        }
    }

    private func fetchPromptContent() async {
        guard let session = container.sessionService.currentSession else { return }

        do {
            let result = try await container.sessionService.getPlanPrompt(
                sessionId: session.id,
                taskDescription: session.taskDescription ?? "",
                projectDirectory: session.projectDirectory,
                relevantFiles: session.includedFiles
            )

            await MainActor.run {
                self.promptContent = result.combinedPrompt
            }
        } catch {
            await MainActor.run {
                self.localErrorMessage = error.localizedDescription
            }
        }
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
            .background(Color(.systemBackground))
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
    ImplementationPlansView()
}