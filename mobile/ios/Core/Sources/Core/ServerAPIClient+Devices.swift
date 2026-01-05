import Foundation

// MARK: - Mobile Device Registration Types

public struct RegisterMobileDeviceBody: Codable {
    public let deviceName: String
    public let platform: String
    public let appVersion: String
    public let capabilities: [String: AnyCodable]?
    public let pushToken: String?

    public init(
        deviceName: String,
        platform: String,
        appVersion: String,
        capabilities: [String: AnyCodable]? = nil,
        pushToken: String? = nil
    ) {
        self.deviceName = deviceName
        self.platform = platform
        self.appVersion = appVersion
        self.capabilities = capabilities
        self.pushToken = pushToken
    }
}

public struct UpsertPushTokenBody: Codable {
    public let platform: String
    public let token: String

    public init(platform: String, token: String) {
        self.platform = platform
        self.token = token
    }
}

public struct DeviceResponse: Codable {
    public let deviceId: UUID
    public let deviceName: String
    public let deviceType: String
    public let platform: String
    public let appVersion: String
    public let status: String?
    public let isConnected: Bool
    public let createdAt: Date?
    public let updatedAt: Date?
}

public struct HeartbeatBody: Codable {
    public let status: String?
    public let metadata: [String: AnyCodable]?

    public init(status: String? = nil, metadata: [String: AnyCodable]? = nil) {
        self.status = status
        self.metadata = metadata
    }
}

// MARK: - Device Management API Extension

extension ServerAPIClient {

    /// Get all registered devices for the authenticated user
    public func getDevices(deviceType: String? = nil) async throws -> [RegisteredDevice] {
        var path = "api/devices?connected_only=true"
        if let deviceType = deviceType {
            path += "&device_type=\(deviceType)"
        }

        let devices: [DeviceDTO] = try await deviceRequest(
            path: path,
            method: .GET,
            token: try await getAuthToken()
        )
        return devices.map(RegisteredDevice.from)
    }

    /// Get status of a specific device
    // NOTE: Not implemented on server. Do not use.
    public func getDeviceStatus(deviceId: UUID) async throws -> RegisteredDevice {
        return try await request(
            path: "api/devices/\(deviceId)/status",
            method: .GET,
            token: try await getAuthToken()
        )
    }

    /// Unpair/unregister a device
    public func unpairDevice(deviceId: UUID) async throws {
        let _: DeviceAPIEmptyResponse = try await request(
            path: "api/devices/\(deviceId)",
            method: .DELETE,
            token: try await getAuthToken()
        )
    }

    /// Get connection descriptor for establishing direct connection to a device
    public func getConnectionDescriptor(deviceId: UUID) async throws -> ConnectionDescriptor {
        return try await request(
            path: "api/devices/\(deviceId)/connection-descriptor",
            method: .GET,
            token: try await getAuthToken()
        )
    }

    /// Create a pairing request for a desktop device
    // NOTE: Not implemented on server. Do not use.
    public func createPairingRequest(_ request: CreatePairingRequest) async throws -> DevicePairingRequest {
        return try await self.request(
            path: "api/devices/pairing/request",
            method: .POST,
            body: request,
            token: try await getAuthToken()
        )
    }

    /// Complete pairing with a verification code
    // NOTE: Not implemented on server. Do not use.
    public func completePairing(_ request: CompletePairingRequest) async throws -> PairingResponse {
        return try await self.request(
            path: "api/devices/pairing/complete",
            method: .POST,
            body: request,
            token: try await getAuthToken()
        )
    }

    // MARK: - Mobile Device Registration

    public func registerMobileDevice(_ body: RegisterMobileDeviceBody) async throws -> DeviceResponse {
        return try await deviceRequest(
            path: "api/devices/mobile/register",
            method: .POST,
            body: body,
            token: try await getAuthToken()
        )
    }

    public func upsertPushToken(platform: String, token: String) async throws {
        let body = UpsertPushTokenBody(platform: platform, token: token)
        let (_, response) = try await requestRaw(
            path: "api/devices/push-token",
            method: .PUT,
            body: body,
            token: try await getAuthToken()
        )

        guard (200...299).contains(response.statusCode) else {
            throw NetworkError.invalidResponse(statusCode: response.statusCode, data: nil)
        }
    }

    public func unregisterDevice(deviceId: UUID) async throws {
        let (_, response) = try await requestRaw(
            path: "api/devices/\(deviceId.uuidString)",
            method: .DELETE,
            token: try await getAuthToken()
        )

        guard (200...299).contains(response.statusCode) else {
            throw NetworkError.invalidResponse(statusCode: response.statusCode, data: nil)
        }
    }

    public func sendHeartbeat(_ body: HeartbeatBody? = nil) async throws {
        let (_, response) = try await requestRaw(
            path: "api/devices/heartbeat",
            method: .POST,
            body: body,
            token: try await getAuthToken()
        )

        guard (200...299).contains(response.statusCode) else {
            throw NetworkError.invalidResponse(statusCode: response.statusCode, data: nil)
        }
    }

    public func listDevices(deviceType: String? = nil, connectedOnly: Bool = false) async throws -> [RegisteredDevice] {
        var path = "api/devices"
        var queryParams: [String] = []
        if let deviceType = deviceType {
            queryParams.append("device_type=\(deviceType)")
        }
        if connectedOnly {
            queryParams.append("connected_only=true")
        }
        if !queryParams.isEmpty {
            path += "?" + queryParams.joined(separator: "&")
        }

        let devices: [DeviceDTO] = try await deviceRequest(
            path: path,
            method: .GET,
            token: try await getAuthToken()
        )
        return devices.map(RegisteredDevice.from)
    }

    // MARK: - Helper Methods

    private func getAuthToken() async throws -> String {
        guard let token = await AuthService.shared.getValidAccessToken() else {
            throw NetworkError.requestFailed(AuthError.notAuthenticated)
        }
        return token
    }

    public func registerDevice() async throws {
        let token = try await getAuthToken()
        let deviceInfo = DeviceManager.shared.getDeviceInfo()
        let registerRequest = DeviceRegisterRequest(
            deviceId: deviceInfo.deviceID,
            deviceName: deviceInfo.deviceModel,
            deviceType: "mobile",
            platform: "ios",
            platformVersion: deviceInfo.systemVersion,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            relayEligible: true
        )

        let (data, response) = try await requestRaw(
            path: "api/devices/register",
            method: .POST,
            body: registerRequest,
            token: token
        )

        if response.statusCode == 409 {
            return
        }

        guard (200...299).contains(response.statusCode) else {
            let apiError = decodeError(data, statusCode: response.statusCode)
            throw NetworkError.serverError(apiError)
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
    public func deviceRequest<T: Decodable>(
        path: String,
        method: HTTPMethod = .GET,
        body: (any Encodable)? = nil,
        token: String? = nil
    ) async throws -> T {
        let (data, response) = try await requestRaw(
            path: path,
            method: method,
            body: body,
            token: token
        )

        guard (200...299).contains(response.statusCode) else {
            let apiError = decodeError(data, statusCode: response.statusCode)
            throw NetworkError.serverError(apiError)
        }

        do {
            return try JSONDecoder.deviceAPIDecoder.decode(T.self, from: data)
        } catch {
            throw NetworkError.decodingFailed(error)
        }
    }
}
