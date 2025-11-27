import Foundation
import Combine
import Security
import Network
#if canImport(UIKit)
import UIKit
#endif

public enum ConnectionHealth {
    case healthy
    case stable
    case unstable
    case dead
}

public enum WorkspaceConnectivityState {
    case healthy
    case transientReconnecting
    case degradedDisconnected
    case offlineModeCandidate
}

@MainActor
public final class MultiConnectionManager: ObservableObject {
    public static let shared = MultiConnectionManager()
    private var storage: [UUID: ServerRelayClient] = [:]
    @Published public private(set) var activeDeviceId: UUID?
    @Published public private(set) var connectionStates: [UUID: ConnectionState] = [:]
    @Published public private(set) var connectionHealth: ConnectionHealth = .dead
    @Published public private(set) var isActivelyReconnecting: Bool = false
    private let connectedDevicesKey = "vm_connected_devices"
    private let activeDeviceKey = "ActiveDesktopDeviceId"
    // globalCancellables holds app-wide subscriptions.
    // deviceCancellables/connectionStateSubscriptions track per-device ServerRelayClient sinks
    // so we can cancel them deterministically on device removal/switch.
    private var globalCancellables = Set<AnyCancellable>()
    private var deviceCancellables = [UUID: Set<AnyCancellable>]()
    private var connectionStateSubscriptions: [UUID: AnyCancellable] = [:]
    private var connectingTasks: [UUID: Task<Result<UUID, Error>, Never>] = [:]
    private var verifyingDevices = Set<UUID>()
    private var relayHandshakeByDevice = [UUID: ConnectionHandshake]()
    private var isHardResetInProgress = false
    private var hasRestoredOnce = false
    private var healthGraceTask: Task<Void, Never>?
    private let healthGraceDelay: TimeInterval = 12.0

    private struct ReconnectPolicy {
        let attemptDelays: [TimeInterval] = [0.0, 0.5, 1, 2, 4, 8, 16, 30]
        let backgroundRetryInterval: TimeInterval = 120
        let maxAggressiveAttempts: Int = 8
        let maxAggressiveWindowSeconds: TimeInterval = 90
        let jitterFactor: Double = 0.15
    }

    private struct DeviceReconnectState {
        var attempts: Int = 0
        var aggressiveWindowStart: Date?
        var isAggressiveActive: Bool = false
        var backgroundTimer: Timer?
        var currentTask: Task<Void, Never>?
        var lastError: Error?
        var backgroundCycles: Int = 0
    }

    public enum ReconnectReason {
        case appForeground
        case networkChange(NWPath)
        case connectionLoss(UUID)
        case authRefreshed
    }

    public enum HardResetReason {
        case manual
        case reconnectionExhausted
        case serverContextChanged
        case authInvalidated
        case diagnostics
    }

    private var reconnectPolicy = ReconnectPolicy()
    private var reconnectStates = [UUID: DeviceReconnectState]()
    private let serverContextKey = "LastConnectedServerURL"
    private var lastConnectedServerURL: String?
    private var lastAddConnectionAt: [UUID: Date] = [:]
    private var pathObserverCancellable: AnyCancellable?
    private var lastPath: NWPath?

    private var connectedDeviceIds: [UUID] {
        connectionStates.filter { _, state in
            if case .connected = state {
                return true
            }
            return false
        }.map { $0.key }
    }

    private init() {
        loadPersistedActiveDeviceId()

        lastConnectedServerURL = UserDefaults.standard.string(forKey: serverContextKey)

        // Validate activeDeviceId exists in persisted connections
        let deviceIds = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
        if let activeId = activeDeviceId {
            let activeIdStr = activeId.uuidString
            if !deviceIds.contains(activeIdStr) {
                activeDeviceId = nil
                UserDefaults.standard.removeObject(forKey: activeDeviceKey)
            }
        }

        NetworkPathObserver.shared.$currentPath
            .sink { [weak self] path in
                guard let self = self, let path = path else { return }
                Task { @MainActor in
                    self.lastPath = path

                    if path.status == .satisfied {
                        if let activeId = self.activeDeviceId,
                           let state = self.connectionStates[activeId],
                           state.isConnected {
                            self.connectionHealth = .healthy
                        } else {
                            self.connectionHealth = .stable
                        }
                        for (deviceId, client) in self.storage {
                            if client.isConnected {
                                continue
                            }
                            _ = await self.addConnection(for: deviceId)
                        }
                    } else {
                        self.connectionHealth = .unstable
                    }
                }
            }
            .store(in: &globalCancellables)

        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            self.triggerAggressiveReconnect(reason: .appForeground)
        }

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-token-refreshed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            self.triggerAggressiveReconnect(reason: .authRefreshed)
        }

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("auth-logged-out"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            self.stopAllReconnectTimers()
            self.removeAllConnections()
        }
    }

    private func cancelAllCancellables() {
        for (_, bag) in deviceCancellables {
            var mutableBag = bag
            mutableBag.removeAll()
        }
        deviceCancellables.removeAll()

        for (_, sub) in connectionStateSubscriptions {
            sub.cancel()
        }
        connectionStateSubscriptions.removeAll()

        globalCancellables.removeAll()
    }

    @MainActor
    public func hardReset(reason: HardResetReason, deletePersistedDevices: Bool = true) async {
        guard !isHardResetInProgress else {
            return
        }

        isHardResetInProgress = true
        defer { isHardResetInProgress = false }

        stopAllReconnectTimers()
        cancelAllCancellables()
        for (_, sub) in connectionStateSubscriptions {
            sub.cancel()
        }
        connectionStateSubscriptions.removeAll()
        healthGraceTask?.cancel()
        healthGraceTask = nil
        connectionHealth = .dead

        for (_, relay) in storage {
            relay.clearResumeToken()
            relay.disconnect(isUserInitiated: true)
        }

        let persistedDeviceIds = (UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? [])
            .compactMap { UUID(uuidString: $0) }
        let inMemoryDeviceIds = Array(storage.keys)
        let allDeviceIds = Set(persistedDeviceIds + inMemoryDeviceIds)

        for deviceId in allDeviceIds {
            ServerRelayClient.clearResumeToken(deviceId: deviceId)
        }

        storage.removeAll()
        connectionStates.removeAll()
        verifyingDevices.removeAll()
        relayHandshakeByDevice.removeAll()
        reconnectStates.removeAll()
        connectingTasks.removeAll()
        activeDeviceId = nil

        persistConnectedDevices([])

        if deletePersistedDevices {
            UserDefaults.standard.removeObject(forKey: connectedDevicesKey)
            UserDefaults.standard.removeObject(forKey: activeDeviceKey)
        }

        UserDefaults.standard.removeObject(forKey: serverContextKey)
        lastConnectedServerURL = nil

        await PlanToCodeCore.shared.dataServices?.resetAllState()

        NotificationCenter.default.post(
            name: Notification.Name("connection-hard-reset-completed"),
            object: nil,
            userInfo: ["reason": reason]
        )
    }

    @MainActor
    public func hardResetAndRescan() async {
        await hardReset(reason: .manual)
        await DeviceDiscoveryService.shared.clearList()
        await DeviceDiscoveryService.shared.refreshDevices()
    }

    /// Performs system ping to verify desktop connection (handshaking step)
    /// Reduced timeout from 5s to 3s for faster connection verification
    private func performSystemPing(deviceId: UUID, relayClient: ServerRelayClient, timeoutSeconds: Int = 3) async throws {
        guard relayClient.isConnected else {
            throw MultiConnectionError.connectionFailed("Relay not connected")
        }

        do {
            var receivedResponse = false
            for try await response in relayClient.invoke(
                targetDeviceId: deviceId.uuidString,
                request: RpcRequest(method: "system.ping", params: [:]),
                timeout: TimeInterval(timeoutSeconds)
            ) {
                receivedResponse = true
                if let error = response.error {
                    throw MultiConnectionError.connectionFailed("Desktop ping failed: \(error.message)")
                }
                if response.isFinal {
                    return
                }
            }

            if !receivedResponse {
                throw MultiConnectionError.connectionFailed("Desktop did not respond to ping.")
            }
        } catch is ServerRelayError {
            throw MultiConnectionError.connectionFailed("Desktop did not respond to ping.")
        } catch {
            throw error
        }
    }

    private func verifyDesktopConnection(deviceId: UUID, timeoutSeconds: Int = 3) async throws {
        guard let relayClient = storage[deviceId] else {
            throw MultiConnectionError.connectionFailed("Relay client not found")
        }

        guard relayClient.isConnected else {
            throw MultiConnectionError.connectionFailed("Relay not connected")
        }

        // Use system ping for verification
        try await performSystemPing(deviceId: deviceId, relayClient: relayClient, timeoutSeconds: timeoutSeconds)
    }

    public func addConnection(to device: RegisteredDevice, token: String?) async -> Result<UUID, Error> {
        // Delegate to addConnection(for:) and set activeDeviceId
        let result = await addConnection(for: device.deviceId)
        if case .success(_) = result {
            setActive(device.deviceId)
        }
        return result
    }

    /// Switch to a different active device, disconnecting all others
    @MainActor
    public func switchActiveDevice(to deviceId: UUID) async -> Result<UUID, Error> {
        // If already connected to target device, return early
        if activeDeviceId == deviceId,
           let state = connectionStates[deviceId],
           case .connected = state {
            return .success(deviceId)
        }

        // Connect to target device if not already connected
        if connectionStates[deviceId] == nil || !connectionStates[deviceId]!.isConnected {
            let result = await addConnection(for: deviceId)
            if case .failure(let error) = result {
                return .failure(error)
            }
        }

        // Disconnect all other devices
        let devicesToRemove = storage.keys.filter { $0 != deviceId }
        for otherDeviceId in devicesToRemove {
            removeConnection(deviceId: otherDeviceId)
            clearReconnectState(for: otherDeviceId)
        }

        // Set as active and persist
        setActive(deviceId)
        persistActiveDeviceId()
        persistConnectedDevices([deviceId])

        return .success(deviceId)
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
                do {
                    try await verifyDesktopConnection(deviceId: deviceId, timeoutSeconds: 3)
                    await MainActor.run {
                        activeDeviceId = deviceId
                    }
                    return .success(deviceId)
                } catch {
                    // Verification failed - fall through to rebuild connection
                    existingClient.disconnect()
                    await MainActor.run {
                        storage.removeValue(forKey: deviceId)
                        connectionStates.removeValue(forKey: deviceId)
                    }
                }
            } else {
                // Connection exists but is not healthy - remove it and create a new one
                existingClient.disconnect()
                await MainActor.run {
                    storage.removeValue(forKey: deviceId)
                    connectionStates.removeValue(forKey: deviceId)
                }
            }
        }

        // Set connecting state immediately for UI feedback
        await MainActor.run {
            connectionStates[deviceId] = .connecting
            updateConnectionHealth(for: deviceId, state: .connecting)
        }

        // If already connecting, wait for that task
        if let existingTask = connectingTasks[deviceId] {
            return await existingTask.value
        }

        // Cooldown check
        if let last = lastAddConnectionAt[deviceId],
           Date().timeIntervalSince(last) <= 1.0 {
            if let state = connectionStates[deviceId],
               state == .connecting || state == .handshaking || state == .reconnecting {
                return .failure(MultiConnectionError.connectionFailed("Connection attempt in progress"))
            }
        }

        // Set last connection attempt timestamp
        lastAddConnectionAt[deviceId] = Date()

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
                let token = try await AuthService.shared.getValidAccessToken()
                guard let authToken = token else {
                    return .failure(MultiConnectionError.authenticationRequired)
                }

                guard let serverURL = self.getServerURL() else {
                    return .failure(MultiConnectionError.invalidConfiguration)
                }

                let mobileDeviceId = DeviceManager.shared.getOrCreateDeviceID()

                let pinningDelegate = CertificatePinningManager.shared.createURLSessionDelegate(endpointType: .relay)
                let relayClient = ServerRelayClient(
                    serverURL: serverURL,
                    deviceId: mobileDeviceId,
                    sessionDelegate: pinningDelegate
                )
                relayClient.allowInternalReconnect = false

                try await relayClient.connect(jwtToken: authToken).asyncValue()

                await MainActor.run {
                    self.storage[deviceId] = relayClient
                    self.connectionStates[deviceId] = .handshaking
                    self.updateConnectionHealth(for: deviceId, state: .handshaking)
                    self.verifyingDevices.insert(deviceId)
                }

                await MainActor.run {
                    // Cancel any existing subscription for this device
                    if let old = self.connectionStateSubscriptions[deviceId] {
                        old.cancel()
                        self.connectionStateSubscriptions.removeValue(forKey: deviceId)
                    }
                    if var existingBag = self.deviceCancellables[deviceId] {
                        existingBag.removeAll()
                    }
                    self.deviceCancellables[deviceId] = Set<AnyCancellable>()

                    var deviceBag = self.deviceCancellables[deviceId] ?? Set<AnyCancellable>()
                    // At most one connectionState sink per deviceId; old sink is canceled when a new client is created.
                    let stateCancellable = relayClient.$connectionState
                        .sink { [weak self] state in
                            guard let self = self else { return }
                            Task { @MainActor in
                                switch state {
                                case .connected(let handshake):
                                    self.relayHandshakeByDevice[deviceId] = handshake
                                    if self.verifyingDevices.contains(deviceId) {
                                        self.connectionStates[deviceId] = .handshaking
                                        self.updateConnectionHealth(for: deviceId, state: .handshaking)
                                    } else {
                                        self.connectionStates[deviceId] = .connected(handshake)
                                        self.updateConnectionHealth(for: deviceId, state: .connected(handshake))
                                        self.persistConnectedDevice(deviceId)
                                        // Clear reconnection flag if this is the active device
                                        if deviceId == self.activeDeviceId {
                                            self.isActivelyReconnecting = false
                                        }
                                    }
                                    // Auto-assign if this is the only connected device and no active device is set
                                    if self.activeDeviceId == nil {
                                        let connected = self.connectedDeviceIds
                                        if connected.count == 1, connected.first == deviceId {
                                            self.setActive(deviceId)
                                        }
                                    }
                                case .reconnecting:
                                    self.connectionStates[deviceId] = .reconnecting
                                    self.updateConnectionHealth(for: deviceId, state: .reconnecting)
                                    self.verifyingDevices.insert(deviceId)
                                case .failed(let e):
                                    self.connectionStates[deviceId] = .failed(e)
                                    self.updateConnectionHealth(for: deviceId, state: .failed(e))
                                    self.verifyingDevices.remove(deviceId)
                                    self.triggerAggressiveReconnect(reason: .connectionLoss(deviceId), deviceIds: [deviceId])
                                case .disconnected:
                                    self.connectionStates[deviceId] = .disconnected
                                    self.updateConnectionHealth(for: deviceId, state: .disconnected)
                                    self.verifyingDevices.remove(deviceId)
                                    self.relayHandshakeByDevice.removeValue(forKey: deviceId)
                                    self.triggerAggressiveReconnect(reason: .connectionLoss(deviceId), deviceIds: [deviceId])
                                default:
                                    break
                                }
                            }
                        }
                    deviceBag.insert(stateCancellable)
                    self.deviceCancellables[deviceId] = deviceBag
                    self.connectionStateSubscriptions[deviceId] = stateCancellable
                }

                do {
                    try await self.verifyDesktopConnection(deviceId: deviceId, timeoutSeconds: 3)

                    await MainActor.run {
                        let handshake = self.relayHandshakeByDevice[deviceId] ?? ConnectionHandshake(
                            sessionId: UUID().uuidString,
                            clientId: DeviceManager.shared.getOrCreateDeviceID(),
                            transport: "relay"
                        )
                        self.connectionStates[deviceId] = .connected(handshake)
                        self.updateConnectionHealth(for: deviceId, state: .connected(handshake))
                        self.persistConnectedDevice(deviceId)
                        self.setActive(deviceId)
                        self.verifyingDevices.remove(deviceId)
                        // Clear reconnection flag since this is the active device
                        self.isActivelyReconnecting = false
                        self.lastConnectedServerURL = Config.serverURL
                        UserDefaults.standard.set(self.lastConnectedServerURL, forKey: self.serverContextKey)
                    }
                } catch {
                    await MainActor.run {
                        self.connectionStates[deviceId] = .failed(error)
                        self.updateConnectionHealth(for: deviceId, state: .failed(error))
                        self.verifyingDevices.remove(deviceId)
                    }
                    relayClient.disconnect()
                    throw error
                }

                return .success(deviceId)

            } catch {
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
        if activeDeviceId == deviceId {
            self.activeDeviceId = nil
            UserDefaults.standard.removeObject(forKey: activeDeviceKey)
            healthGraceTask?.cancel()
            healthGraceTask = nil
            connectionHealth = .dead
        }

        // Remove from persisted connected devices list
        var deviceIds = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
        deviceIds.removeAll { $0 == deviceId.uuidString }
        UserDefaults.standard.set(deviceIds, forKey: connectedDevicesKey)

        verifyingDevices.remove(deviceId)
        relayHandshakeByDevice.removeValue(forKey: deviceId)
        // Disconnect and remove relay connection
        if let relayClient = storage[deviceId] {
            relayClient.disconnect()
            storage.removeValue(forKey: deviceId)
        }

        // Clean up per-device subscriptions
        if var bag = deviceCancellables[deviceId] {
            bag.removeAll()
            deviceCancellables.removeValue(forKey: deviceId)
        }
        if let sub = connectionStateSubscriptions[deviceId] {
            sub.cancel()
            connectionStateSubscriptions.removeValue(forKey: deviceId)
        }
    }

    public func removeAllConnections() {
        stopAllReconnectTimers()
        cancelAllCancellables()
        reconnectStates.removeAll()
        connectingTasks.removeAll()
        healthGraceTask?.cancel()
        healthGraceTask = nil
        connectionHealth = .dead

        for (_, relayClient) in storage {
            relayClient.disconnect()
        }

        storage.removeAll()
        connectionStates.removeAll()
        verifyingDevices.removeAll()
        relayHandshakeByDevice.removeAll()
        activeDeviceId = nil

        // Clear all per-device state
        for (deviceId, var bag) in deviceCancellables {
            bag.removeAll()
        }
        deviceCancellables.removeAll()

        for (_, sub) in connectionStateSubscriptions {
            sub.cancel()
        }
        connectionStateSubscriptions.removeAll()

        stopAllReconnectTimers()
        reconnectStates.removeAll()

        UserDefaults.standard.removeObject(forKey: connectedDevicesKey)
        UserDefaults.standard.removeObject(forKey: activeDeviceKey)
        UserDefaults.standard.removeObject(forKey: serverContextKey)
        lastConnectedServerURL = nil

        persistConnectedDevices([])
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
        if deviceId == nil {
            UserDefaults.standard.removeObject(forKey: activeDeviceKey)
            healthGraceTask?.cancel()
            healthGraceTask = nil
            connectionHealth = .dead
        } else {
            persistActiveDeviceId()
            if let state = connectionStates[deviceId!] {
                updateConnectionHealth(for: deviceId!, state: state)
            }
        }
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
        guard let id = self.activeDeviceId else { return false }
        if let state = self.connectionStates[id] {
            switch state {
            case .connected:
                return true
            default:
                return false
            }
        }
        return false
    }

    /// Returns true if active device is connected OR actively reconnecting
    /// This is more tolerant than activeDeviceIsFullyConnected and useful for UI decisions
    /// during network transitions to avoid prematurely showing device selection
    public var activeDeviceIsConnectedOrReconnecting: Bool {
        guard let id = self.activeDeviceId else { return false }
        if let state = self.connectionStates[id] {
            return state.isConnectedOrConnecting
        }
        return false
    }

    // MARK: - Workspace Connectivity Predicates

    public var activeDeviceIsEffectivelyUsable: Bool {
        if activeDeviceIsFullyConnected { return true }
        if activeDeviceIsConnectedOrReconnecting, connectionHealth != .dead {
            return true
        }
        return false
    }

    public var activeDeviceIsEffectivelyDead: Bool {
        guard let activeId = activeDeviceId,
              let state = connectionStates[activeId] else {
            return true
        }
        switch state {
        case .failed, .disconnected:
            return connectionHealth == .dead
        default:
            return false
        }
    }

    // MARK: - Workspace Connectivity Mapping

    public func workspaceConnectivityState(forOfflineMode offlineMode: Bool) -> WorkspaceConnectivityState {
        if offlineMode {
            return .offlineModeCandidate
        }

        guard let activeId = activeDeviceId,
              let state = connectionStates[activeId] else {
            return .degradedDisconnected
        }

        switch state {
        case .connected:
            if connectionHealth == .healthy {
                return .healthy
            } else {
                return .transientReconnecting
            }
        case .connecting, .handshaking, .authenticating, .reconnecting:
            return .transientReconnecting
        case .disconnected, .failed:
            return .degradedDisconnected
        case .closing:
            return .transientReconnecting
        }
    }

    // MARK: - Aggressive Reconnection Policy

    private func clearReconnectState(for deviceId: UUID) {
        reconnectStates.removeValue(forKey: deviceId)
    }

    public func triggerAggressiveReconnect(reason: ReconnectReason, deviceIds: [UUID]? = nil) {
        var candidates: [UUID] = []

        if let activeId = activeDeviceId {
            candidates.append(activeId)
        }

        if let specifiedIds = deviceIds {
            for id in specifiedIds where !candidates.contains(id) {
                candidates.append(id)
            }
        } else {
            let deviceIdStrs = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
            for idStr in deviceIdStrs {
                if let uuid = UUID(uuidString: idStr), !candidates.contains(uuid) {
                    candidates.append(uuid)
                }
            }
        }

        for deviceId in candidates {
            // Guard against redundant reconnection attempts
            if let st = connectionStates[deviceId] {
                if st.isConnected || st == .connecting || st == .handshaking || st == .reconnecting {
                    continue
                }
            }
            if connectingTasks[deviceId] != nil {
                continue
            }
            if reconnectStates[deviceId]?.isAggressiveActive == true {
                continue
            }
            startAggressiveSequence(for: deviceId, reason: reason)
        }
    }

    private func startAggressiveSequence(for deviceId: UUID, reason: ReconnectReason) {
        guard canAttemptReconnect(for: deviceId) else {
            return
        }

        // Set reconnecting flag if this is the active device
        if deviceId == activeDeviceId {
            isActivelyReconnecting = true
        }

        if reconnectStates[deviceId] == nil {
            reconnectStates[deviceId] = DeviceReconnectState()
        }
        reconnectStates[deviceId]?.isAggressiveActive = true
        reconnectStates[deviceId]?.attempts = 0
        if reconnectStates[deviceId]?.aggressiveWindowStart == nil {
            reconnectStates[deviceId]?.aggressiveWindowStart = Date()
        }

        reconnectStates[deviceId]?.backgroundTimer?.invalidate()
        reconnectStates[deviceId]?.backgroundTimer = nil
        reconnectStates[deviceId]?.currentTask?.cancel()

        let task = Task { @MainActor in
            await scheduleNextReconnectAttempt(for: deviceId)
        }
        reconnectStates[deviceId]?.currentTask = task
    }

    private func scheduleNextReconnectAttempt(for deviceId: UUID) async {
        // Early exit if already connected or connecting
        if let state = connectionStates[deviceId], state.isConnected {
            return
        }
        if connectingTasks[deviceId] != nil {
            return
        }

        guard var state = reconnectStates[deviceId], state.isAggressiveActive else { return }

        let elapsed = Date().timeIntervalSince(state.aggressiveWindowStart ?? Date())
        if state.attempts >= reconnectPolicy.maxAggressiveAttempts || elapsed >= reconnectPolicy.maxAggressiveWindowSeconds {
            degradeToBackgroundRetry(for: deviceId)
            return
        }

        let attemptIndex = min(state.attempts, reconnectPolicy.attemptDelays.count - 1)
        let baseDelay = reconnectPolicy.attemptDelays[attemptIndex]
        let jitterRange = baseDelay * reconnectPolicy.jitterFactor
        let jitter = Double.random(in: -jitterRange...jitterRange)
        let delay = max(0, baseDelay + jitter)

        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

        await attemptConnect(for: deviceId)
    }

    private func attemptConnect(for deviceId: UUID) async {
        guard canAttemptReconnect(for: deviceId) else {
            reconnectStates[deviceId]?.isAggressiveActive = false
            return
        }

        let result = await addConnection(for: deviceId)

        switch result {
        case .success:
            reconnectStates[deviceId]?.currentTask?.cancel()
            reconnectStates[deviceId]?.backgroundTimer?.invalidate()
            reconnectStates.removeValue(forKey: deviceId)

            lastConnectedServerURL = Config.serverURL
            UserDefaults.standard.set(lastConnectedServerURL, forKey: serverContextKey)

        case .failure(let error):
            reconnectStates[deviceId]?.lastError = error
            reconnectStates[deviceId]?.attempts += 1

            await scheduleNextReconnectAttempt(for: deviceId)
        }
    }

    private func canAttemptReconnect(for deviceId: UUID) -> Bool {
        guard AuthService.shared.isAuthenticated == true else {
            return false
        }

        if let lastServer = lastConnectedServerURL, lastServer != Config.serverURL {
            NotificationCenter.default.post(
                name: Notification.Name("connection-server-context-changed"),
                object: nil,
                userInfo: ["old": lastServer, "new": Config.serverURL]
            )
            Task { @MainActor in
                await self.hardReset(reason: .serverContextChanged)
            }
            return false
        }

        let deviceIdStrs = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
        let knownDeviceIds = deviceIdStrs.compactMap { UUID(uuidString: $0) }
        guard deviceId == activeDeviceId || knownDeviceIds.contains(deviceId) else {
            return false
        }

        return true
    }

    private func degradeToBackgroundRetry(for deviceId: UUID) {
        reconnectStates[deviceId]?.isAggressiveActive = false
        reconnectStates[deviceId]?.currentTask?.cancel()
        reconnectStates[deviceId]?.currentTask = nil

        // Clear reconnecting flag if this is the active device
        if deviceId == activeDeviceId {
            isActivelyReconnecting = false
        }

        let errorMessage: String
        if let lastError = reconnectStates[deviceId]?.lastError {
            errorMessage = lastError.localizedDescription
        } else {
            errorMessage = "Connection could not be established"
        }

        NotificationCenter.default.post(
            name: Notification.Name("connection-reconnect-exhausted"),
            object: nil,
            userInfo: ["deviceId": deviceId.uuidString, "message": errorMessage]
        )

        let timer = Timer.scheduledTimer(withTimeInterval: reconnectPolicy.backgroundRetryInterval, repeats: true) { [weak self] _ in
            guard let self = self else { return }

            #if canImport(UIKit)
            guard UIApplication.shared.applicationState == .active else { return }
            #endif

            guard self.lastPath?.status == .satisfied else { return }

            guard self.canAttemptReconnect(for: deviceId) else { return }

            if let state = self.reconnectStates[deviceId] {
                if state.backgroundCycles >= 2 {
                    if let currentState = self.connectionStates[deviceId], !currentState.isConnected {
                        self.reconnectStates[deviceId]?.backgroundTimer?.invalidate()
                        Task { @MainActor in
                            await self.hardReset(reason: .reconnectionExhausted)
                        }
                        return
                    }
                }
            }

            self.reconnectStates[deviceId]?.backgroundCycles += 1

            Task { @MainActor in
                let result = await self.addConnection(for: deviceId)
                if case .success = result {
                    self.reconnectStates[deviceId]?.backgroundTimer?.invalidate()
                    self.reconnectStates.removeValue(forKey: deviceId)
                }
            }
        }

        reconnectStates[deviceId]?.backgroundTimer = timer
    }

    private func stopAllReconnectTimers() {
        for (_, state) in self.reconnectStates {
            state.currentTask?.cancel()
            state.backgroundTimer?.invalidate()
        }
        reconnectStates.removeAll()
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
        // Idempotency guard: only restore once per app lifecycle
        if hasRestoredOnce { return }
        hasRestoredOnce = true
        
        // Only restore if initialized and authenticated
        if !PlanToCodeCore.shared.isInitialized || AuthService.shared.isAuthenticated == false {
            return
        }

        let deviceIds = UserDefaults.standard.array(forKey: connectedDevicesKey) as? [String] ?? []
        for idStr in deviceIds {
            guard let uuid = UUID(uuidString: idStr) else { continue }
            let result = await addConnection(for: uuid)
        }

        // Auto-assign if exactly one device connected successfully and no active device
        if activeDeviceId == nil {
            let connected = connectedDeviceIds
            if connected.count == 1, let deviceId = connected.first {
                setActive(deviceId)
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

    private func persistConnectedDevices(_ ids: [UUID]) {
        let strings = ids.map { $0.uuidString }
        UserDefaults.standard.set(strings, forKey: connectedDevicesKey)
    }

    private func clearPersistedConnectedDevices(except: [UUID]) {
        persistConnectedDevices(except)
    }

    // MARK: - Connection Health Management

    private func updateConnectionHealth(for deviceId: UUID, state: ConnectionState) {
        guard deviceId == activeDeviceId else { return }

        switch state {
        case .connected:
            healthGraceTask?.cancel()
            healthGraceTask = nil
            connectionHealth = .healthy

        case .connecting, .handshaking, .authenticating, .reconnecting:
            healthGraceTask?.cancel()
            connectionHealth = .unstable

            healthGraceTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(12.0 * 1_000_000_000))
                guard let self = self, !Task.isCancelled else { return }
                await MainActor.run {
                    if let currentState = self.connectionStates[deviceId], currentState.isTransient {
                        self.connectionHealth = .dead
                    }
                }
            }

        case .failed, .disconnected, .closing:
            if connectionHealth == .healthy {
                connectionHealth = .unstable

                healthGraceTask?.cancel()
                healthGraceTask = Task { [weak self] in
                    try? await Task.sleep(nanoseconds: UInt64(12.0 * 1_000_000_000))
                    guard let self = self, !Task.isCancelled else { return }
                    await MainActor.run {
                        if let currentState = self.connectionStates[deviceId], !currentState.isConnected {
                            self.connectionHealth = .dead
                        }
                    }
                }
            }
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


