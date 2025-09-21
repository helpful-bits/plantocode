import Foundation
import Combine

@MainActor
public final class MultiConnectionManager {
    public static let shared = MultiConnectionManager()
    private var storage: [UUID: ServerRelayClient] = [:]
    public private(set) var activeDeviceId: UUID?

    private init() {}

    public func addConnection(to device: RegisteredDevice, token: String?) async -> Result<UUID, Error> {
        // Delegate to addConnection(for:) and set activeDeviceId
        let result = await addConnection(for: device.id)
        if case .success(_) = result {
            activeDeviceId = device.id
        }
        return result
    }

    /// Add connection using server relay for a specific device
    public func addConnection(for deviceId: UUID) async -> Result<UUID, Error> {
        do {
            // Get JWT token from AuthService
            let token = try await AuthService.shared.getValidAccessToken()
            guard let authToken = token else {
                return .failure(MultiConnectionError.authenticationRequired)
            }

            // Get server URL from configuration
            guard let serverURL = getServerURL() else {
                return .failure(MultiConnectionError.invalidConfiguration)
            }

            // Check if we already have a connection for this device, reuse if available
            if let existingClient = storage[deviceId] {
                // Set as active device and return success
                activeDeviceId = deviceId
                return .success(deviceId)
            }

            let mobileDeviceId = DeviceManager.shared.getOrCreateDeviceID()

            // Create ServerRelayClient instance
            let relayClient = ServerRelayClient(
                serverURL: serverURL,
                deviceId: mobileDeviceId
            )

            // Connect to relay
            try await relayClient.connect(jwtToken: authToken).asyncValue()

            // Store the connection
            storage[deviceId] = relayClient

            // Set as active device
            activeDeviceId = deviceId

            // TODO: Publish connection state updates via NotificationCenter or Combine

            return .success(deviceId)

        } catch {
            return .failure(error)
        }
    }

    public func removeConnection(deviceId: UUID) {
        // Disconnect and remove relay connection
        if let relayClient = storage[deviceId] {
            relayClient.disconnect()
            storage.removeValue(forKey: deviceId)
        }

        if activeDeviceId == deviceId {
            activeDeviceId = nil
        }
    }


    /// Get relay connection for a specific device
    public func relayConnection(for deviceId: UUID) -> ServerRelayClient? {
        // Return relay connection for active device or specific device
        if let activeId = activeDeviceId, activeId == deviceId {
            return storage[deviceId]
        }
        return storage[deviceId]
    }

    public func setActive(_ deviceId: UUID?) {
        activeDeviceId = deviceId
    }

    public func allConnections() -> [UUID] {
        Array(storage.keys)
    }

    /// Get all relay connections
    public func allRelayConnections() -> [UUID] {
        Array(storage.keys)
    }

    // MARK: - Private Helper Methods

    private func getAuthToken() async -> String? {
        // Get token from the real AuthService
        return await AuthService.shared.getValidAccessToken()
    }

    private func getServerURL() -> URL? {
        // Get server URL from configuration
        guard let urlString = Config.serverURL.isEmpty ? nil : Config.serverURL,
              let url = URL(string: urlString) else {
            return nil
        }
        return url
    }
}

// MARK: - Error Types

public enum MultiConnectionError: Error, LocalizedError {
    case authenticationRequired
    case invalidConfiguration
    case connectionFailed(String)
    case deviceNotFound(UUID)

    public var errorDescription: String? {
        switch self {
        case .authenticationRequired:
            return "Authentication token is required to establish connection"
        case .invalidConfiguration:
            return "Invalid server configuration"
        case .connectionFailed(let reason):
            return "Connection failed: \(reason)"
        case .deviceNotFound(let deviceId):
            return "Device not found: \(deviceId)"
        }
    }
}

// MARK: - Extensions

extension Publisher {
    /// Convert Publisher to async/await
    func asyncValue() async throws -> Output {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            cancellable = self
                .first()
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .finished:
                            break
                        case .failure(let error):
                            continuation.resume(throwing: error)
                        }
                        cancellable?.cancel()
                    },
                    receiveValue: { value in
                        continuation.resume(returning: value)
                        cancellable?.cancel()
                    }
                )
        }
    }
}

