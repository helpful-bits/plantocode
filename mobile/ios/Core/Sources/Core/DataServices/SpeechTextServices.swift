import Foundation
import Combine

@MainActor
public final class SpeechTextServices: ObservableObject {
    private let serverFeatureService = ServerFeatureService()

    public init() {}

    public func transcribeSpeech(
        audioData: Data,
        durationMs: Int64 = 1000,
        model: String? = nil,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil
    ) async throws -> String {
        let response = try await serverFeatureService.transcribeAudio(
            audioData,
            durationMs: durationMs,
            model: model,
            language: language,
            prompt: prompt,
            temperature: temperature
        )
        return response.text
    }
}