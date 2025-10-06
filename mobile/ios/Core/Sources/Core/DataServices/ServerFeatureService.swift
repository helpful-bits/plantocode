import Foundation
import Combine

/// Service for accessing server-side features like text enhancement and audio transcription
@MainActor
public class ServerFeatureService: ObservableObject {

    // MARK: - Published Properties
    @Published public private(set) var isLoading = false
    @Published public private(set) var lastError: DataServiceError?

    // MARK: - Private Properties
    private let serverAPIClient: ServerAPIClient
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(serverAPIClient: ServerAPIClient = ServerAPIClient.shared) {
        self.serverAPIClient = serverAPIClient
    }

    // MARK: - Text Enhancement

    /// Enhance text using server-side LLM capabilities
    /// First tries RPC "actions.refineTaskDescription" via relay, then falls back to HTTP POST
    public func enhanceText(_ text: String) async throws -> TextEnhancementResponse {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DataServiceError.invalidRequest("Text cannot be empty")
        }

        isLoading = true
        defer { isLoading = false }

        // First try RPC via relay if we have an active desktop connection
        if let deviceId = await MultiConnectionManager.shared.activeDeviceId,
           let relayClient = await MultiConnectionManager.shared.relayConnection(for: deviceId) {

            do {
                let rpcRequest = RpcRequest(
                    method: "actions.refineTaskDescription",
                    params: ["text": text],
                    id: UUID().uuidString
                )

                // Try RPC call via relay
                for try await rpcResponse in relayClient.invoke(
                    targetDeviceId: deviceId.uuidString,
                    request: rpcRequest,
                    timeout: 30.0
                ) {
                    if let result = rpcResponse.result?.value as? [String: Any],
                       let enhancedText = result["enhancedText"] as? String {

                        return TextEnhancementResponse(
                            originalText: text,
                            enhancedText: enhancedText,
                            improvements: result["improvements"] as? [String] ?? [],
                            processingTimeMs: result["processingTimeMs"] as? Int ?? 0
                        )
                    }

                    if let error = rpcResponse.error {
                        // RPC failed, continue to fallback
                        print("RPC enhancement failed: \(error.message)")
                        break
                    }
                }
            } catch {
                // RPC failed, continue to fallback
                print("RPC relay enhancement failed: \(error.localizedDescription)")
            }
        }

        // Fallback to HTTP POST /api/text-enhancement
        do {
            let request = TextEnhancementRequest(
                text: text,
                options: TextEnhancementOptions()
            )

            let response: TextEnhancementResponse = try await serverAPIClient.request(
                path: "api/text-enhancement",
                method: .POST,
                body: request,
                token: await getCurrentAuthToken(),
                includeDeviceId: true
            )

            return response

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            throw serviceError
        }
    }

    // MARK: - Audio Transcription

    /// Transcribe audio data using server-side speech-to-text
    public func transcribeAudio(_ audioData: Data, mimeType: String = "audio/wav") async throws -> TranscriptionResponse {
        guard !audioData.isEmpty else {
            throw DataServiceError.invalidRequest("Audio data cannot be empty")
        }

        isLoading = true
        defer { isLoading = false }

        do {
            // For multipart upload, we need to create the request manually
            let response = try await uploadAudioForTranscription(audioData, mimeType: mimeType)
            return response

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            throw serviceError
        }
    }

    // MARK: - Private Methods

    private func uploadAudioForTranscription(_ audioData: Data, mimeType: String) async throws -> TranscriptionResponse {
        // Create multipart form data request
        let boundary = UUID().uuidString
        let contentType = "multipart/form-data; boundary=\(boundary)"

        var bodyData = Data()

        // Add audio file part
        bodyData.append("--\(boundary)\r\n".data(using: .utf8)!)
        bodyData.append("Content-Disposition: form-data; name=\"audio\"; filename=\"audio.wav\"\r\n".data(using: .utf8)!)
        bodyData.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        bodyData.append(audioData)
        bodyData.append("\r\n".data(using: .utf8)!)

        // Add options part
        bodyData.append("--\(boundary)\r\n".data(using: .utf8)!)
        bodyData.append("Content-Disposition: form-data; name=\"options\"\r\n".data(using: .utf8)!)
        bodyData.append("Content-Type: application/json\r\n\r\n".data(using: .utf8)!)

        let options = TranscriptionOptions()
        let optionsData = try JSONEncoder().encode(options)
        bodyData.append(optionsData)
        bodyData.append("\r\n".data(using: .utf8)!)

        // Close boundary
        bodyData.append("--\(boundary)--\r\n".data(using: .utf8)!)

        // Create URL request
        let baseURL = serverAPIClient.baseURL ?? Config.serverURL
        guard let url = URL(string: "\(baseURL)/api/audio/transcriptions") else {
            throw DataServiceError.invalidRequest("Invalid transcription URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")

        if let token = await getCurrentAuthToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let deviceId = DeviceManager.shared.getOrCreateDeviceID()
        request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        request.setValue(deviceId, forHTTPHeaderField: "X-Token-Binding")

        request.httpBody = bodyData

        // Perform request
        let (responseData, httpResponse) = try await URLSession.shared.data(for: request)

        guard let httpResponse = httpResponse as? HTTPURLResponse else {
            throw DataServiceError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw DataServiceError.serverError("HTTP \(httpResponse.statusCode)")
        }

        do {
            return try JSONDecoder().decode(TranscriptionResponse.self, from: responseData)
        } catch {
            throw DataServiceError.invalidResponse("Failed to decode transcription response")
        }
    }

    private func getCurrentAuthToken() async -> String? {
        // This should be implemented to get the current auth token
        // from the AuthService or similar. For now, return nil
        return await AuthService.shared.getValidAccessToken()
    }

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

// MARK: - Supporting Types

public struct TextEnhancementRequest: Codable {
    public let text: String
    public let options: TextEnhancementOptions

    public init(text: String, options: TextEnhancementOptions = TextEnhancementOptions()) {
        self.text = text
        self.options = options
    }
}

public struct TextEnhancementOptions: Codable {
    public let style: String
    public let tone: String
    public let maxLength: Int?
    public let preserveMarkdown: Bool

    public init(
        style: String = "improve",
        tone: String = "professional",
        maxLength: Int? = nil,
        preserveMarkdown: Bool = true
    ) {
        self.style = style
        self.tone = tone
        self.maxLength = maxLength
        self.preserveMarkdown = preserveMarkdown
    }
}

public struct TextEnhancementResponse: Codable {
    public let originalText: String
    public let enhancedText: String
    public let improvements: [String]
    public let processingTimeMs: Int

    public init(originalText: String, enhancedText: String, improvements: [String], processingTimeMs: Int) {
        self.originalText = originalText
        self.enhancedText = enhancedText
        self.improvements = improvements
        self.processingTimeMs = processingTimeMs
    }
}

public struct TranscriptionOptions: Codable {
    public let language: String?
    public let model: String
    public let includeTimestamps: Bool
    public let includeConfidence: Bool

    public init(
        language: String? = nil,
        model: String = "whisper",
        includeTimestamps: Bool = false,
        includeConfidence: Bool = false
    ) {
        self.language = language
        self.model = model
        self.includeTimestamps = includeTimestamps
        self.includeConfidence = includeConfidence
    }
}

public struct TranscriptionResponse: Codable {
    public let text: String
    public let language: String?
    public let confidence: Double?
    public let duration: Double?
    public let segments: [TranscriptionSegment]?

    public init(text: String, language: String?, confidence: Double?, duration: Double?, segments: [TranscriptionSegment]?) {
        self.text = text
        self.language = language
        self.confidence = confidence
        self.duration = duration
        self.segments = segments
    }
}

public struct TranscriptionSegment: Codable {
    public let text: String
    public let start: Double
    public let end: Double
    public let confidence: Double?

    public init(text: String, start: Double, end: Double, confidence: Double?) {
        self.text = text
        self.start = start
        self.end = end
        self.confidence = confidence
    }
}

// Extension to support multipart form data
private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}

// Placeholder for ServerAPIClient baseURL property
private extension ServerAPIClient {
    var baseURL: String? {
        return Config.serverURL
    }
}

// Placeholder for AuthService currentAccessToken
private extension AuthService {
    var currentAccessToken: String? {
        // This should return the actual access token from the current session
        return nil
    }
}