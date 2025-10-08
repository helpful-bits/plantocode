import SwiftUI
import Core
import Combine

public struct ImplementationPlansView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @StateObject private var settingsService = SettingsDataService()
    @State private var selectedPlans: Set<String> = []
    @State private var mergeInstructions = ""
    @State private var isLoading = false
    @State private var isMerging = false
    @State private var errorMessage: String?
    @State private var plans: [PlanSummary] = []
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
    @State private var activatingPlans = Set<String>()
    @State private var deletingPlans = Set<String>()

    public init() {}

    public var body: some View {
        let _ = refreshTrigger // Force view dependency

        VStack(spacing: 0) {
            // Streamlined Action Bar with Desktop Parity
            VStack(spacing: 16) {
                // Token Estimation Display
                if canCreatePlan && (estimatedTokens != nil || isEstimatingTokens) {
                    HStack(spacing: 8) {
                        Image(systemName: "number.square")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        if isEstimatingTokens {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text("Estimating tokens...")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        } else if let tokens = estimatedTokens {
                            Text("Estimated tokens: ")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                            Text("\(tokens)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(tokenCountColor(tokens))
                        }

                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(6)
                }

                // Model Selector - Desktop-style segmented toggle
                if isLoadingModels {
                    // Loading state
                    HStack(spacing: 4) {
                        ProgressView()
                            .scaleEffect(0.6)
                        Text("Loading models...")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(8)
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

                // Toggles Section
                if canCreatePlan {
                    VStack(spacing: 8) {
                        // Web Search Toggle (only for OpenAI models)
                        if isOpenAIModel {
                            Toggle(isOn: $enableWebSearch) {
                                HStack(spacing: 6) {
                                    Image(systemName: "globe")
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)
                                    Text("Web Search")
                                        .font(.system(size: 13))
                                        .foregroundColor(.primary)
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
                            HStack(spacing: 6) {
                                Image(systemName: "folder.badge.gearshape")
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                                Text("Include Project Tree")
                                    .font(.system(size: 13))
                                    .foregroundColor(.primary)
                                Spacer()
                            }
                        }
                        .toggleStyle(SwitchToggleStyle(tint: Color.primary))
                        .onChange(of: includeProjectStructure) { _ in
                            requestTokenEstimation()
                        }
                    }

                    // Web Search Warning
                    if enableWebSearch && isOpenAIModel {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.orange)
                            Text("Web search will increase token usage by 3-10x")
                                .font(.system(size: 10))
                                .foregroundColor(.orange)
                            Spacer()
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.orange.opacity(0.15))
                        .cornerRadius(4)
                    }

                    // Action Buttons Row
                    HStack(spacing: 8) {
                        // View Prompt Button
                        Button(action: viewPrompt) {
                            HStack(spacing: 4) {
                                Image(systemName: "eye")
                                    .small()
                                Text("View")
                                    .small()
                                    .fontWeight(.medium)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(SecondaryButtonStyle())

                        // Copy Prompt Button
                        Button(action: copyPrompt) {
                            HStack(spacing: 4) {
                                Image(systemName: "doc.on.doc")
                                    .small()
                                Text("Copy")
                                    .small()
                                    .fontWeight(.medium)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(SecondaryButtonStyle())

                        Spacer()
                    }
                }

                // Create Plan Button - Primary Action
                Button(action: createPlan) {
                    HStack {
                        Image(systemName: "sparkles")
                        Text("Create Implementation Plan")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canCreatePlan || isCreatingPlan || isTokenLimitExceeded)

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

            Divider()

            // Content Area
            if isLoading {
                VStack {
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
                        .scaleEffect(0.8)
                    Text("Loading plans...")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .padding(.top, 8)
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
                    Button("Try Again") {
                        loadPlans()
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.background)
            }
            // Plans List
            else if !plans.isEmpty {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        // Plans count header
                        HStack {
                            Text("\(plans.count) plan\(plans.count == 1 ? "" : "s")")
                                .small()
                                .fontWeight(.semibold)

                            if !selectedPlans.isEmpty {
                                Text("•")
                                    .small()
                                    .foregroundColor(Color.mutedForeground)

                                Text("\(selectedPlans.count) selected")
                                    .small()
                                    .foregroundColor(Color.mutedForeground)

                                Spacer()

                                Button("Clear") {
                                    selectedPlans.removeAll()
                                }
                                .buttonStyle(LinkButtonStyle())
                            } else {
                                Spacer()
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 12)

                        // Show grouped plans by task/session
                        ForEach(Array(groupedPlans.keys.sorted()), id: \.self) { sessionId in
                            let sessionPlans = groupedPlans[sessionId] ?? []

                            VStack(spacing: 0) {
                                // Session group header
                                HStack {
                                    Text("Task Group")
                                        .small()
                                        .fontWeight(.medium)
                                        .foregroundColor(Color.mutedForeground)

                                    Spacer()

                                    Text("\(sessionPlans.count)")
                                        .small()
                                        .foregroundColor(Color.mutedForeground)
                                }
                                .padding(.horizontal)
                                .padding(.vertical, 8)
                                .background(Color(UIColor.secondarySystemBackground))

                                // Plans in this group
                                ForEach(sessionPlans) { plan in
                                    NavigationLink(destination: PlanDetailView(plan: plan, allPlans: plans, plansService: container.plansService)) {
                                        PlanCard(
                                            plan: plan,
                                            isSelected: selectedPlans.contains(plan.jobId),
                                            onSelectionChanged: { isSelected in
                                                if isSelected {
                                                    selectedPlans.insert(plan.jobId)
                                                } else {
                                                    selectedPlans.remove(plan.jobId)
                                                }
                                            },
                                            onTap: {
                                                // Navigation handled by NavigationLink
                                            }
                                        )
                                    }
                                    .buttonStyle(PlainButtonStyle())
                                    .contextMenu {
                                        Button("Activate") {
                                            guard !activatingPlans.contains(plan.id) else { return }
                                            activatingPlans.insert(plan.id)

                                            Task {
                                                do {
                                                    for try await _ in container.plansService.activatePlan(id: plan.id) {
                                                        await MainActor.run {
                                                            activatingPlans.remove(plan.id)
                                                            loadPlans()
                                                        }
                                                    }
                                                } catch {
                                                    await MainActor.run {
                                                        errorMessage = error.localizedDescription
                                                        activatingPlans.remove(plan.id)
                                                    }
                                                }
                                            }
                                        }
                                        .disabled(activatingPlans.contains(plan.id))

                                        Button(role: .destructive) {
                                            guard !deletingPlans.contains(plan.id) else { return }
                                            deletingPlans.insert(plan.id)

                                            Task {
                                                do {
                                                    for try await _ in container.plansService.deletePlan(id: plan.id) {
                                                        await MainActor.run {
                                                            deletingPlans.remove(plan.id)
                                                            loadPlans()
                                                        }
                                                    }
                                                } catch {
                                                    await MainActor.run {
                                                        errorMessage = error.localizedDescription
                                                        deletingPlans.remove(plan.id)
                                                    }
                                                }
                                            }
                                        } label: {
                                            Text("Delete")
                                        }
                                        .disabled(deletingPlans.contains(plan.id))
                                    }
                                    .padding(.horizontal)
                                }
                            }
                            .padding(.bottom, 8)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .background(Color.background)

                // Merge Section
                if selectedPlans.count > 1 {
                    VStack(spacing: 12) {
                        Divider()

                        VStack(spacing: 12) {
                            TextField("Merge instructions...", text: $mergeInstructions, axis: .vertical)
                                .lineLimit(2...3)
                                .textFieldStyle(PlainTextFieldStyle())
                                .padding(12)
                                .background(Color(UIColor.secondarySystemBackground))
                                .cornerRadius(8)

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
                            .disabled(mergeInstructions.isEmpty || isMerging)
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

                    VStack(spacing: 12) {
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
        .refreshable {
            await refreshPlans()
        }
        .onAppear {
            if isConnected {
                loadPlans()
                loadModelSettings()
            }
            setupRealTimeUpdates()
        }
        .onReceive(multiConnectionManager.$connectionStates) { states in
            guard let activeId = multiConnectionManager.activeDeviceId,
                  let state = states[activeId] else { return }

            if state.isConnected && plans.isEmpty && !isLoading {
                loadPlans()
                loadModelSettings()
            }
        }
        .onReceive(container.sessionService.$currentSession.compactMap { $0 }) { _ in
            refreshTrigger = UUID()
            loadPlans()
            loadModelSettings()
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

    private func loadPlans() {
        isLoading = true
        errorMessage = nil

        guard let session = container.sessionService.currentSession else { return }
        let request = PlanListRequest(
            projectDirectory: session.projectDirectory,
            sessionId: session.id,
            page: 0,
            pageSize: 50,
            sortBy: .createdAt,
            sortOrder: .desc,
            includeMetadataOnly: true
        )

        container.plansService.listPlans(request: request)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { completion in
                    isLoading = false
                    if case .failure(let error) = completion {
                        errorMessage = error.localizedDescription
                    }
                },
                receiveValue: { response in
                    plans = response.plans
                    isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    private func refreshPlans() async {
        await withCheckedContinuation { continuation in
            guard let session = container.sessionService.currentSession else {
                continuation.resume()
                return
            }
            let request = PlanListRequest(
                projectDirectory: session.projectDirectory,
                sessionId: session.id,
                page: 0,
                pageSize: 50,
                sortBy: .createdAt,
                sortOrder: .desc,
                includeMetadataOnly: true
            )

            container.plansService.listPlans(request: request)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            errorMessage = error.localizedDescription
                        }
                        continuation.resume()
                    },
                    receiveValue: { response in
                        plans = response.plans
                    }
                )
                .store(in: &cancellables)
        }
    }

    private func mergePlans() {
        guard selectedPlans.count > 1,
              !mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
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
                errorMessage = "No active device connection"
            }
            return
        }

        await MainActor.run {
            isMerging = true
            errorMessage = nil
        }

        // Get actual session ID from container
        guard let currentSessionId = container.sessionService.currentSession?.id else {
            await MainActor.run {
                errorMessage = "No active session. Please select or create a session first."
                isMerging = false
            }
            return
        }

        let request = RpcRequest(
            method: "actions.mergePlans",
            params: [
                "sessionId": AnyCodable(currentSessionId),
                "sourceJobIds": AnyCodable(Array(selectedPlans)),
                "mergeInstructions": AnyCodable(mergeInstructions.trimmingCharacters(in: .whitespacesAndNewlines))
            ]
        )

        do {
            var mergeResult: [String: Any]?

            for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                if let error = response.error {
                    await MainActor.run {
                        errorMessage = "Merge error: \(error.message)"
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
                    if let newJobId = result["jobId"] as? String {
                        // Clear selection and instructions
                        selectedPlans.removeAll()
                        mergeInstructions = ""

                        // Refresh plans to show the new merged plan
                        loadPlans()
                    }
                }
            }

        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
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
                                print("Failed to load server defaults: \(error)")
                                // Even on error, show all available models
                                await MainActor.run {
                                    availableModels = providers.flatMap { $0.models.map { $0.id } }
                                }
                            }
                        }
                    }
                }
            } catch {
                print("Failed to load model settings: \(error)")
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
                print("Failed to save model preference: \(error)")
            }
        }
    }

    private func createPlan() {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId),
              let currentSessionId = container.sessionService.currentSession?.id,
              let taskDescription = container.sessionService.currentSession?.taskDescription,
              let projectDirectory = container.sessionService.currentSession?.projectDirectory else {
            errorMessage = "Missing session information. Please select a session first."
            return
        }

        let files = container.sessionService.currentSession?.includedFiles ?? []

        Task {
            await MainActor.run {
                isCreatingPlan = true
                errorMessage = nil
            }

            defer {
                Task { @MainActor in
                    isCreatingPlan = false
                }
            }

            do {
                var params: [String: AnyCodable] = [
                    "sessionId": AnyCodable(currentSessionId),
                    "taskDescription": AnyCodable(taskDescription),
                    "projectDirectory": AnyCodable(projectDirectory),
                    "relevantFiles": AnyCodable(files),
                    "includeProjectStructure": AnyCodable(includeProjectStructure)
                ]

                // Add model if selected (not "Select Model")
                if !selectedModel.isEmpty && selectedModel != "Select Model" {
                    params["model"] = AnyCodable(selectedModel)
                }

                // Add web search for OpenAI models
                if enableWebSearch && isOpenAIModel {
                    params["enableWebSearch"] = AnyCodable(true)
                }

                let request = RpcRequest(
                    method: "actions.createImplementationPlan",
                    params: params
                )

                for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                    if let error = response.error {
                        await MainActor.run {
                            errorMessage = "Create plan error: \(error.message)"
                        }
                        return
                    }

                    if response.isFinal {
                        await MainActor.run {
                            // Refresh plans list to show the new plan
                            loadPlans()
                        }
                        break
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    @State private var cancellables = Set<AnyCancellable>()

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

    private func setupRealTimeUpdates() {
        container.plansService.$lastUpdateEvent
            .compactMap { $0 }
            .sink { event in
                DispatchQueue.main.async {
                    handleRealTimeUpdate(event: event)
                }
            }
            .store(in: &cancellables)

        // Removed global plans mirroring subscription - plans are now session-filtered
    }

    private func handleRealTimeUpdate(event: RelayEvent) {
        let currentSessionId = container.sessionService.currentSession?.id
        let eventSessionId = event.data["sessionId"]?.value as? String

        if let evtSid = eventSessionId, let curSid = currentSessionId, evtSid != curSid {
            return
        }

        if event.eventType.hasPrefix("job:") ||
           ["PlansUpdated", "PlanCreated", "PlanDeleted", "PlanModified"].contains(event.eventType) {
            loadPlans()
        }
    }
}

private struct PlanCard: View {
    let plan: PlanSummary
    let isSelected: Bool
    let onSelectionChanged: (Bool) -> Void
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Selection checkbox
                Button(action: {
                    onSelectionChanged(!isSelected)
                }) {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundColor(isSelected ? Color.primary : Color.mutedForeground)
                }
                .buttonStyle(PlainButtonStyle())

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(plan.title ?? "Untitled Plan")
                            .h4()
                            .foregroundColor(Color.cardForeground)
                            .lineLimit(2)

                        Spacer()

                        // Status badge
                        StatusBadge(status: plan.status)
                    }

                    if let status = plan.executionStatus, status.isExecuting {
                        ProgressView(value: Double(status.progressPercentage ?? 0) / 100.0, total: 1.0)
                            .progressViewStyle(.linear)
                            .padding(.top, 4)

                        if let step = status.currentStep {
                            Text(step)
                                .small()
                                .foregroundColor(Color.mutedForeground)
                                .lineLimit(1)
                        }
                    }

                    HStack {
                        Text(plan.formattedDate)
                            .small()
                            .foregroundColor(Color.mutedForeground)

                        Spacer()

                        Text(plan.size)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }

                    if let filePath = plan.filePath {
                        Text(filePath)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                            .lineLimit(1)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Color.mutedForeground)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.primary.opacity(0.1) : Color.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(
                                isSelected ? Color.primary : Color.border,
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

private struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.capitalized)
            .small()
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor.opacity(0.2))
            .foregroundColor(statusColor)
            .cornerRadius(4)
    }

    private var statusColor: Color {
        switch status.lowercased() {
        case "completed":
            return Color.success
        case "running", "processing":
            return Color.primary
        case "failed", "error":
            return Color.destructive
        case "pending", "queued":
            return Color.warning
        default:
            return Color.mutedForeground
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
                            .font(.system(size: 12, weight: selectedModelId == model.id ? .semibold : .regular))
                            .foregroundColor(selectedModelId == model.id ? Color.primary : Color.mutedForeground)
                            .padding(.horizontal, 12)
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
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.border.opacity(0.5), lineWidth: 1)
        )
        .cornerRadius(8)
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
        guard canCreatePlan else {
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
            let params: [String: AnyCodable] = [
                "sessionId": AnyCodable(session.id),
                "taskDescription": AnyCodable(session.taskDescription ?? ""),
                "projectDirectory": AnyCodable(session.projectDirectory ?? ""),
                "relevantFiles": AnyCodable(session.includedFiles ?? []),
                "taskType": AnyCodable("implementation_plan"),
                "model": AnyCodable(selectedModel),
                "includeProjectStructure": AnyCodable(includeProjectStructure),
                "enableWebSearch": AnyCodable(enableWebSearch && isOpenAIModel)
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
            print("Failed to estimate tokens: \(error)")
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
            let result = try await container.plansService.getPlanPrompt(
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
                self.errorMessage = error.localizedDescription
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
                }
            }
        }
    }
}

#Preview {
    ImplementationPlansView()
}