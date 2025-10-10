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

    public func getRawProjectTaskSetting(projectDirectory: String, taskKey: String, settingKey: String) async throws -> Any? {
        for try await res in CommandRouter.settingsGetProjectTaskModelSettings(projectDirectory: projectDirectory) {
            if let dict = res.resultDict {
                // Try camelCase task key first
                if let taskSettings = dict[taskKey] as? [String: Any] {
                    // Try exact settingKey
                    if let value = taskSettings[settingKey] {
                        return value
                    }
                    // Try snake_case variant for language_code
                    if settingKey == "languageCode", let value = taskSettings["language_code"] {
                        return value
                    }
                }
                // Try snake_case task key
                let snakeCaseTaskKey = toSnakeCase(taskKey)
                if let taskSettings = dict[snakeCaseTaskKey] as? [String: Any] {
                    // Try exact settingKey
                    if let value = taskSettings[settingKey] {
                        return value
                    }
                    // Try snake_case variant
                    if settingKey == "languageCode", let value = taskSettings["language_code"] {
                        return value
                    }
                }
            }
        }
        return nil
    }

    private func toSnakeCase(_ str: String) -> String {
        var result = ""
        for (index, char) in str.enumerated() {
            if char.isUppercase {
                if index > 0 {
                    result += "_"
                }
                result += char.lowercased()
            } else {
                result += String(char)
            }
        }
        return result
    }

    private func canonicalizeTaskType(_ taskType: String) -> String {
        return toSnakeCase(taskType)
    }

    // MARK: - System Prompts
    public func loadProjectSystemPrompt(projectDirectory: String, taskType: String) async throws {
        let normalizedTaskType = canonicalizeTaskType(taskType)
        var prompt: String?

        // Backend returns: { "systemPrompt": { "systemPrompt": "text", "isCustom": true, ... } }
        // or { "systemPrompt": null } when no custom prompt exists
        for try await res in CommandRouter.systemPromptsGetProject(projectDirectory: projectDirectory, taskType: normalizedTaskType) {
            if let dict = res.resultDict,
               let systemPromptObj = dict["systemPrompt"] as? [String: Any],
               let p = systemPromptObj["systemPrompt"] as? String {
                prompt = p
            }
        }

        // Fallback: try original taskType if normalized differs and no result
        if prompt == nil && normalizedTaskType != taskType {
            for try await res in CommandRouter.systemPromptsGetProject(projectDirectory: projectDirectory, taskType: taskType) {
                if let dict = res.resultDict,
                   let systemPromptObj = dict["systemPrompt"] as? [String: Any],
                   let p = systemPromptObj["systemPrompt"] as? String {
                    prompt = p
                }
            }
        }
        self.currentSystemPrompt = prompt

        // Backend returns: { "isCustom": true, "isCustomized": true }
        var custom = false
        for try await res in CommandRouter.systemPromptsIsProjectCustomized(projectDirectory: projectDirectory, taskType: normalizedTaskType) {
            if let dict = res.resultDict,
               let isCustom = dict["isCustom"] as? Bool {
                custom = isCustom
            }
        }
        self.isSystemPromptCustom = custom
    }

    public func setProjectSystemPrompt(projectDirectory: String, taskType: String, systemPrompt: String) async throws {
        let normalizedTaskType = canonicalizeTaskType(taskType)
        _ = try await drain(CommandRouter.systemPromptsSetProject(projectDirectory: projectDirectory, taskType: normalizedTaskType, systemPrompt: systemPrompt))
        try await loadProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
    }

    public func resetProjectSystemPrompt(projectDirectory: String, taskType: String) async throws {
        let normalizedTaskType = canonicalizeTaskType(taskType)
        _ = try await drain(CommandRouter.systemPromptsResetProject(projectDirectory: projectDirectory, taskType: normalizedTaskType))
        try await loadProjectSystemPrompt(projectDirectory: projectDirectory, taskType: taskType)
    }

    public func fetchDefaultSystemPrompt(taskType: String) async throws -> String? {
        let normalizedTaskType = canonicalizeTaskType(taskType)
        var prompt: String?

        // Backend returns: { "systemPrompt": "text" } or { "systemPrompt": null }
        // or potentially { "systemPrompt": { ... } } if server returns structured data
        for try await res in CommandRouter.systemPromptsGetDefault(taskType: normalizedTaskType) {
            if let dict = res.resultDict {
                // Try direct string access first (most common case)
                if let p = dict["systemPrompt"] as? String {
                    prompt = p
                }
                // Fallback: try nested object structure
                else if let systemPromptObj = dict["systemPrompt"] as? [String: Any],
                        let p = systemPromptObj["systemPrompt"] as? String {
                    prompt = p
                }
            }
        }

        // Fallback: try original taskType if normalized differs and no result
        if prompt == nil && normalizedTaskType != taskType {
            for try await res in CommandRouter.systemPromptsGetDefault(taskType: taskType) {
                if let dict = res.resultDict {
                    if let p = dict["systemPrompt"] as? String {
                        prompt = p
                    }
                    else if let systemPromptObj = dict["systemPrompt"] as? [String: Any],
                            let p = systemPromptObj["systemPrompt"] as? String {
                        prompt = p
                    }
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
        // Backend uses camelCase serialization - use default keys
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
