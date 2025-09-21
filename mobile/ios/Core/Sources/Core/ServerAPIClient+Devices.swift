import Foundation

// MARK: - Device Management API Extension

extension ServerAPIClient {

    /// Get all registered devices for the authenticated user
    public func getDevices() async throws -> DeviceListResponse {
        return try await request(
            path: "api/devices",
            method: .GET,
            token: try await getAuthToken(),
            includeDeviceId: true
        )
    }

    /// Get status of a specific device
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
}

// MARK: - Helper Types

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