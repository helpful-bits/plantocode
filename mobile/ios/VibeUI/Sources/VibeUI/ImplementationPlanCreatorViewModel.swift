import Foundation
import Combine
import SwiftUI
import Core

@MainActor
final class ImplementationPlanCreatorViewModel: ObservableObject {
    @Published var selectedModel: String = ""
    @Published var availableModels: [String] = []
    @Published var projectTaskSettings: ProjectTaskSettings = [:]
    @Published var providers: [ProviderWithModels] = []
    @Published var isLoadingModels: Bool = false
    @Published var estimatedTokens: Int?
    @Published var isEstimatingTokens = false
    @Published var enableWebSearch = false
    @Published var includeProjectStructure = true
    @Published var isCreatingPlan = false
    @Published var localErrorMessage: String?
    @Published var promptContent: String?

    private var container: AppContainer?
    private var currentTaskDescription: String?
    private var multiConnectionManager = MultiConnectionManager.shared

    private var settingsService: SettingsDataService? {
        container?.settingsService
    }

    private var loadedForSessionId: String? = nil
    private var loadedForDeviceId: UUID? = nil
    private var modelsLoadedAt: Date? = nil
    private let modelsCacheDuration: TimeInterval = 180

    private var cancellables = Set<AnyCancellable>()

    func setup(container: AppContainer, currentTaskDescription: String?) {
        self.container = container
        self.currentTaskDescription = currentTaskDescription
    }

    var availableModelInfos: [ModelInfo] {
        // Build a map of model id -> model info for quick lookup
        var modelMap: [String: ModelInfo] = [:]
        for provider in providers {
            for model in provider.models {
                modelMap[model.id] = model
            }
        }

        // Preserve the order from availableModels by iterating in that order
        var modelInfos: [ModelInfo] = []
        var seenIds: Set<String> = []
        for modelId in availableModels {
            if !seenIds.contains(modelId), let model = modelMap[modelId] {
                modelInfos.append(model)
                seenIds.insert(modelId)
            }
        }
        return modelInfos
    }

    var isOpenAIModel: Bool {
        let modelLower = selectedModel.lowercased()
        return modelLower.contains("gpt-") ||
               modelLower.contains("o1-") ||
               modelLower.contains("openai/")
    }

    var isTokenLimitExceeded: Bool {
        guard let tokens = estimatedTokens else { return false }
        let modelInfo = availableModelInfos.first { $0.id == selectedModel }
        let contextWindow = modelInfo?.contextWindow ?? 128000
        let maxOutputTokens = projectTaskSettings["implementationPlan"]?.maxTokens ?? 8000
        return (tokens + maxOutputTokens) > contextWindow
    }

    func tokenCountColor(_ count: Int) -> Color {
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

    func canEstimateTokens() -> Bool {
        guard let container = container,
              let session = container.sessionService.currentSession,
              !session.id.isEmpty,
              !session.projectDirectory.isEmpty,
              let taskDescription = session.taskDescription, !taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !selectedModel.isEmpty
        else { return false }
        return multiConnectionManager.activeDeviceId != nil &&
               multiConnectionManager.connectionStates[multiConnectionManager.activeDeviceId!]?.isConnected == true
    }

    func loadModelSettings() {
        Task {
            guard let currentSessionId = container?.sessionService.currentSession?.id,
                  let deviceId = multiConnectionManager.activeDeviceId,
                  let settingsService = settingsService else {
                return
            }

            let shouldSkip = loadedForSessionId == currentSessionId &&
                           loadedForDeviceId == deviceId &&
                           modelsLoadedAt.map { Date().timeIntervalSince($0) < modelsCacheDuration } ?? false

            if shouldSkip {
                // Even if skipping model load, ensure we have token estimate
                if estimatedTokens == nil && canEstimateTokens() {
                    requestTokenEstimation()
                }
                return
            }

            guard let projectDirectory = container?.sessionService.currentSession?.projectDirectory else { return }

            // Check if shared service already has preloaded data for this project
            let hasPreloadedProviders = !settingsService.providers.isEmpty
            let hasPreloadedSettings = settingsService.projectTaskSettingsLoadedFor == projectDirectory

            // If we already have a model selected, start token estimation immediately in parallel
            let previousModel = selectedModel
            if canEstimateTokens() {
                Task {
                    await performTokenEstimation()
                }
            }

            // Only show loading if we actually need to fetch
            if !hasPreloadedProviders || !hasPreloadedSettings {
                isLoadingModels = true
            }

            defer {
                Task { @MainActor in
                    isLoadingModels = false
                }
            }

            do {
                // Only fetch what's not already loaded
                if !hasPreloadedProviders && !hasPreloadedSettings {
                    // Run both fetches in parallel to reduce latency
                    async let providersTask: () = settingsService.fetchProviders()
                    async let settingsTask: () = settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDirectory)
                    _ = try await (providersTask, settingsTask)
                } else if !hasPreloadedProviders {
                    try await settingsService.fetchProviders()
                } else if !hasPreloadedSettings {
                    try await settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDirectory)
                }

                providers = settingsService.providers
                projectTaskSettings = settingsService.projectTaskSettings

                loadedForSessionId = currentSessionId
                loadedForDeviceId = deviceId
                modelsLoadedAt = Date()

                if let planSettings = projectTaskSettings["implementationPlan"] {
                    selectedModel = planSettings.model

                    if let allowed = planSettings.allowedModels, !allowed.isEmpty {
                        availableModels = allowed
                    } else {
                        availableModels = providers.flatMap { $0.models.map { $0.id } }
                    }
                } else {
                    Task {
                        do {
                            let defaults = try await settingsService.fetchServerDefaults()
                            if let planSettings = defaults["implementationPlan"] {
                                selectedModel = planSettings.model

                                if let allowed = planSettings.allowedModels, !allowed.isEmpty {
                                    availableModels = allowed
                                } else {
                                    availableModels = providers.flatMap { $0.models.map { $0.id } }
                                }
                            } else {
                                availableModels = providers.flatMap { $0.models.map { $0.id } }
                                if let firstModel = availableModels.first {
                                    selectedModel = firstModel
                                }
                            }
                            // Re-estimate if model changed after fetching defaults
                            if selectedModel != previousModel {
                                requestTokenEstimation()
                            }
                        } catch {
                            availableModels = providers.flatMap { $0.models.map { $0.id } }
                        }
                    }
                }

                // Re-estimate if model changed after fetching settings
                if selectedModel != previousModel && !selectedModel.isEmpty {
                    requestTokenEstimation()
                }
            } catch {
                // Failed to load model settings
            }
        }
    }

    func invalidateModelCache() {
        modelsLoadedAt = nil
    }

    func saveModelPreference(_ model: String) {
        selectedModel = model
        Task {
            do {
                guard let projectDirectory = container?.sessionService.currentSession?.projectDirectory,
                      let settingsService = settingsService else { return }

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
        requestTokenEstimation()
    }

    func requestTokenEstimation() {
        guard canEstimateTokens() else {
            estimatedTokens = nil
            return
        }

        Task {
            await performTokenEstimation()
        }
    }

    private func performTokenEstimation() async {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let relayClient = multiConnectionManager.relayConnection(for: deviceId),
              let session = container?.sessionService.currentSession else {
            return
        }

        isEstimatingTokens = true

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
                    estimatedTokens = totalTokens
                }

                if response.isFinal {
                    break
                }
            }
        } catch {
            // Failed to estimate tokens
        }
    }

    func createPlan() {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let relayClient = multiConnectionManager.relayConnection(for: deviceId),
              let currentSessionId = container?.sessionService.currentSession?.id,
              let projectDirectory = container?.sessionService.currentSession?.projectDirectory else {
            localErrorMessage = "Missing session information. Please select a session first."
            return
        }

        let taskText = (currentTaskDescription ?? container?.sessionService.currentSession?.taskDescription) ?? ""
        let files = container?.sessionService.currentSession?.includedFiles ?? []

        isCreatingPlan = true
        Task {
            do {
                defer { Task { @MainActor in self.isCreatingPlan = false } }

                var params: [String: Any] = [
                    "sessionId": currentSessionId,
                    "taskDescription": taskText,
                    "projectDirectory": projectDirectory,
                    "relevantFiles": files,
                    "includeProjectStructure": includeProjectStructure
                ]

                if !selectedModel.isEmpty && selectedModel != "Select Model" {
                    params["model"] = selectedModel
                }

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

    func fetchPromptContent() async {
        guard let session = container?.sessionService.currentSession else { return }

        do {
            let result = try await container?.sessionService.getPlanPrompt(
                sessionId: session.id,
                taskDescription: session.taskDescription ?? "",
                projectDirectory: session.projectDirectory,
                relevantFiles: session.includedFiles
            )

            promptContent = result?.combinedPrompt
        } catch {
            localErrorMessage = error.localizedDescription
        }
    }
}
