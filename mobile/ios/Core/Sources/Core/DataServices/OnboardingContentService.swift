import Foundation
import Combine
import OSLog

// MARK: - Onboarding Data Models

/// Represents the onboarding manifest from the server
public struct OnboardingManifest: Codable {
    /// Dictionary mapping video keys to their URLs
    public let videos: [String: URL]

    public init(videos: [String: URL]) {
        self.videos = videos
    }
}

// MARK: - Onboarding Content Service

/// Service for fetching and managing onboarding content from the server
@MainActor
public class OnboardingContentService: ObservableObject {

    // MARK: - Published Properties

    /// The currently loaded onboarding manifest
    @Published public private(set) var manifest: OnboardingManifest?

    /// Loading state indicator
    @Published public private(set) var isLoading = false

    /// Last error encountered during operations
    @Published public private(set) var lastError: DataServiceError?

    // MARK: - Private Properties

    private let serverAPIClient: ServerAPIClient
    private let logger = Logger(subsystem: "PlanToCode", category: "OnboardingContentService")
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init(serverAPIClient: ServerAPIClient = ServerAPIClient.shared) {
        self.serverAPIClient = serverAPIClient
    }

    // MARK: - Public Methods

    /// Load the onboarding manifest from the server
    /// - Returns: The loaded onboarding manifest
    /// - Throws: DataServiceError if the request fails
    public func load() async throws -> OnboardingManifest {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            logger.info("Fetching onboarding manifest from server")

            // Fetch from public endpoint (no auth required)
            let loadedManifest: OnboardingManifest = try await serverAPIClient.request(
                path: "public/onboarding",
                method: .GET,
                body: nil as String?,
                token: nil
            )

            // Update published property
            manifest = loadedManifest

            logger.info("Successfully loaded onboarding manifest with \(loadedManifest.videos.count) video(s)")

            return loadedManifest

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Failed to load onboarding manifest: \(error.localizedDescription)")
            throw serviceError
        }
    }

    /// Get video URL for a specific screen key
    /// - Parameter key: The screen key (e.g., "intro", "features")
    /// - Returns: The video URL if available
    public func videoURL(for key: String) -> URL? {
        return manifest?.videos[key]
    }

    /// Check if manifest is loaded
    public var isLoaded: Bool {
        return manifest != nil
    }

    /// Clear the cached manifest
    public func clearManifest() {
        manifest = nil
        lastError = nil
        logger.info("Cleared onboarding manifest cache")
    }

    // MARK: - Private Methods

    private func mapToDataServiceError(_ error: Error) -> DataServiceError {
        if let apiError = error as? APIError {
            switch apiError {
            case .invalidURL:
                return .invalidRequest("Invalid URL")
            case .requestFailed(let underlying):
                return .networkError(underlying)
            case .invalidResponse(let statusCode, _):
                return .serverError("HTTP \(statusCode)")
            case .decodingFailed(let underlying):
                return .invalidResponse("Decoding failed: \(underlying.localizedDescription)")
            }
        } else if let serviceError = error as? DataServiceError {
            return serviceError
        } else {
            return .networkError(error)
        }
    }
}
