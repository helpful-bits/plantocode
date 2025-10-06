import Foundation
import Combine

@MainActor
public final class TextEnhancementService: ObservableObject {
    public static let shared = TextEnhancementService()

    @Published public private(set) var isEnhancing = false

    private let serverFeatureService = ServerFeatureService()

    private init() {}

    public func enhance(text: String, context: String? = nil) async throws -> String {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw TextEnhancementError.emptyText
        }

        isEnhancing = true
        defer { isEnhancing = false }

        do {
            let response = try await serverFeatureService.enhanceText(text)
            return response.enhancedText
        } catch {
            throw TextEnhancementError.enhancementFailed(error)
        }
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