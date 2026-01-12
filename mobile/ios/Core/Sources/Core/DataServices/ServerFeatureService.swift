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

    /// Enhance text using relay-first approach: call text.enhance, poll job.get until complete
    public func enhanceText(
        _ text: String,
        sessionId: String,
        projectDirectory: String?,
        timeoutSeconds: Double = 120
    ) async throws -> TextEnhancementResponse {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DataServiceError.invalidRequest("Text cannot be empty")
        }

        isLoading = true
        lastError = nil
        defer { isLoading = false }

        let startTime = Date()

        // Relay-first: try via CommandRouter if connected
        if let deviceId = await MultiConnectionManager.shared.activeDeviceId,
           await MultiConnectionManager.shared.relayConnection(for: deviceId) != nil {

            do {
                // Step 1: Call text.enhance to create job
                var jobId: String?
                for try await response in CommandRouter.textEnhance(
                    text: text,
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                ) {
                    if let result = response.result?.value as? [String: Any],
                       let id = result["jobId"] as? String {
                        jobId = id
                        break
                    }
                    if let error = response.error {
                        print("text.enhance RPC failed: \(error.message)")
                        break
                    }
                }

                guard let jobId = jobId else {
                    throw DataServiceError.serverError("Failed to get jobId from text.enhance")
                }

                // Step 2: Poll job.get until completed/failed/canceled or timeout
                let pollInterval: TimeInterval = 0.8
                var elapsedTime: TimeInterval = 0

                while elapsedTime < timeoutSeconds {
                    try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
                    elapsedTime = Date().timeIntervalSince(startTime)

                    var jobData: [String: Any]?
                    for try await response in CommandRouter.jobGet(jobId: jobId) {
                        if let result = response.result?.value as? [String: Any],
                           let job = result["job"] as? [String: Any] {
                            jobData = job
                            break
                        }
                    }

                    guard let job = jobData else { continue }
                    guard let status = job["status"] as? String else { continue }

                    if status == "completed" {
                        // Extract enhanced text from job response
                        let enhancedText = job["response"] as? String ?? text
                        let processingTime = Int(elapsedTime * 1000)

                        return TextEnhancementResponse(
                            originalText: text,
                            enhancedText: enhancedText,
                            improvements: [],
                            processingTimeMs: processingTime
                        )
                    } else if status == "failed" || status == "canceled" {
                        let errorMsg = job["error"] as? String ?? "Job \(status)"
                        throw DataServiceError.serverError(errorMsg)
                    }
                    // else: status is "pending" or "processing", continue polling
                }

                // NOTE: DataServiceError.timeout does not accept a String parameter in the current enum definition
                // Using the existing .timeout case instead of .timeout(String)
                throw DataServiceError.timeout

            } catch is CancellationError {
                throw DataServiceError.cancelled
            } catch {
                print("Relay enhancement failed: \(error.localizedDescription), falling back to HTTP")
                throw DataServiceError.networkError(error)
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
                token: await getCurrentAuthToken()
            )

            return response

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            throw serviceError
        }
    }

    public func refineText(
        _ text: String,
        sessionId: String,
        projectDirectory: String?,
        relevantFiles: [String] = [],
        timeoutSeconds: Double = 120
    ) async throws -> TextEnhancementResponse {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DataServiceError.invalidRequest("Text cannot be empty")
        }

        guard !sessionId.isEmpty else {
            throw DataServiceError.invalidRequest("Missing sessionId")
        }

        isLoading = true
        lastError = nil
        defer { isLoading = false }

        let startTime = Date()

        // Relay-first: call text.refine
        let stream = CommandRouter.textRefine(
            text: text,
            sessionId: sessionId,
            projectDirectory: projectDirectory,
            relevantFiles: relevantFiles
        )

        // Get jobId from initial response
        var jobId: String?
        for try await response in stream {
            if let result = response.result?.value as? [String: Any],
               let id = result["jobId"] as? String {
                jobId = id
                break
            }
            if let error = response.error {
                throw DataServiceError.serverError(error.message)
            }
        }

        guard let jobId = jobId else {
            throw DataServiceError.serverError("Failed to get jobId from text.refine")
        }

        // Poll job.get until completed/failed/canceled or timeout
        let deadline = Date().addingTimeInterval(timeoutSeconds)

        while Date() < deadline {
            let jobStream = CommandRouter.jobGet(jobId: jobId)

            for try await chunk in jobStream {
                if let result = chunk.result?.value as? [String: Any],
                   let job = result["job"] as? [String: Any],
                   let status = job["status"] as? String {

                    if status == "completed" {
                        let refinedText = job["response"] as? String ?? text
                        let elapsed = Date().timeIntervalSince(startTime)
                        return TextEnhancementResponse(
                            originalText: text,
                            enhancedText: refinedText,
                            improvements: [],
                            processingTimeMs: Int(elapsed * 1000)
                        )
                    } else if status == "failed" || status == "canceled" {
                        let errorMsg = job["error"] as? String ?? "Refinement \(status)"
                        throw DataServiceError.serverError(errorMsg)
                    }
                }
            }

            try await Task.sleep(nanoseconds: 800_000_000) // 800ms poll interval
        }

        throw DataServiceError.timeout
    }

    // MARK: - Audio Transcription

    /// Transcribe audio data using server HTTP endpoint (desktop doesn't support RPC transcription)
    public func transcribeAudio(
        _ audioData: Data,
        durationMs: Int64,
        model: String? = nil,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil,
        timeoutSeconds: Double = 90
    ) async throws -> TranscriptionResponse {
        guard !audioData.isEmpty else {
            throw DataServiceError.invalidRequest("Audio data cannot be empty")
        }

        guard durationMs > 0 else {
            throw DataServiceError.invalidRequest("Duration must be greater than 0")
        }

        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            return try await performTranscriptionRequestWithRetry(
                audioData,
                durationMs: durationMs,
                model: model,
                language: language,
                prompt: prompt,
                temperature: temperature,
                timeoutSeconds: timeoutSeconds
            )
        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            throw serviceError
        }
    }

    // MARK: - Private Methods

    private func withTimeout<T>(_ seconds: Double, operation: @escaping () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw DataServiceError.timeout
            }

            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }

    private func performTranscriptionRequestWithRetry(
        _ audioData: Data,
        durationMs: Int64,
        model: String?,
        language: String?,
        prompt: String?,
        temperature: Double?,
        timeoutSeconds: Double,
        maxAttempts: Int = 3
    ) async throws -> TranscriptionResponse {
        var lastError: Error?

        for attempt in 1...maxAttempts {
            do {
                return try await withTimeout(timeoutSeconds) {
                    try await self.uploadAudioForTranscription(
                        audioData,
                        durationMs: durationMs,
                        model: model,
                        language: language,
                        prompt: prompt,
                        temperature: temperature
                    )
                }
            } catch {
                lastError = error
                let serviceError = mapToDataServiceError(error)

                switch serviceError {
                case .timeout, .networkError, .serviceUnavailable:
                    if attempt < maxAttempts {
                        let delay = pow(2.0, Double(attempt - 1)) * 0.8
                        try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                        continue
                    }
                    throw serviceError
                default:
                    throw serviceError
                }
            }
        }

        throw mapToDataServiceError(lastError!)
    }

    private func uploadAudioForTranscription(
        _ audioData: Data,
        durationMs: Int64,
        model: String?,
        language: String?,
        prompt: String?,
        temperature: Double?
    ) async throws -> TranscriptionResponse {
        let safeDurationMs = max(1, durationMs)
        let boundary = UUID().uuidString
        let contentType = "multipart/form-data; boundary=\(boundary)"

        var bodyData = Data()

        // Field: file (server expects this name)
        // Use audio/mp4 (M4A/AAC) for smaller file sizes and faster uploads
        // M4A is ~10x smaller than WAV for the same audio duration
        bodyData.append("--\(boundary)\r\n")
        bodyData.append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.m4a\"\r\n")
        bodyData.append("Content-Type: audio/mp4\r\n\r\n")
        bodyData.append(audioData)
        bodyData.append("\r\n")

        // Field: model (required - must be provided, use server default "openai/gpt-4o-transcribe" as fallback)
        let modelToUse = model ?? "openai/gpt-4o-transcribe"
        bodyData.append("--\(boundary)\r\n")
        bodyData.append("Content-Disposition: form-data; name=\"model\"\r\n\r\n")
        bodyData.append(modelToUse + "\r\n")

        // Field: durationMs (required by server)
        bodyData.append("--\(boundary)\r\n")
        bodyData.append("Content-Disposition: form-data; name=\"durationMs\"\r\n\r\n")
        bodyData.append("\(safeDurationMs)\r\n")

        // Field: language (optional)
        if let language = language {
            bodyData.append("--\(boundary)\r\n")
            bodyData.append("Content-Disposition: form-data; name=\"language\"\r\n\r\n")
            bodyData.append(language + "\r\n")
        }

        // Field: prompt (optional)
        if let prompt = prompt {
            bodyData.append("--\(boundary)\r\n")
            bodyData.append("Content-Disposition: form-data; name=\"prompt\"\r\n\r\n")
            bodyData.append(prompt + "\r\n")
        }

        // Field: temperature (optional)
        if let temperature = temperature {
            bodyData.append("--\(boundary)\r\n")
            bodyData.append("Content-Disposition: form-data; name=\"temperature\"\r\n\r\n")
            bodyData.append("\(temperature)\r\n")
        }

        bodyData.append("--\(boundary)--\r\n")

        let cleanedBase = Config.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(cleanedBase)/api/audio/transcriptions") else {
            throw DataServiceError.invalidRequest("Invalid transcription URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")

        guard let token = await getCurrentAuthToken() else {
            throw DataServiceError.authenticationError("Missing authentication token")
        }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let deviceId = DeviceManager.shared.getOrCreateDeviceID()
        request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        request.setValue(deviceId, forHTTPHeaderField: "X-Token-Binding")

        request.httpBody = bodyData

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 90
        config.timeoutIntervalForResource = 240
        let session = URLSession(configuration: config)

        let (responseData, httpResponse) = try await session.data(for: request)

        guard let httpResponse = httpResponse as? HTTPURLResponse else {
            throw DataServiceError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw DataServiceError.serverError("HTTP \(httpResponse.statusCode)")
        }

        return try JSONDecoder().decode(TranscriptionResponse.self, from: responseData)
    }

    public struct TranscriptionChunk: Decodable {
        public let text: String
        public let done: Bool
    }

    public func transcribeAudioStreaming(
        _ audioData: Data,
        durationMs: Int64,
        model: String,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let safeDurationMs = max(1, durationMs)
                    let boundary = UUID().uuidString
                    let contentType = "multipart/form-data; boundary=\(boundary)"

                    var bodyData = Data()

                    // Field: file
                    bodyData.append("--\(boundary)\r\n")
                    bodyData.append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.m4a\"\r\n")
                    bodyData.append("Content-Type: audio/mp4\r\n\r\n")
                    bodyData.append(audioData)
                    bodyData.append("\r\n")

                    bodyData.append("--\(boundary)\r\n")
                    bodyData.append("Content-Disposition: form-data; name=\"model\"\r\n\r\n")
                    bodyData.append(model + "\r\n")

                    bodyData.append("--\(boundary)\r\n")
                    bodyData.append("Content-Disposition: form-data; name=\"durationMs\"\r\n\r\n")
                    bodyData.append("\(safeDurationMs)\r\n")

                    if let language = language {
                        bodyData.append("--\(boundary)\r\n")
                        bodyData.append("Content-Disposition: form-data; name=\"language\"\r\n\r\n")
                        bodyData.append(language + "\r\n")
                    }

                    if let prompt = prompt {
                        bodyData.append("--\(boundary)\r\n")
                        bodyData.append("Content-Disposition: form-data; name=\"prompt\"\r\n\r\n")
                        bodyData.append(prompt + "\r\n")
                    }

                    if let temperature = temperature {
                        bodyData.append("--\(boundary)\r\n")
                        bodyData.append("Content-Disposition: form-data; name=\"temperature\"\r\n\r\n")
                        bodyData.append("\(temperature)\r\n")
                    }

                    bodyData.append("--\(boundary)--\r\n")

                    let cleanedBase = Config.serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                    guard let url = URL(string: "\(cleanedBase)/api/audio/transcriptions/stream") else {
                        throw DataServiceError.invalidRequest("Invalid streaming transcription URL")
                    }

                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    guard let token = await self.getCurrentAuthToken() else {
                        throw DataServiceError.authenticationError("Missing authentication token")
                    }
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

                    let deviceId = DeviceManager.shared.getOrCreateDeviceID()
                    request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
                    request.setValue(deviceId, forHTTPHeaderField: "X-Token-Binding")

                    request.httpBody = bodyData

                    let config = URLSessionConfiguration.default
                    config.timeoutIntervalForRequest = 90
                    config.timeoutIntervalForResource = 240
                    let session = URLSession(configuration: config)

                    let (bytes, httpResponse) = try await session.bytes(for: request)

                    guard let httpResponse = httpResponse as? HTTPURLResponse else {
                        throw DataServiceError.networkError(URLError(.badServerResponse))
                    }

                    guard (200...299).contains(httpResponse.statusCode) else {
                        throw DataServiceError.serverError("HTTP \(httpResponse.statusCode)")
                    }

                    var buffer = ""
                    for try await byte in bytes {
                        buffer.append(Character(UnicodeScalar(byte)))

                        while let range = buffer.range(of: "\n\n") {
                            let line = String(buffer[..<range.lowerBound])
                            buffer.removeSubrange(..<range.upperBound)

                            if line.hasPrefix("data: ") {
                                let jsonStr = String(line.dropFirst(6))
                                if let jsonData = jsonStr.data(using: .utf8),
                                   let chunk = try? JSONDecoder().decode(TranscriptionChunk.self, from: jsonData) {
                                    if !chunk.text.isEmpty {
                                        continuation.yield(chunk.text)
                                    }
                                    if chunk.done {
                                        continuation.finish()
                                        return
                                    }
                                }
                            }
                        }
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    private func getCurrentAuthToken() async -> String? {
        // This should be implemented to get the current auth token
        // from the AuthService or similar. For now, return nil
        return await AuthService.shared.getValidAccessToken()
    }

    private func mapToDataServiceError(_ error: Error) -> DataServiceError {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut, .networkConnectionLost, .notConnectedToInternet:
                return .timeout
            default:
                return .networkError(urlError)
            }
        } else if let networkError = error as? NetworkError {
            switch networkError {
            case .invalidURL:
                return .invalidRequest("Invalid URL")
            case .requestFailed(let underlying):
                return .networkError(underlying)
            case .invalidResponse(let statusCode, _):
                return .serverError("HTTP \(statusCode)")
            case .decodingFailed(let underlying):
                return .invalidResponse("Decoding failed: \(underlying.localizedDescription)")
            case .serverError(let apiError):
                return .serverError(apiError.message)
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
