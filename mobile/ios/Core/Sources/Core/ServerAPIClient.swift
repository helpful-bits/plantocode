import Foundation
import OSLog

public enum NetworkError: Error, LocalizedError {
    case invalidURL
    case requestFailed(Error)
    case invalidResponse(statusCode: Int, data: Data?)
    case decodingFailed(Error)
    case serverError(APIError)

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .requestFailed(let err): return "Request failed: \(err.localizedDescription)"
        case .invalidResponse(let code, _): return "Invalid response status: \(code)"
        case .decodingFailed(let err): return "Decoding failed: \(err.localizedDescription)"
        case .serverError(let apiError): return apiError.message
        }
    }
}

public final class ServerAPIClient {
    public static let shared = ServerAPIClient(baseURLProvider: { Config.serverURL })
    public static let auth = ServerAPIClient(baseURLProvider: { Config.authServerURL })

    public static let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        return encoder
    }()

    public static let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()

    private let baseURLProvider: () -> String
    private var baseURL: String { baseURLProvider() }
    private let urlSession: URLSession
    private let logger = Logger(subsystem: "PlanToCode", category: "NetworkRequest")
    private let deviceManager = DeviceManager.shared

    private let taskRegistryLock = NSLock()
    private var inFlightTasks: [String: Task<Void, Never>] = [:]

    public func registerTask(_ task: Task<Void, Never>, identifier: String) {
        taskRegistryLock.lock()
        defer { taskRegistryLock.unlock() }
        inFlightTasks[identifier] = task
    }

    public func unregisterTask(identifier: String) {
        taskRegistryLock.lock()
        defer { taskRegistryLock.unlock() }
        inFlightTasks.removeValue(forKey: identifier)
    }

    public func cancelAllTasks() {
        taskRegistryLock.lock()
        let tasks = inFlightTasks
        inFlightTasks.removeAll()
        taskRegistryLock.unlock()

        for (_, task) in tasks {
            task.cancel()
        }
        logger.info("Cancelled \(tasks.count) in-flight tasks")
    }

    public init(baseURL: String) {
        self.baseURLProvider = { baseURL }
        let pinningDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.urlSession = URLSession(configuration: .default, delegate: pinningDelegate, delegateQueue: nil)
    }

    public init(baseURLProvider: @escaping () -> String) {
        self.baseURLProvider = baseURLProvider
        let pinningDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.urlSession = URLSession(configuration: .default, delegate: pinningDelegate, delegateQueue: nil)
    }

    // MARK: - Common Headers

    public func applyCommonHeaders(_ request: inout URLRequest, token: String? = nil) {
        request.setValue(deviceManager.deviceId.uuidString, forHTTPHeaderField: "X-Device-ID")
        request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    // MARK: - JSON Helpers

    public func decodeSuccess<T: Decodable>(_ data: Data) throws -> T {
        return try Self.jsonDecoder.decode(T.self, from: data)
    }

    public func decodeError(_ data: Data, statusCode: Int) -> APIError {
        if let apiError = try? Self.jsonDecoder.decode(APIError.self, from: data) {
            return apiError
        }
        return APIError(
            code: statusCode,
            message: "Unknown error",
            errorType: "unknown",
            errorDetails: nil
        )
    }

    private func formatBytes(_ bytes: Int) -> String {
        let units = ["B", "KB", "MB", "GB"]
        var value = Double(bytes)
        var unitIndex = 0

        while value >= 1024 && unitIndex < units.count - 1 {
            value /= 1024
            unitIndex += 1
        }

        if unitIndex == 0 {
            return "\(bytes) B"
        } else {
            return String(format: "%.2f %@", value, units[unitIndex])
        }
    }

    public func request<T: Decodable>(
        path: String,
        method: HTTPMethod = .GET,
        body: (any Encodable)? = nil,
        token: String? = nil,
        idempotencyKey: UUID? = nil
    ) async throws -> T {
        let (data, response) = try await requestRaw(path: path, method: method, body: body, token: token, idempotencyKey: idempotencyKey)

        guard (200...299).contains(response.statusCode) else {
            let apiError = decodeError(data, statusCode: response.statusCode)
            throw NetworkError.serverError(apiError)
        }

        do {
            return try decodeSuccess(data)
        } catch {
            throw NetworkError.decodingFailed(error)
        }
    }

    public func requestRaw(
        path: String,
        method: HTTPMethod = .GET,
        body: (any Encodable)? = nil,
        token: String? = nil,
        idempotencyKey: UUID? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        let cleanedBaseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var finalPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        let enableV1 = Config.Flags.apiVersioning
        if enableV1 && finalPath.hasPrefix("api/") {
            finalPath.insert(contentsOf: "v1/", at: finalPath.index(finalPath.startIndex, offsetBy: 4))
        }

        guard let url = URL(string: "\(cleanedBaseURL)/\(finalPath)") else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyCommonHeaders(&request, token: token)

        if let idempotencyKey = idempotencyKey,
           method == .POST || method == .PUT || method == .PATCH || method == .DELETE {
            request.setValue(idempotencyKey.uuidString, forHTTPHeaderField: "Idempotency-Key")
        }

        if let body = body {
            do {
                request.httpBody = try Self.jsonEncoder.encode(AnyEncodable(body))
            } catch {
                throw NetworkError.decodingFailed(error)
            }
        }

        // Track request metrics
        let requestBodySize = request.httpBody?.count ?? 0
        let startTime = Date()

        do {
            let (data, response) = try await urlSession.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NetworkError.invalidResponse(statusCode: -1, data: nil)
            }

            let duration = Date().timeIntervalSince(startTime)
            let responseSize = data.count

            logger.info("[\(method.rawValue)] \(finalPath) | Status: \(httpResponse.statusCode) | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(requestBodySize)) | Response: \(self.formatBytes(responseSize))")

            return (data, httpResponse)
        } catch {
            let duration = Date().timeIntervalSince(startTime)
            logger.error("[\(method.rawValue)] \(finalPath) | Failed after \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(requestBodySize)) | Error: \(error.localizedDescription)")

            if let err = error as? NetworkError { throw err }
            throw NetworkError.requestFailed(error)
        }
    }
}


private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ value: any Encodable) {
        self.encodeFunc = value.encode
    }
    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}