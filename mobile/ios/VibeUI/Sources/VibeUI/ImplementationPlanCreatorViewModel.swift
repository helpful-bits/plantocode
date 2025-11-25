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
    private var settingsService = SettingsDataService()
    private var multiConnectionManager = MultiConnectionManager.shared

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
                  let deviceId = multiConnectionManager.activeDeviceId else {
                return
            }

            let shouldSkip = loadedForSessionId == currentSessionId &&
                           loadedForDeviceId == deviceId &&
                           modelsLoadedAt.map { Date().timeIntervalSince($0) < modelsCacheDuration } ?? false

            if shouldSkip {
                return
            }

            isLoadingModels = true

            defer {
                Task { @MainActor in
                    isLoadingModels = false
                }
            }

            do {
                guard let projectDirectory = container?.sessionService.currentSession?.projectDirectory else { return }

                try await settingsService.fetchProviders()
                try await settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDirectory)

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
                        } catch {
                            availableModels = providers.flatMap { $0.models.map { $0.id } }
                        }
                    }
                }
            } catch {
                // Failed to load model settings
            }

            requestTokenEstimation()
        }
    }

    func invalidateModelCache() {
        modelsLoadedAt = nil
    }

    func saveModelPreference(_ model: String) {
        selectedModel = model
        Task {
            do {
                guard let projectDirectory = container?.sessionService.currentSession?.projectDirectory else { return }

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
