import Foundation
import Combine

public struct ServerModelSettings: Codable {
    public let model: String
    public let temperature: Double
    public let maxTokens: Int
    public let allowedModels: [String]

    public init(model: String, temperature: Double, maxTokens: Int, allowedModels: [String]) {
        self.model = model
        self.temperature = temperature
        self.maxTokens = maxTokens
        self.allowedModels = allowedModels
    }
}

@MainActor
public final class SettingsDataService: ObservableObject {
    @Published public private(set) var providers: [ProviderWithModels] = []
    @Published public var projectTaskSettings: ProjectTaskSettings = [:]
    @Published public private(set) var currentSystemPrompt: String?
    @Published public private(set) var isSystemPromptCustom: Bool = false
    @Published public private(set) var preferredTerminal: String?
    @Published public private(set) var preferredCliTool: String?
    @Published public private(set) var cliAdditionalArgs: String?
    @Published public private(set) var customCliCommand: String?

    // Backward compatibility for read-only settings view
    @Published public private(set) var modelSettings: ServerModelSettings?

    public init() {}

    // MARK: - Providers
    public func fetchProviders() async throws {
        for try await res in CommandRouter.settingsGetProvidersWithModels() {
            if let dict = res.resultDict, let arr = dict["providers"] {
                let data = try JSONSerialization.data(withJSONObject: arr)
                self.providers = try JSONDecoder().decode([ProviderWithModels].self, from: data)
            }
        }
    }

    // MARK: - Default Settings (optional reference)
    public func fetchServerDefaults() async throws -> ProjectTaskSettings {
        var out: ProjectTaskSettings = [:]
        for try await res in CommandRouter.settingsGetDefaultTaskModelSettings() {
            if let dict = res.resultDict {
                let decoder = configuredDecoder()
                do {
                    let data = try JSONSerialization.data(withJSONObject: dict)
                    out = try decoder.decode(ProjectTaskSettings.self, from: data)
                } catch {
                    let sanitized = sanitizeTaskSettingsDictionary(dict)
                    let data = try JSONSerialization.data(withJSONObject: sanitized)
                    out = try decoder.decode(ProjectTaskSettings.self, from: data)
                }
            }
        }
        return out
    }

    // MARK: - Project Settings
    public func fetchProjectTaskModelSettings(projectDirectory: String) async throws {
        for try await res in CommandRouter.settingsGetProjectTaskModelSettings(projectDirectory: projectDirectory) {
            if let dict = res.resultDict {
                let decoder = configuredDecoder()
                do {
                    let data = try JSONSerialization.data(withJSONObject: dict)
                    self.projectTaskSettings = try decoder.decode(ProjectTaskSettings.self, from: data)
                } catch {
                    let sanitized = sanitizeTaskSettingsDictionary(dict)
                    let data = try JSONSerialization.data(withJSONObject: sanitized)
                    self.projectTaskSettings = try decoder.decode(ProjectTaskSettings.self, from: data)
                }
            }
        }
    }

    public func setProjectTaskSetting(projectDirectory: String, taskKey: String, settingKey: String, value: Any) async throws {
        _ = try await drain(CommandRouter.settingsSetProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: settingKey, value: value))
        _ = try await drain(CommandRouter.configRefreshRuntimeAIConfig())
    }

    public func resetProjectTaskSetting(projectDirectory: String, taskKey: String, settingKey: String) async throws {
        _ = try await drain(CommandRouter.settingsResetProjectTaskSetting(projectDirectory: projectDirectory, taskKey: taskKey, settingKey: settingKey))
        _ = try await drain(CommandRouter.configRefreshRuntimeAIConfig())
    }

    // MARK: - System Prompts
    public func loadProjectSystemPrompt(projectDirectory: String, taskType: String) async throws {
        var prompt: String?
        for try await res in CommandRouter.systemPromptsGetProject(projectDirectory: projectDirectory, taskType: taskType) {
            if let dict = res.resultDict {
                // systemPrompt is a nested object with a "systemPrompt" field
                if let systemPromptObj = dict["systemPrompt"] as? [String: Any] {
                    prompt = systemPromptObj["systemPrompt"] as? String
                } else {
                    // Fallback: try direct string access
                    prompt = dict["systemPrompt"] as? String
                }
            }
        }
        self.currentSystemPrompt = prompt

        var custom = false
        for try await res in CommandRouter.systemPromptsIsProjectCustomized(projectDirectory: projectDirectory, taskType: taskType) {
            if let dict = res.resultDict, let v = dict["isCustom"] as? Bool { custom = v }
        }
        self.isSystemPromptCustom = custom
    }

    public func setProjectSystemPrompt(projectDirectory: String, taskType: String, systemPrompt: String) async throws {
        _ = try await drain(CommandRouter.systemPromptsSetProject(projectDirectory: projectDirectory, taskType: taskType, systemPrompt: systemPrompt))
        try await loadProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
    }

    public func resetProjectSystemPrompt(projectDirectory: String, taskType: String) async throws {
        _ = try await drain(CommandRouter.systemPromptsResetProject(projectDirectory: projectDirectory, taskType: taskType))
        try await loadProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
    }

    public func fetchDefaultSystemPrompt(taskType: String) async throws -> String? {
        var prompt: String?
        for try await res in CommandRouter.systemPromptsGetDefault(taskType: taskType) {
            if let dict = res.resultDict {
                // Response structure: { "systemPrompt": { "systemPrompt": "actual text", ... } }
                // The outer "systemPrompt" is the DefaultSystemPrompt object
                // The inner "systemPrompt" is the actual prompt text
                if let systemPromptObj = dict["systemPrompt"] as? [String: Any] {
                    prompt = systemPromptObj["systemPrompt"] as? String
                } else {
                    // Fallback: try direct string access
                    prompt = dict["systemPrompt"] as? String
                }
            }
        }
        return prompt
    }

    // MARK: - Terminal Defaults (remote)
    public func loadPreferredTerminal() async throws {
        for try await res in CommandRouter.terminalGetDefaultShell() {
            if let dict = res.resultDict { self.preferredTerminal = dict["defaultShell"] as? String }
        }
    }

    public func savePreferredTerminal(value: String) async throws {
        _ = try await drain(CommandRouter.terminalSetDefaultShell(value))
        self.preferredTerminal = value
    }

    // MARK: - CLI Tool Settings
    public func loadCliToolSettings() async throws {
        // Load preferred CLI tool
        for try await res in CommandRouter.settingsGetAppSetting(key: "terminal.preferred_cli") {
            if let dict = res.resultDict { self.preferredCliTool = dict["value"] as? String }
        }

        // Load additional args
        for try await res in CommandRouter.settingsGetAppSetting(key: "terminal.additional_args") {
            if let dict = res.resultDict { self.cliAdditionalArgs = dict["value"] as? String }
        }

        // Load custom command if CLI is set to custom
        if preferredCliTool == "custom" {
            for try await res in CommandRouter.settingsGetAppSetting(key: "terminal.custom_command") {
                if let dict = res.resultDict { self.customCliCommand = dict["value"] as? String }
            }
        }
    }

    public func saveCliToolPreference(_ tool: String) async throws {
        _ = try await drain(CommandRouter.settingsSetAppSetting(key: "terminal.preferred_cli", value: tool))
        self.preferredCliTool = tool
    }

    public func saveCliAdditionalArgs(_ args: String) async throws {
        _ = try await drain(CommandRouter.settingsSetAppSetting(key: "terminal.additional_args", value: args))
        self.cliAdditionalArgs = args
    }

    public func saveCustomCliCommand(_ command: String) async throws {
        _ = try await drain(CommandRouter.settingsSetAppSetting(key: "terminal.custom_command", value: command))
        self.customCliCommand = command
    }

    // MARK: - Backward Compatibility
    public func fetchServerDefaultTaskModelSettings() async throws -> ServerModelSettings {
        let defaults = try await fetchServerDefaults()

        guard let settings = defaults["implementationPlan"] else {
            throw DataServiceError.invalidResponse("No 'implementationPlan' in server defaults")
        }

        let modelSettings = ServerModelSettings(
            model: settings.model,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            allowedModels: settings.allowedModels ?? []
        )
        self.modelSettings = modelSettings
        return modelSettings
    }

    // MARK: - Decoding Helpers
    private func configuredDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    private func sanitizeTaskSettingsDictionary(_ raw: [String: Any]) -> [String: Any] {
        var dict = raw
        for (task, value) in raw {
            guard var settings = value as? [String: Any] else { continue }

            if settings["maxTokens"] == nil, let v = settings["max_tokens"] { settings["maxTokens"] = v }
            if let v = settings["maxTokens"] {
                settings["maxTokens"] = coerceInt(v)
            }
            if let v = settings["temperature"] {
                settings["temperature"] = coerceDouble(v)
            }
            if let v = settings["model"], !(v is String) {
                settings["model"] = String(describing: v)
            }
            dict[task] = settings
        }
        return dict
    }

    private func coerceInt(_ v: Any) -> Int {
        if let i = v as? Int { return i }
        if let d = v as? Double { return Int(d) }
        if let s = v as? String, let i = Int(s) { return i }
        return 0
    }

    private func coerceDouble(_ v: Any) -> Double {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        if let s = v as? String, let d = Double(s) { return d }
        return 0.0
    }

    // MARK: - Helper
    private func drain(_ stream: AsyncThrowingStream<RpcResponse, Error>) async throws -> RpcResponse? {
        var last: RpcResponse?
        for try await r in stream { last = r }
        return last
    }
}
