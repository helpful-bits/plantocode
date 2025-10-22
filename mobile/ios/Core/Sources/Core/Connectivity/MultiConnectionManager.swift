import Foundation
import Combine
import Security

@MainActor
public final class MultiConnectionManager: ObservableObject {
    public static let shared = MultiConnectionManager()
    private var storage: [UUID: ServerRelayClient] = [:]
    @Published public private(set) var activeDeviceId: UUID?
    @Published public private(set) var connectionStates: [UUID: ConnectionState] = [:]
    private let connectedDevicesKey = "vm_connected_devices"
    private let activeDeviceKey = "ActiveDesktopDeviceId"
    private var cancellables = Set<AnyCancellable>()
    private var connectingTasks: [UUID: Task<Result<UUID, Error>, Never>] = [:]
    private var verifyingDevices = Set<UUID>()
    private var relayHandshakeByDevice = [UUID: ConnectionHandshake]()

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

    private func verifyDesktopConnection(deviceId: UUID, timeoutSeconds: Int = 5) async throws {
        guard let relayClient = storage[deviceId] else {
            throw MultiConnectionError.connectionFailed("Relay client not found")
        }

        guard relayClient.isConnected else {
            throw MultiConnectionError.connectionFailed("Relay not connected")
        }

        do {
            var receivedResponse = false
            for try await response in relayClient.invoke(
                targetDeviceId: deviceId.uuidString,
                request: RpcRequest(method: "ping", params: [:]),
                timeout: TimeInterval(timeoutSeconds)
            ) {
                receivedResponse = true
                if let error = response.error {
                    throw MultiConnectionError.connectionFailed("Desktop refused the connection: \(error.message)")
                }
                if response.isFinal {
                    return
                }
            }

            if !receivedResponse {
                throw MultiConnectionError.connectionFailed("Desktop did not respond in time.")
            }
        } catch is ServerRelayError {
            throw MultiConnectionError.connectionFailed("Desktop did not respond in time.")
        } catch {
            throw error
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
        if !PlanToCodeCore.shared.isInitialized {
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

        // Check if we have an existing connection that's actually connected
        if let existingClient = storage[deviceId] {
            // Verify the connection is actually healthy
            if existingClient.isConnected {
                print("[MultiConnectionManager] Reusing existing healthy connection for device: \(deviceId)")
                activeDeviceId = deviceId
                return .success(deviceId)
            } else {
                // Connection exists but is not healthy - remove it and create a new one
                print("[MultiConnectionManager] Existing connection is not healthy, removing and recreating for device: \(deviceId)")
                existingClient.disconnect()
                storage.removeValue(forKey: deviceId)
                connectionStates.removeValue(forKey: deviceId)
            }
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
                print("[MultiConnectionManager] Relay connection established, starting verification")

                await MainActor.run {
                    self.storage[deviceId] = relayClient
                    self.connectionStates[deviceId] = .handshaking
                    self.verifyingDevices.insert(deviceId)
                }

                await MainActor.run {
                    relayClient.$connectionState
                        .sink { [weak self] state in
                            guard let self = self else { return }
                            Task { @MainActor in
                                switch state {
                                case .connected(let handshake):
                                    self.relayHandshakeByDevice[deviceId] = handshake
                                    if self.verifyingDevices.contains(deviceId) {
                                        self.connectionStates[deviceId] = .handshaking
                                    } else {
                                        self.connectionStates[deviceId] = .connected(handshake)
                                        self.persistConnectedDevice(deviceId)
                                    }
                                case .reconnecting:
                                    self.connectionStates[deviceId] = .reconnecting
                                    self.verifyingDevices.insert(deviceId)
                                case .failed(let e):
                                    self.connectionStates[deviceId] = .failed(e)
                                    self.verifyingDevices.remove(deviceId)
                                case .disconnected:
                                    self.connectionStates[deviceId] = .disconnected
                                    self.verifyingDevices.remove(deviceId)
                                    self.relayHandshakeByDevice.removeValue(forKey: deviceId)
                                default:
                                    break
                                }
                            }
                        }
                        .store(in: &self.cancellables)
                }

                do {
                    try await self.verifyDesktopConnection(deviceId: deviceId, timeoutSeconds: 5)

                    await MainActor.run {
                        let handshake = self.relayHandshakeByDevice[deviceId] ?? ConnectionHandshake(
                            sessionId: UUID().uuidString,
                            clientId: DeviceManager.shared.getOrCreateDeviceID(),
                            transport: "relay"
                        )
                        self.connectionStates[deviceId] = .connected(handshake)
                        self.persistConnectedDevice(deviceId)
                        self.setActive(deviceId)
                        self.verifyingDevices.remove(deviceId)
                    }

                    print("[MultiConnectionManager] Verification successful, connection fully established")
                } catch {
                    print("[MultiConnectionManager] Verification failed: \(error.localizedDescription)")
                    await MainActor.run {
                        self.connectionStates[deviceId] = .failed(error)
                        self.verifyingDevices.remove(deviceId)
                    }
                    relayClient.disconnect()
                    throw error
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
        verifyingDevices.remove(deviceId)
        relayHandshakeByDevice.removeValue(forKey: deviceId)
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
        verifyingDevices.removeAll()
        relayHandshakeByDevice.removeAll()
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

    /// Check if the active device is connected
    public var isActiveDeviceConnected: Bool {
        guard let activeId = activeDeviceId,
              let state = connectionStates[activeId] else {
            return false
        }
        if case .connected(_) = state {
            return true
        }
        return false
    }

    public func effectiveConnectionState(for deviceId: UUID) -> ConnectionState {
        let relayState = connectionStates[deviceId]
        if verifyingDevices.contains(deviceId) {
            return .handshaking
        }
        switch relayState {
        case .connected(let hs):
            return verifyingDevices.contains(deviceId) ? .handshaking : .connected(hs)
        case .reconnecting:
            return .reconnecting
        case .failed(let e):
            return .failed(e)
        case .connecting:
            return .connecting
        default:
            return relayState ?? .disconnected
        }
    }

    public var activeDeviceIsFullyConnected: Bool {
        guard let id = activeDeviceId else { return false }
        if case .connected = effectiveConnectionState(for: id) {
            return true
        } else {
            return false
        }
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
        if !PlanToCodeCore.shared.isInitialized || AuthService.shared.isAuthenticated == false {
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
    public func asyncValue() async throws -> Output {
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


