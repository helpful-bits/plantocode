import Foundation

// MARK: - Device Management API Extension

extension ServerAPIClient {

    /// Get all registered devices for the authenticated user
    public func getDevices() async throws -> [RegisteredDevice] {
        let serverDevices: [ServerDeviceInfo] = try await deviceRequest(
            path: "api/devices",
            method: .GET,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
        return serverDevices.map(RegisteredDevice.from)
    }

    /// Get status of a specific device
    // NOTE: Not implemented on server. Do not use.
    public func getDeviceStatus(deviceId: UUID) async throws -> RegisteredDevice {
        return try await request(
            path: "api/devices/\(deviceId)/status",
            method: .GET,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
    }

    /// Unpair/unregister a device
    public func unpairDevice(deviceId: UUID) async throws {
        let _: DeviceAPIEmptyResponse = try await request(
            path: "api/devices/\(deviceId)",
            method: .DELETE,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
    }

    /// Get connection descriptor for establishing direct connection to a device
    public func getConnectionDescriptor(deviceId: UUID) async throws -> ConnectionDescriptor {
        return try await request(
            path: "api/devices/\(deviceId)/connection-descriptor",
            method: .GET,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
    }

    /// Create a pairing request for a desktop device
    // NOTE: Not implemented on server. Do not use.
    public func createPairingRequest(_ request: CreatePairingRequest) async throws -> DevicePairingRequest {
        return try await self.request(
            path: "api/devices/pairing/request",
            method: .POST,
            body: request,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
    }

    /// Complete pairing with a verification code
    // NOTE: Not implemented on server. Do not use.
    public func completePairing(_ request: CompletePairingRequest) async throws -> PairingResponse {
        return try await self.request(
            path: "api/devices/pairing/complete",
            method: .POST,
            body: request,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
    }

    // MARK: - Helper Methods

    /// Get authentication token from AuthService
    private func getAuthToken() async throws -> String {
        // This will need to be implemented based on your existing auth system
        // For now, return a placeholder that would work with your AuthService
        guard let token = await AuthService.shared.getValidAccessToken() else {
            throw APIError.requestFailed(AuthError.notAuthenticated)
        }
        return token
    }

    /// Register device with the server
    public func registerDevice(deviceId: String) async throws {
        let baseURLString = Config.serverURL
        guard let baseURL = URL(string: baseURLString) else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/devices/register")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(AuthConstants.HTTPHeaders.applicationJson, forHTTPHeaderField: AuthConstants.HTTPHeaders.contentType)

        guard let token = await AuthService.shared.getValidAccessToken() else {
            throw APIError.requestFailed(AuthError.notAuthenticated)
        }

        request.setValue("Bearer \(token)", forHTTPHeaderField: AuthConstants.HTTPHeaders.authorization)
        request.setValue(deviceId, forHTTPHeaderField: AuthConstants.HTTPHeaders.deviceId)
        request.setValue(deviceId, forHTTPHeaderField: AuthConstants.HTTPHeaders.tokenBinding)
        request.setValue("mobile", forHTTPHeaderField: "X-Client-Type")

        let deviceInfo = DeviceManager.shared.getDeviceInfo()
        let registerRequest = DeviceRegisterRequest(
            deviceId: deviceId,
            deviceName: deviceInfo.deviceModel,
            deviceType: "mobile",
            platform: "ios",
            platformVersion: deviceInfo.systemVersion,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            relayEligible: true
        )

        request.httpBody = try JSONEncoder().encode(registerRequest)

        let (data, response) = try await URLSession.shared.data(for: request)

        if let httpResponse = response as? HTTPURLResponse {
            if httpResponse.statusCode == 409 {
                // 409 Conflict = already registered, treat as success
                return
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                throw APIError.invalidResponse(statusCode: httpResponse.statusCode, data: data)
            }
        }
    }
}

// MARK: - Helper Types

/// Device registration request
public struct DeviceRegisterRequest: Codable {
    let deviceId: String
    let deviceName: String
    let deviceType: String
    let platform: String
    let platformVersion: String
    let appVersion: String
    let relayEligible: Bool

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case deviceName = "device_name"
        case deviceType = "device_type"
        case platform
        case platformVersion = "platform_version"
        case appVersion = "app_version"
        case relayEligible = "relay_eligible"
    }
}

/// Empty response for endpoints that don't return data
private struct DeviceAPIEmptyResponse: Codable {}

/// Authentication errors
public enum AuthError: Error, LocalizedError, Codable {
    case notAuthenticated
    case tokenExpired
    case tokenRefreshFailed

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "User is not authenticated"
        case .tokenExpired:
            return "Authentication token has expired"
        case .tokenRefreshFailed:
            return "Failed to refresh authentication token"
        }
    }
}

// MARK: - Date Formatting Extension

extension JSONDecoder {
    static let deviceAPIDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        // Configure date decoding for ISO 8601 format
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'"
        formatter.timeZone = TimeZone(abbreviation: "UTC")

        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)

            // Try the full format first
            if let date = formatter.date(from: dateString) {
                return date
            }

            // Fallback to basic ISO 8601
            formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss'Z'"
            if let date = formatter.date(from: dateString) {
                return date
            }

            // Final fallback to ISO8601DateFormatter
            if #available(iOS 10.0, *) {
                let iso8601Formatter = ISO8601DateFormatter()
                if let date = iso8601Formatter.date(from: dateString) {
                    return date
                }
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date string \(dateString)"
            )
        }

        return decoder
    }()
}

extension ServerAPIClient {
    /// Enhanced request method with custom decoder for device API
    public func deviceRequest<T: Decodable>(
        path: String,
        method: HTTPMethod = .GET,
        body: (any Encodable)? = nil,
        token: String? = nil,
        includeDeviceId: Bool = false
    ) async throws -> T {
        let (data, response) = try await requestRaw(
            path: path,
            method: method,
            body: body,
            token: token,
            includeDeviceId: includeDeviceId
        )

        guard (200...299).contains(response.statusCode) else {
            throw APIError.invalidResponse(statusCode: response.statusCode, data: data)
        }

        do {
            return try JSONDecoder.deviceAPIDecoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed(error)
        }
    }
}
