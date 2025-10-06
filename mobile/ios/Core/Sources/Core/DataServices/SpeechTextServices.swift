import Foundation
import Combine

@MainActor
public final class SpeechTextServices: ObservableObject {
    private let serverFeatureService = ServerFeatureService()

    public init() {}

    public func transcribeSpeech(audioData: Data) async throws -> String {
        let response = try await serverFeatureService.transcribeAudio(audioData)
        return response.text
    }

    public func enhanceText(_ text: String, style: String? = nil) async throws -> String {
        let response = try await serverFeatureService.enhanceText(text)
        return response.enhancedText
    }
}