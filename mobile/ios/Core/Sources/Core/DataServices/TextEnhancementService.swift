import Foundation
import Combine

@MainActor
public final class TextEnhancementService: ObservableObject {
    public static let shared = TextEnhancementService()

    @Published public private(set) var isEnhancing = false

    private let serverFeatureService = ServerFeatureService()

    private init() {}

    public func enhance(text: String, sessionId: String, projectDirectory: String?, context: String? = nil) async throws -> String {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw TextEnhancementError.emptyText
        }

        isEnhancing = true
        defer { isEnhancing = false }

        do {
            let response = try await serverFeatureService.enhanceText(text, sessionId: sessionId, projectDirectory: projectDirectory)
            return response.enhancedText
        } catch {
            throw TextEnhancementError.enhancementFailed(error)
        }
    }

    /// Session-aware enhancement using relay-first approach
    public func enhance(
        text: String,
        context: String? = nil,
        sessionId: String,
        projectDirectory: String?,
        timeoutSeconds: Double = 120
    ) async throws -> String {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw TextEnhancementError.emptyText
        }

        isEnhancing = true
        defer { isEnhancing = false }

        do {
            let response = try await serverFeatureService.enhanceText(
                text,
                sessionId: sessionId,
                projectDirectory: projectDirectory,
                timeoutSeconds: timeoutSeconds
            )
            return response.enhancedText
        } catch {
            throw TextEnhancementError.enhancementFailed(error)
        }
    }

    public func refine(
        text: String,
        sessionId: String,
        projectDirectory: String?,
        relevantFiles: [String] = [],
        timeoutSeconds: Double = 120
    ) async throws -> String {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw TextEnhancementError.emptyText
        }

        isEnhancing = true
        defer { isEnhancing = false }

        let response = try await serverFeatureService.refineText(
            text,
            sessionId: sessionId,
            projectDirectory: projectDirectory,
            relevantFiles: relevantFiles,
            timeoutSeconds: timeoutSeconds
        )

        return response.enhancedText
    }
}

// MARK: - Error Types

public enum TextEnhancementError: Error, LocalizedError {
    case emptyText
    case enhancementFailed(Error)

    public var errorDescription: String? {
        switch self {
        case .emptyText:
            return "Text cannot be empty"
        case .enhancementFailed(let error):
            return "Text enhancement failed: \(error.localizedDescription)"
        }
    }
}