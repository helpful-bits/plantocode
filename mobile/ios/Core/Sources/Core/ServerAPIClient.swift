import Foundation
import OSLog
// Import CommonTypes for shared type definitions

public enum APIError: Error, LocalizedError {
    case invalidURL
    case requestFailed(Error)
    case invalidResponse(statusCode: Int, data: Data?)
    case decodingFailed(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .requestFailed(let err): return "Request failed: \(err.localizedDescription)"
        case .invalidResponse(let code, _): return "Invalid response status: \(code)"
        case .decodingFailed(let err): return "Decoding failed: \(err.localizedDescription)"
        }
    }
}

public final class ServerAPIClient {
    public static let shared = ServerAPIClient(baseURL: Config.serverURL)
    public static let auth = ServerAPIClient(baseURL: Config.authServerURL)  // Dedicated client for auth

    private let baseURL: String
    private let urlSession: URLSession
    private let logger = Logger(subsystem: "PlanToCode", category: "NetworkRequest")

    public init(baseURL: String) {
        self.baseURL = baseURL
        let pinningDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
        self.urlSession = URLSession(configuration: .default, delegate: pinningDelegate, delegateQueue: nil)
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
        includeDeviceId: Bool = false
    ) async throws -> T {
        let (data, response) = try await requestRaw(path: path, method: method, body: body, token: token, includeDeviceId: includeDeviceId)

        guard (200...299).contains(response.statusCode) else {
            throw APIError.invalidResponse(statusCode: response.statusCode, data: data)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed(error)
        }
    }

    public func requestRaw(
        path: String,
        method: HTTPMethod = .GET,
        body: (any Encodable)? = nil,
        token: String? = nil,
        includeDeviceId: Bool = false
    ) async throws -> (Data, HTTPURLResponse) {
        let cleanedBaseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let cleanedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        guard let url = URL(string: "\(cleanedBaseURL)/\(cleanedPath)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let deviceId = DeviceManager.shared.getOrCreateDeviceID()
            request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
            request.setValue(deviceId, forHTTPHeaderField: "X-Token-Binding")
            request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")
        }

        if includeDeviceId && token == nil {
            let deviceId = DeviceManager.shared.getOrCreateDeviceID()
            request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
            request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")
        }

        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
            } catch {
                throw APIError.decodingFailed(error)
            }
        }

        // Track request metrics
        let requestBodySize = request.httpBody?.count ?? 0
        let startTime = Date()

        do {
            let (data, response) = try await urlSession.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse(statusCode: -1, data: nil)
            }

            // Calculate timing and log metrics
            let duration = Date().timeIntervalSince(startTime)
            let responseSize = data.count

            logger.info("[\(method.rawValue)] \(cleanedPath) | Status: \(httpResponse.statusCode) | Duration: \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(requestBodySize)) | Response: \(self.formatBytes(responseSize))")

            return (data, httpResponse)
        } catch {
            // Log failed requests
            let duration = Date().timeIntervalSince(startTime)
            logger.error("[\(method.rawValue)] \(cleanedPath) | Failed after \(String(format: "%.3f", duration))s | Request: \(self.formatBytes(requestBodySize)) | Error: \(error.localizedDescription)")

            if let err = error as? APIError { throw err }
            throw APIError.requestFailed(error)
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