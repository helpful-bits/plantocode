import Foundation

/// Response structure for implementation plan prompts
public struct PromptResponse: Codable {
    public let systemPrompt: String
    public let userPrompt: String
    public let combinedPrompt: String

    public init(systemPrompt: String, userPrompt: String, combinedPrompt: String) {
        self.systemPrompt = systemPrompt
        self.userPrompt = userPrompt
        self.combinedPrompt = combinedPrompt
    }
}
