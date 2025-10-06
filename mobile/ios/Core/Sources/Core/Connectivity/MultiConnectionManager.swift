import Foundation
import Combine
import Security

@MainActor
public final class MultiConnectionManager: ObservableObject {
    public static let shared = MultiConnectionManager()
    private var storage: [UUID: ServerRelayClient] = [:]
    public private(set) var activeDeviceId: UUID?
    @Published public private(set) var connectionStates: [UUID: ConnectionState] = [:]
    private let connectedDevicesKey = "vm_connected_devices"
    private let activeDeviceKey = "ActiveDesktopDeviceId"
    private var cancellables = Set<AnyCancellable>()
    private var connectingTasks: [UUID: Task<Result<UUID, Error>, Never>] = [:]

    private init() {
        loadPersistedActiveDeviceId()

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-token-refreshed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self, let activeId = self.activeDeviceId else { return }
            if self.connectionStates[activeId]?.isConnected == false {
                Task { _ = await self.addConnection(for: activeId) }
            }
        }

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-logged-out"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.removeAllConnections()
        }
    }

    public func addConnection(to device: RegisteredDevice, token: String?) async -> Result<UUID, Error> {
        // Delegate to addConnection(for:) and set activeDeviceId
        let result = await addConnection(for: device.deviceId)
        if case .success(_) = result {
            setActive(device.deviceId)
        }
        return result
    }

    /// Add connection using server relay for a specific device
    public func addConnection(for deviceId: UUID) async -> Result<UUID, Error> {
        // Strict prerequisite validation
        if !VibeManagerCore.shared.isInitialized {
            await MainActor.run {
                connectionStates[deviceId] = .failed(MultiConnectionError.invalidConfiguration)
            }
            return .failure(MultiConnectionError.invalidConfiguration)
        }

        let token = await AuthService.shared.getValidAccessToken()
        if token == nil {
            await MainActor.run {
                connectionStates[deviceId] = .failed(MultiConnectionError.authenticationRequired)
            }
            return .failure(MultiConnectionError.authenticationRequired)
        }

        // If already connected, return success
        if let existingClient = storage[deviceId] {
            print("[MultiConnectionManager] Reusing existing connection for device: \(deviceId)")
            activeDeviceId = deviceId
            return .success(deviceId)
        }

        // If already connecting, wait for that task
        if let existingTask = connectingTasks[deviceId] {
            print("[MultiConnectionManager] Connection already in progress for device: \(deviceId)")
            return await existingTask.value
        }

        // Create new connection task
        let task = Task<Result<UUID, Error>, Never> { [weak self] in
            guard let self = self else {
                return .failure(MultiConnectionError.invalidConfiguration)
            }

            defer {
                Task { @MainActor in
                    self.connectingTasks.removeValue(forKey: deviceId)
                }
            }

            do {
                print("[MultiConnectionManager] Adding connection for device: \(deviceId)")

                let token = try await AuthService.shared.getValidAccessToken()
                guard let authToken = token else {
                    print("[MultiConnectionManager] Authentication failed: no token available")
                    return .failure(MultiConnectionError.authenticationRequired)
                }

                guard let serverURL = self.getServerURL() else {
                    print("[MultiConnectionManager] Invalid server configuration")
                    return .failure(MultiConnectionError.invalidConfiguration)
                }

                let mobileDeviceId = DeviceManager.shared.getOrCreateDeviceID()

                print("[MultiConnectionManager] Creating relay client to: \(serverURL.absoluteString)")
                let pinningDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
                let relayClient = ServerRelayClient(
                    serverURL: serverURL,
                    deviceId: mobileDeviceId,
                    sessionDelegate: pinningDelegate
                )

                print("[MultiConnectionManager] Connecting to relay...")
                try await relayClient.connect(jwtToken: authToken).asyncValue()
                print("[MultiConnectionManager] Relay connection established")

                await MainActor.run {
                    self.storage[deviceId] = relayClient

                    relayClient.$connectionState
                        .sink { [weak self] state in
                            guard let self = self else { return }
                            Task { @MainActor in
                                self.connectionStates[deviceId] = state
                                if case .connected(_) = state {
                                    self.persistConnectedDevice(deviceId)
                                }
                            }
                        }
                        .store(in: &self.cancellables)

                    self.setActive(deviceId)
                }

                print("[MultiConnectionManager] Connection successful for device: \(deviceId)")
                return .success(deviceId)

            } catch {
                print("[MultiConnectionManager] Connection failed: \(error.localizedDescription)")
                await MainActor.run {
                    self.connectionStates[deviceId] = .failed(error)
                }
                // Do NOT persist on failure
                return .failure(error)
            }
        }

        connectingTasks[deviceId] = task
        return await task.value
    }

    public func removeConnection(deviceId: UUID) {
        // Disconnect and remove relay connection
        if let relayClient = storage[deviceId] {
            relayClient.disconnect()
            storage.removeValue(forKey: deviceId)
        }

        // Clear active if it was the removed device
        if activeDeviceId == deviceId {
            activeDeviceId = nil
            UserDefaults.standard.removeObject(forKey: activeDeviceKey)
        }
    }

    public func removeAllConnections() {
        // Disconnect all relay connections
        for (_, relayClient) in storage {
            relayClient.disconnect()
        }
        storage.removeAll()
        connectionStates.removeAll()
        activeDeviceId = nil
        UserDefaults.standard.removeObject(forKey: connectedDevicesKey)
        UserDefaults.standard.removeObject(forKey: activeDeviceKey)
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
        persistActiveDeviceId()
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

    // MARK: - Connection Persistence

    public func restoreConnections() async {
        // Only restore if initialized and authenticated
        if !VibeManagerCore.shared.isInitialized || AuthService.shared.isAuthenticated == false {
            return
        }

        let deviceIds = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
        for idStr in deviceIds {
            guard let uuid = UUID(uuidString: idStr) else { continue }
            let result = await addConnection(for: uuid)
            // Remove from persisted list if connection fails permanently
            if case .failure = result {
                var updatedIds = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
                updatedIds.removeAll { $0 == idStr }
                UserDefaults.standard.set(updatedIds, forKey: connectedDevicesKey)
            }
        }
    }

    private func persistActiveDeviceId() {
        if let id = activeDeviceId {
            UserDefaults.standard.set(id.uuidString, forKey: activeDeviceKey)
        }
    }

    private func loadPersistedActiveDeviceId() {
        if let str = UserDefaults.standard.string(forKey: activeDeviceKey),
           let id = UUID(uuidString: str) {
            self.activeDeviceId = id
        }
    }

    private func persistConnectedDevice(_ deviceId: UUID) {
        var deviceIds = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
        let idStr = deviceId.uuidString
        if !deviceIds.contains(idStr) {
            deviceIds.append(idStr)
            UserDefaults.standard.set(deviceIds, forKey: connectedDevicesKey)
        }
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


