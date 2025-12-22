import Foundation
import Combine
import OSLog
#if canImport(UIKit)
import UIKit
#endif

/// Terminal input must remain raw bytes end-to-end to preserve all keyboard sequences.
///
/// Root cause of keyboard issues: byte→String conversion drops control/meta sequences.
/// Fix: Always transmit raw bytes via write(jobId:bytes:) or write(jobId:data:).
/// Base64 encoding happens only at the transport boundary (RPC layer).
///
/// Parity with desktop:
/// - Raw byte input pipeline via base64-encoded RPC
/// - PTY resize propagation on terminal size changes
/// - Connection readiness gating before session start

private let MOBILE_TERMINAL_RING_MAX_BYTES = 8 * 1_048_576

private enum TerminalSessionLifecycle: Equatable {
    case initializing
    case active
    case inactive(reason: String)
}

private struct ByteRing {
    private var storage: Data
    private let maxBytes: Int

    init(maxBytes: Int = 8 * 1_048_576) {
        self.storage = Data()
        self.maxBytes = maxBytes
    }

    mutating func append(_ data: Data) {
        self.storage.append(data)
        if self.storage.count > self.maxBytes {
            let overflow = self.storage.count - self.maxBytes
            self.storage.removeFirst(overflow)
        }
    }

    func snapshot() -> Data {
        return self.storage
    }

    var isEmpty: Bool {
        return self.storage.isEmpty
    }
}

/// Service for managing terminal sessions via RPC calls to connected desktop devices
@MainActor
public class TerminalDataService: ObservableObject {
    private let logger = Logger(subsystem: "PlanToCode", category: "TerminalDataService")

    // MARK: - Published Properties
    @Published public private(set) var activeSessions: [String: TerminalSession] = [:]
    @Published public private(set) var isLoading = false
    @Published public private(set) var lastError: DataServiceError?
    @Published public private(set) var readinessBySession: [String: Bool] = [:]

    // MARK: - Private Properties
    private let connectionManager = MultiConnectionManager.shared
    private var lifecycleBySession: [String: TerminalSessionLifecycle] = [:]
    private var eventSubscriptions: [String: AnyCancellable] = [:]
    private var outputPublishers: [String: PassthroughSubject<TerminalOutput, Never>] = [:]
    private var outputBytesPublishers: [String: PassthroughSubject<Data, Never>] = [:]
    private var connectionStateCancellable: AnyCancellable?
    private var jobToSessionId: [String: String] = [:]
    private var ensureInFlight: Set<String> = []
    private var outputRings: [String: ByteRing] = [:]
    private var boundSessions: Set<String> = []
    private var activeDeviceReconnectCancellable: AnyCancellable?
    private var lastActivityBySession: [String: Date] = [:]
    private let bindingStore = TerminalBindingStore.shared
    private var currentBoundSessionId: String?
    private var globalBinarySubscription: AnyCancellable?
    private var binarySubscriptionDeviceId: UUID?
    private var firstResizeCompleted = Set<String>()
    private var pendingUnbindTasks: [String: Task<Void, Never>] = [:]
    private var bootstrapInFlight = false
    private var lastBootstrapAt: Date?
    private var lastKnownSizeBySession: [String: (cols: Int, rows: Int)] = [:]
    private var hardResetObserver: NSObjectProtocol?

    // MARK: - Initialization
    public init() {
        self.setupEventSubscriptions()

        hardResetObserver = NotificationCenter.default.addObserver(
            forName: NSNotification.Name("connection-hard-reset-completed"),
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.cleanForDeviceSwitch() }
        }

        self.connectionStateCancellable = MultiConnectionManager.shared.$connectionStates
            .sink { [weak self] states in
                guard let self = self else { return }
                let isConnected = states.values.contains { state in
                    if case .connected = state { return true }
                    return false
                }

                if isConnected {
                    Task { @MainActor in
                        await self.bootstrapFromRemote()

                        for sessionId in self.activeSessions.keys {
                            if let deviceId = self.connectionManager.activeDeviceId {
                                self.subscribeToSessionOutputIfNeeded(sessionId: sessionId, deviceId: deviceId)
                            }
                        }
                    }
                }
            }

        self.activeDeviceReconnectCancellable = MultiConnectionManager.shared.$connectionStates
            .sink { [weak self] (states: [UUID: ConnectionState]) in
                guard let self = self else { return }
                guard let activeId = self.connectionManager.activeDeviceId else { return }

                // Clear readiness on disconnection so we rebind on reconnect
                switch states[activeId] {
                case .disconnected, .reconnecting, .failed:
                    Task { @MainActor [weak self] in
                        guard let self = self else { return }
                        if !self.readinessBySession.isEmpty {
                            self.logger.info("Connection lost - clearing readinessBySession for rebind on reconnect")
                            self.readinessBySession.removeAll()
                        }
                    }
                    return
                case .connected:
                    break
                default:
                    return
                }

                Task { @MainActor in
                    self.ensureGlobalBinarySubscriptionForActiveDevice()

                    guard let relayClient = self.connectionManager.relayConnection(for: activeId),
                          relayClient.isConnected,
                          relayClient.hasSessionCredentials else {
                        return
                    }

                    for sessionId in self.boundSessions where self.lifecycleBySession[sessionId] == .active {
                        if self.readinessBySession[sessionId] == true {
                            self.logger.debug("Session \(sessionId) already ready, skipping rebind")
                            continue
                        }

                        do {
                            self.logger.info("terminal.rebind sid=\(sessionId) after reconnect")
                            try await relayClient.sendBinaryBind(producerDeviceId: activeId.uuidString, sessionId: sessionId, includeSnapshot: false)
                            self.readinessBySession[sessionId] = true
                        } catch {
                            self.logger.error("Failed to rebind session \(sessionId): \(error)")
                        }
                    }
                }
            }
    }

    deinit {
        if let observer = hardResetObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        connectionStateCancellable?.cancel()
        activeDeviceReconnectCancellable?.cancel()
        globalBinarySubscription?.cancel()
        eventSubscriptions.values.forEach { $0.cancel() }
        pendingUnbindTasks.values.forEach { $0.cancel() }
    }

    // MARK: - Terminal Session Management

    /// Start a new terminal session for the given job
    public func startSession(jobId: String, shell: String? = nil, context: TerminalContextBinding) async throws -> TerminalSession {
        guard let deviceId = self.connectionManager.activeDeviceId,
              let relayClient = self.connectionManager.relayConnection(for: deviceId) else {
            throw DataServiceError.connectionError("No active device connection")
        }

        self.isLoading = true
        defer { self.isLoading = false }

        var params: [String: Any] = ["jobId": jobId]
        if let shell = shell {
            params["shell"] = shell
        }

        let request = RpcRequest(
            method: "terminal.start",
            params: params
        )

        do {
            var sessionData: [String: Any]?

            for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }

                if let result = response.result?.value as? [String: Any] {
                    sessionData = result
                    if response.isFinal {
                        break
                    }
                }
            }

            guard let data = sessionData,
                  let sessionId = data["sessionId"] as? String else {
                throw DataServiceError.invalidResponse("Invalid session response")
            }

            if !jobId.hasPrefix("terminal-session-") && sessionId != jobId {
                self.logger.warning("Protocol violation: server must echo jobId as sessionId for job-backed terminals (jobId=\(jobId), sessionId=\(sessionId))")
            }

            let session = TerminalSession(
                id: sessionId,
                jobId: jobId,
                deviceId: deviceId,
                createdAt: Date(),
                isActive: true,
                workingDirectory: data["workingDirectory"] as? String ?? "~",
                shell: data["shell"] as? String ?? "default"
            )

            self.lifecycleBySession[sessionId] = .initializing
            self.activeSessions[sessionId] = session
            self.jobToSessionId[jobId] = sessionId

            // Remove stale bootstrapped sessions with same jobId but different id
            // This prevents ensureSession from finding old sessions via .first()
            let staleKeys = self.activeSessions.keys.filter { key in
                key != sessionId && self.activeSessions[key]?.jobId == jobId
            }
            for staleKey in staleKeys {
                self.logger.info("Removing stale session \(staleKey) superseded by \(sessionId)")
                self.activeSessions.removeValue(forKey: staleKey)
            }

            // Save binding to persistent store
            let binding = TerminalBinding(
                terminalSessionId: session.id,
                appSessionId: context.appSessionId,
                contextType: context.contextType,
                jobId: context.jobId,
                createdAt: Date()
            )
            self.bindingStore.save(binding)
            self.logger.info("Saved terminal binding: sessionId=\(session.id) appSessionId=\(context.appSessionId) contextType=\(context.contextType.rawValue) jobId=\(context.jobId ?? "nil")")

            self.subscribeToSessionOutput(sessionId: sessionId, deviceId: deviceId)
            self.lifecycleBySession[sessionId] = .active

            // IMPORTANT: We intentionally DO NOT hydrate initialLog here because:
            // 1. initialLog is formatted for desktop PTY's default size (24x80)
            // 2. Mobile terminal has a different size (e.g., 30x60)
            // 3. Absolute cursor positioning escape sequences in initialLog would be wrong
            // 4. Instead, we rely on attachLiveBinary(includeSnapshot=true) which sends
            //    a fresh snapshot AFTER mobile terminal size is synced with desktop PTY
            //
            // This ensures all output is rendered with correct terminal dimensions.

            self.logger.info("Terminal session started: \(sessionId) for job \(jobId)")
            return session

        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Write text to a terminal session
    public func write(jobId: String, text: String) async throws {
        guard let textData = text.data(using: .utf8) else {
            throw DataServiceError.invalidState("Failed to encode text as UTF-8")
        }
        try await write(jobId: jobId, data: textData)
    }

    /// Write raw bytes to terminal session (preserves all control/meta/function keys)
    ///
    /// This method preserves the exact byte sequences from SwiftTerm, ensuring that
    /// Ctrl, Meta, ESC, and function keys work correctly. Desktop uses this same
    /// byte-preserving approach. Raw bytes are base64-encoded for transport only.
    public func write(jobId: String, bytes: [UInt8]) async throws {
        let data = Data(bytes)
        try await write(jobId: jobId, data: data)
    }

    /// Write raw data to terminal session (preserves all control/meta/function keys)
    ///
    /// This is the canonical terminal input path. All keyboard input must use this
    /// method to preserve control sequences. Base64 encoding happens only at the
    /// transport boundary to avoid any lossy conversions.
    public func write(jobId: String, data: Data) async throws {
        // Fast path: if session exists and publisher is ready, skip ensureSession
        if let existingSession = self.activeSessions.values.first(where: { $0.jobId == jobId }),
           self.outputPublishers[existingSession.id] != nil {
            try await self.writeViaRelay(session: existingSession, data: data)
            return
        }

        let session = try await self.ensureSession(jobId: jobId, autostartIfNeeded: true)
        try await self.writeViaRelay(session: session, data: data)
    }

    /// Send large text to terminal in chunks to avoid overwhelming the PTY
    public func sendLargeText(jobId: String, text: String, appendCarriageReturn: Bool = true, chunkSize: Int = 2_097_152) async throws {
        guard !text.isEmpty else { return }

        let session = try await self.ensureSession(jobId: jobId, autostartIfNeeded: true)

        // Send the text content (without carriage return embedded)
        let data = Data(text.utf8)

        var offset = 0
        while offset < data.count {
            let endIndex = min(offset + chunkSize, data.count)
            let chunk = data[offset..<endIndex]

            try await self.writeViaRelay(session: session, data: Data(chunk))

            offset = endIndex
            await Task.yield()
        }

        // Send carriage return as a separate write to trigger Enter
        // Terminals expect CR (0x0D) not LF (0x0A) for the Enter key
        if appendCarriageReturn {
            try await self.writeViaRelay(session: session, data: Data([0x0D]))  // CR byte (carriage return)
        }
    }


    /// Maximum retry attempts for transient write errors
    private static let maxWriteRetries = 3
    /// Base delay between retries (exponential backoff)
    private static let retryBaseDelay: TimeInterval = 0.1

    private func writeViaRelay(session: TerminalSession, data: Data) async throws {
        if let binding = self.bindingStore.getByTerminalSessionId(session.id) {
            self.logger.info("terminal.write sessionId=\(session.id) appSessionId=\(binding.appSessionId) contextType=\(binding.contextType.rawValue) jobId=\(binding.jobId ?? "nil") bytes=\(data.count)")
        }

        var lastError: Error?

        for attempt in 0..<Self.maxWriteRetries {
            // Check connection before each attempt
            guard self.connectionManager.activeDeviceId != nil,
                  self.connectionManager.relayConnection(for: session.deviceId) != nil else {
                throw DataServiceError.connectionError("No active relay connection")
            }

            do {
                let base64 = data.base64EncodedString()
                for try await response in CommandRouter.terminalWriteData(sessionId: session.id, base64Data: base64) {
                    if let error = response.error {
                        throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                    }
                    if response.isFinal {
                        return // Success
                    }
                }
                return // Success
            } catch let error as ServerRelayError {
                lastError = error

                // Check if this is a retryable error
                let isRetryable: Bool
                switch error {
                case .notConnected, .timeout, .disconnected, .networkError:
                    isRetryable = true
                default:
                    isRetryable = false
                }

                if !isRetryable || attempt == Self.maxWriteRetries - 1 {
                    self.lastError = DataServiceError.networkError(error)
                    throw error
                }

                // Exponential backoff before retry
                let delay = Self.retryBaseDelay * pow(2.0, Double(attempt))
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            } catch {
                // Non-ServerRelayError - don't retry
                self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
                throw error
            }
        }

        // Should not reach here, but handle just in case
        if let error = lastError {
            throw error
        }
    }

    /// Resize terminal window
    public func resize(jobId: String, cols: Int, rows: Int) async throws {
        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)
        let sessionId = session.id

        // Track last known size for resize coalescing during reconnection
        lastKnownSizeBySession[sessionId] = (cols: cols, rows: rows)

        // Only coalesce subsequent resizes if session is not ready AND first resize already completed
        // We must let the first resize through to trigger the initial binary bind
        let isFirstResize = !firstResizeCompleted.contains(sessionId)
        if !isFirstResize && readinessBySession[sessionId] != true {
            self.logger.info("terminal.resize coalesced (session not ready): sessionId=\(sessionId) cols=\(cols) rows=\(rows)")
            return
        }

        if let binding = bindingStore.getByJobId(jobId) {
            self.logger.info("terminal.resize sessionId=\(session.id) appSessionId=\(binding.appSessionId) contextType=\(binding.contextType.rawValue) jobId=\(binding.jobId ?? "nil") cols=\(cols) rows=\(rows)")
        }

        do {
            for try await response in CommandRouter.terminalResize(sessionId: session.id, cols: cols, rows: rows) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }
                if response.isFinal {
                    break
                }
            }

            if isFirstResize && cols > 10 && rows > 5 {
                firstResizeCompleted.insert(sessionId)
                scheduleInitialBindIfReady(sessionId: sessionId, jobId: jobId)
            }
        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    public func kill(jobId: String) async throws {
        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: false)

        do {
            lifecycleBySession[session.id] = .inactive(reason: "Killing")

            for try await response in CommandRouter.terminalKill(sessionId: session.id) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }
                if response.isFinal {
                    break
                }
            }

            activeSessions[session.id]?.isActive = false
            self.logger.info("Terminal session killed: \(session.id)")

            finalizeBinding(sessionId: session.id)
            lifecycleBySession[session.id] = .inactive(reason: "Killed")

            // Remove binding from persistent store
            if let sid = jobToSessionId[jobId] {
                bindingStore.delete(terminalSessionId: sid)
                self.logger.info("Deleted binding for killed session: \(sid)")
            }

            // Clean up subscriptions and publishers
            eventSubscriptions[session.id]?.cancel()
            eventSubscriptions.removeValue(forKey: session.id)
            outputPublishers.removeValue(forKey: session.id)
            lastActivityBySession.removeValue(forKey: session.id)
            activeSessions.removeValue(forKey: session.id)

            // Clean up ring buffers and tracking data
            outputRings.removeValue(forKey: session.id)
            lastKnownSizeBySession.removeValue(forKey: session.id)

        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Send Ctrl+C to a terminal session
    public func sendCtrlC(jobId: String) async throws {
        try await write(jobId: jobId, bytes: [0x03]) // ETX (End of Text) control byte
    }

    /// Detach from a terminal session (cleanup on view dismiss)
    public func detach(jobId: String) async throws {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            // Already detached or never attached
            return
        }

        // Route all operations through relay
        try await detachViaRelay(session: session)

        self.logger.info("Terminal session detached: \(session.id) for job \(jobId)")
    }


    /// Detach via relay
    private func detachViaRelay(session: TerminalSession) async throws {
        detachLiveBinary(for: session.jobId)

        // DO NOT send unbind here - binding should persist for session lifetime, not view lifetime
        // Unbind only happens on actual session termination (see finalizeBinding)

        do {
            for try await response in CommandRouter.terminalDetach(sessionId: session.id) {
                if let error = response.error {
                    // Log but don't throw for detach errors - it's a cleanup operation
                    self.logger.warning("Terminal detach error (non-fatal): \(error)")
                }
                if response.isFinal {
                    break
                }
            }
        } catch {
            // Don't propagate detach errors - log and continue
            self.logger.warning("Terminal detach failed (non-fatal): \(error)")
        }
    }

    /// Check if a session is currently bound
    ///
    /// - Parameter sessionId: The terminal session ID
    /// - Returns: true if the session is bound, false otherwise
    public func isBound(sessionId: String) -> Bool {
        return boundSessions.contains(sessionId)
    }

    // Binding is session-scoped and persists until finalizeBinding(); view lifecycle does not affect binding.
    // Reconnect flow rebinds all bound sessions with includeSnapshot=true to restore stream safely.

    /// Attach to live binary terminal output for a session.
    ///
    /// This method establishes binary WebSocket streaming with proper ordering guarantees:
    /// 1. Ensures output ring buffer and publishers exist FIRST
    /// 2. Then sends terminal.binary.bind to the desktop
    /// 3. Sets up automatic rebinding on reconnect/device-change
    ///
    /// This ordering prevents the race where binary frames arrive before subscription,
    /// which caused the "blank until reopen" bug.
    ///
    /// Call this AFTER subscribing to getHydratedRawOutputStream for best results.
    ///
    /// - Parameters:
    ///   - jobId: The terminal job ID
    ///   - includeSnapshot: Whether to include ring buffer snapshot in the bind call (default true)
    public func attachLiveBinary(for jobId: String, includeSnapshot: Bool = true) {
        guard let sessionId = jobToSessionId[jobId] else {
            self.logger.warning("Cannot attach: no session for job \(jobId)")
            return
        }

        if readinessBySession[sessionId] == true {
            self.logger.info("Already bound to session \(sessionId)")
            return
        }

        _ = ensureBytesPublisher(for: sessionId)
        if outputRings[sessionId] == nil {
            outputRings[sessionId] = ByteRing(maxBytes: MOBILE_TERMINAL_RING_MAX_BYTES)
        }

        bindBinary(to: sessionId, includeSnapshot: includeSnapshot)

        self.logger.info("Attached binary stream for session \(sessionId) with includeSnapshot=\(includeSnapshot)")
    }

    private func bindBinary(to sessionId: String, includeSnapshot: Bool) {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            self.logger.warning("Cannot bind: no active relay connection")
            return
        }

        currentBoundSessionId = sessionId
        ensureGlobalBinarySubscription(relayClient: relayClient, deviceId: deviceId)

        Task {
            do {
                try await relayClient.sendBinaryBind(producerDeviceId: deviceId.uuidString, sessionId: sessionId, includeSnapshot: includeSnapshot)
                await MainActor.run {
                    self.handleBindAck(sessionId: sessionId)
                }
            } catch {
                self.logger.error("Failed to send binary bind: \(error)")
            }
        }
        self.logger.info("Bound binary stream to session: \(sessionId)")
    }

    /// Handle bind acknowledgement and reissue last-known size
    private func handleBindAck(sessionId: String) {
        readinessBySession[sessionId] = true

        // Reissue last-known terminal size if available
        if let size = lastKnownSizeBySession[sessionId] {
            self.logger.info("Reissuing terminal size after bind ack: sessionId=\(sessionId) cols=\(size.cols) rows=\(size.rows)")

            // Find jobId for this session to call resize properly
            if let jobId = jobToSessionId.first(where: { $0.value == sessionId })?.key {
                Task {
                    try? await self.resize(jobId: jobId, cols: size.cols, rows: size.rows)
                }
            }
        }
    }

    private func ensureGlobalBinarySubscription(relayClient: ServerRelayClient, deviceId: UUID) {
        globalBinarySubscription?.cancel()
        globalBinarySubscription = relayClient.terminalBytes
            .sink { [weak self] bytesEvent in
                self?.handleTerminalBytes(bytesEvent)
            }
        binarySubscriptionDeviceId = deviceId

        self.logger.info("Global binary subscription established for device \(deviceId)")
    }

    private func handleTerminalBytes(_ event: ServerRelayClient.TerminalBytesEvent) {
        self.logger.debug("handleTerminalBytes: received \(event.data.count) bytes, event.sessionId=\(event.sessionId ?? "nil")")

        guard let sessionId = event.sessionId ?? currentBoundSessionId else {
            self.logger.warning("handleTerminalBytes: dropping \(event.data.count) bytes - no sessionId (event.sessionId=\(event.sessionId ?? "nil"), currentBoundSessionId=\(self.currentBoundSessionId ?? "nil"))")
            return
        }

        if outputRings[sessionId] == nil {
            outputRings[sessionId] = ByteRing(maxBytes: MOBILE_TERMINAL_RING_MAX_BYTES)
        }
        outputRings[sessionId]!.append(event.data)

        let bytesPublisher = outputBytesPublishers[sessionId] ?? ensureBytesPublisher(for: sessionId)
        let hasSubscribers = outputBytesPublishers[sessionId] != nil
        if !hasSubscribers {
            self.logger.warning("handleTerminalBytes: no subscribers for session \(sessionId) - data may be lost")
        }
        bytesPublisher.send(event.data)

        lastActivityBySession[sessionId] = event.timestamp

        if let textPublisher = outputPublishers[sessionId],
           let decoded = String(data: event.data, encoding: .utf8) {
            let output = TerminalOutput(
                sessionId: sessionId,
                data: decoded,
                timestamp: event.timestamp,
                outputType: .stdout
            )
            textPublisher.send(output)
        }
    }

    private func ensureGlobalBinarySubscriptionForActiveDevice() {
        guard let activeDeviceId = connectionManager.activeDeviceId,
              let activeRelay = connectionManager.relayConnection(for: activeDeviceId) else {
            return
        }

        ensureGlobalBinarySubscription(relayClient: activeRelay, deviceId: activeDeviceId)
    }

    public func detachLiveBinary(for jobId: String) {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            return
        }

        let sessionId = session.id
        self.logger.info("Detached binary stream for session \(sessionId)")
    }

    private func finalizeBinding(sessionId: String) {
        if let pending = pendingUnbindTasks.removeValue(forKey: sessionId) {
            pending.cancel()
        }

        boundSessions.remove(sessionId)
        firstResizeCompleted.remove(sessionId)
        readinessBySession.removeValue(forKey: sessionId)
        if currentBoundSessionId == sessionId {
            currentBoundSessionId = nil
        }

        // Clean up ring buffers and tracking data
        outputRings.removeValue(forKey: sessionId)
        lastActivityBySession.removeValue(forKey: sessionId)
        lastKnownSizeBySession.removeValue(forKey: sessionId)

        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return
        }

        let task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            await MainActor.run {
                guard let self else { return }

                if self.boundSessions.contains(sessionId) {
                    self.logger.info("Deferred unbind skipped for session \(sessionId) - session rebound before timeout")
                    self.pendingUnbindTasks.removeValue(forKey: sessionId)
                    return
                }

                if self.lifecycleBySession[sessionId] == .active {
                    self.logger.info("Deferred unbind skipped for session \(sessionId) - session still active")
                    self.pendingUnbindTasks.removeValue(forKey: sessionId)
                    return
                }

                self.logger.info("terminal.teardown.unbind sid=\(sessionId) (reason=exit/kill, deferred=1s)")
                self.pendingUnbindTasks.removeValue(forKey: sessionId)
                relayClient.sendBinaryUnbind(sessionId: sessionId)
            }
        }

        pendingUnbindTasks[sessionId] = task
    }

    private func isSessionReadyForBinary(_ sessionId: String) -> Bool {
        guard lifecycleBySession[sessionId] == .active else { return false }
        guard outputPublishers[sessionId] != nil else { return false }
        guard outputBytesPublishers[sessionId] != nil else { return false }
        return true
    }

    public func isSessionReady(_ sessionId: String) -> Bool {
        return readinessBySession[sessionId] == true
    }

    private func scheduleInitialBindIfReady(sessionId: String, jobId: String) {
        guard lifecycleBySession[sessionId] == .active else { return }

        // Always mark as needing binding
        boundSessions.insert(sessionId)

        // Try to bind if connection is ready now
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId),
              relayClient.isConnected,
              relayClient.hasSessionCredentials else {
            // Not ready - will be bound by connection state observer when ready
            return
        }

        // Ready now - bind immediately
        // Don't request massive historical snapshot on initial load - prevents endless scrolling
        // The terminal will show live output going forward
        attachLiveBinary(for: jobId, includeSnapshot: false)
    }

    /// Get terminal output stream for a specific job
    public func getOutputStream(for jobId: String) -> AnyPublisher<TerminalOutput, Never> {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }),
              let publisher = outputPublishers[session.id] else {
            return Empty().eraseToAnyPublisher()
        }

        return publisher
            .filter { output in
                // Filter to only include output for this specific job
                output.sessionId == session.id
            }
            .eraseToAnyPublisher()
    }

    /// Get raw byte stream for terminal rendering (no text conversion)
    public func getRawOutputStream(for jobId: String) -> AnyPublisher<Data, Never> {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            return Empty().eraseToAnyPublisher()
        }
        return ensureBytesPublisher(for: session.id).eraseToAnyPublisher()
    }

    public func lastActivity(for sessionId: String) -> Date? {
        return lastActivityBySession[sessionId]
    }

    public func notifyInactivityDetected(sessionId: String, projectDirectory: String? = nil, jobId: String? = nil) {
        PushNotificationManager.shared.scheduleTerminalInactivityDetected(
            sessionId: sessionId,
            projectDirectory: projectDirectory,
            jobId: jobId
        )
    }

    /// Get hydrated raw byte stream that replays the ring buffer snapshot before live data.
    ///
    /// This method solves the PassthroughSubject race condition where terminal output sent
    /// before subscription would be lost. It returns a publisher that:
    /// 1. First emits the current ring buffer snapshot (historical output)
    /// 2. Then streams live binary frames from the desktop
    ///
    /// The ring buffer is NOT cleared on subscription, so reopening the terminal sheet
    /// always shows the most recent output immediately.
    ///
    /// - Parameter jobId: The terminal job ID
    /// - Returns: A publisher emitting raw terminal bytes (Data)
    public func getHydratedRawOutputStream(for jobId: String) -> AnyPublisher<Data, Never> {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            return Empty().eraseToAnyPublisher()
        }
        let live = ensureBytesPublisher(for: session.id)
        let ringSnapshot = outputRings[session.id]?.snapshot() ?? Data()

        // DO NOT clear ring - keep it persistent for future subscriptions
        // Return snapshot as single emission, then live stream
        if !ringSnapshot.isEmpty {
            return Just(ringSnapshot)
                .append(live)
                .eraseToAnyPublisher()
        } else {
            return live.eraseToAnyPublisher()
        }
    }

    /// Get terminal log for a job (historical output)
    public func getLog(jobId: String) async throws -> [TerminalOutput] {
        let sessionId = jobToSessionId[jobId] ?? jobId

        do {
            var logEntries: [[String: Any]]?

            for try await response in CommandRouter.terminalGetLog(sessionId: sessionId, maxLines: 1000) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }

                if let result = response.result?.value as? [String: Any] {
                    if let entries = result["log"] as? [[String: Any]] {
                        logEntries = entries
                    } else if let entries = result["entries"] as? [[String: Any]] {
                        logEntries = entries
                    }
                    if response.isFinal {
                        break
                    }
                }
            }

            guard let entries = logEntries else {
                return []
            }

            return entries.compactMap { entry in
                guard let data = entry["data"] as? String else { return nil }

                let content: String
                if let decodedData = Data(base64Encoded: data),
                   let decodedString = String(data: decodedData, encoding: .utf8) {
                    content = decodedString
                } else {
                    content = data
                }

                let timestamp = entry["timestamp"] as? TimeInterval ?? Date().timeIntervalSince1970
                let type = (entry["type"] as? String) ?? "stdout"

                return TerminalOutput(
                    sessionId: sessionId,
                    data: content,
                    timestamp: Date(timeIntervalSince1970: timestamp),
                    outputType: type == "stderr" ? .stderr : .stdout
                )
            }
        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    public func bootstrapFromRemote() async {
        // Idempotency guards: prevent concurrent or rapid successive bootstraps
        if bootstrapInFlight { return }
        if let last = lastBootstrapAt, Date().timeIntervalSince(last) < 1.0 { return }
        
        bootstrapInFlight = true
        defer {
            lastBootstrapAt = Date()
            bootstrapInFlight = false
        }
        
        guard let deviceId = connectionManager.activeDeviceId,
              connectionManager.relayConnection(for: deviceId) != nil else {
            return
        }

        do {
            var sessionIds: [String] = []
            for try await response in CommandRouter.terminalGetActiveSessions() {
                if let error = response.error {
                    self.logger.warning("Failed to get active sessions: \(error)")
                    return
                }
                if let result = response.result?.value as? [String: Any],
                   let sessions = result["sessions"] as? [String] {
                    sessionIds = sessions
                }
                if response.isFinal { break }
            }

            let remoteSet = Set(sessionIds)

            // Create missing sessions from remote
            for sessionId in sessionIds {
                guard activeSessions[sessionId] == nil else { continue }

                var metadataDict: [String: Any]?
                do {
                    for try await response in CommandRouter.terminalGetMetadata(sessionId: sessionId) {
                        if let result = response.result?.value as? [String: Any] {
                            metadataDict = result
                        }
                        if response.isFinal { break }
                    }
                } catch {
                    self.logger.warning("Failed to get metadata for \(sessionId): \(error)")
                    continue
                }

                guard let metadata = metadataDict else { continue }

                if let binding = bindingStore.getByTerminalSessionId(sessionId),
                   let boundJobId = binding.jobId {
                    let session = rebuildSessionFromMetadata(
                        sessionId: sessionId,
                        jobId: boundJobId,
                        deviceId: deviceId,
                        metadata: metadata
                    )
                    activeSessions[sessionId] = session
                    jobToSessionId[boundJobId] = sessionId
                } else {
                    let session = rebuildSessionFromMetadata(
                        sessionId: sessionId,
                        jobId: sessionId,
                        deviceId: deviceId,
                        metadata: metadata
                    )
                    activeSessions[sessionId] = session
                    jobToSessionId[sessionId] = sessionId
                }

                self.logger.info("Bootstrapped session: \(sessionId)")
            }

            // Mark stale sessions as inactive if they're not on remote
            for (id, _) in activeSessions {
                if case .active = lifecycleBySession[id], !remoteSet.contains(id) {
                    lifecycleBySession[id] = .inactive(reason: "Disconnected")
                    activeSessions[id]?.isActive = false
                    self.logger.info("Marked session \(id) as inactive - not found on remote")
                }
            }
        } catch {
            self.logger.warning("Bootstrap failed: \(error)")
        }
    }

    /// Clean all terminal state when switching devices
    @MainActor
    public func cleanForDeviceSwitch() {
        globalBinarySubscription?.cancel()
        globalBinarySubscription = nil
        binarySubscriptionDeviceId = nil

        eventSubscriptions.values.forEach { $0.cancel() }
        eventSubscriptions.removeAll()

        activeSessions.removeAll()
        jobToSessionId.removeAll()

        outputPublishers.removeAll()
        outputBytesPublishers.removeAll()
        outputRings.removeAll()

        boundSessions.removeAll()
        currentBoundSessionId = nil

        pendingUnbindTasks.values.forEach { $0.cancel() }
        pendingUnbindTasks.removeAll()

        lastActivityBySession.removeAll()
        firstResizeCompleted.removeAll()

        lifecycleBySession.removeAll()
        readinessBySession.removeAll()
        lastKnownSizeBySession.removeAll()

        lastError = nil
        isLoading = false

        logger.info("Terminal state cleaned for device switch")
    }

    // MARK: - Private Methods

    private func setupEventSubscriptions() {
        // This would subscribe to global terminal events if needed
        // For now, we subscribe to specific session outputs when sessions are created
    }

    private func ensureBytesPublisher(for sessionId: String) -> PassthroughSubject<Data, Never> {
        if let p = outputBytesPublishers[sessionId] {
            return p
        }
        let p = PassthroughSubject<Data, Never>()
        outputBytesPublishers[sessionId] = p
        return p
    }

    private func rebuildSessionFromMetadata(sessionId: String, jobId: String, deviceId: UUID, metadata: [String: Any]) -> TerminalSession {
        let status = metadata["status"] as? String ?? "unknown"
        let workingDir = metadata["workingDirectory"] as? String ?? "~"
        let startedAt = metadata["startedAt"] as? TimeInterval ?? Date().timeIntervalSince1970
        let isActive = (status == "running")

        let session = TerminalSession(
            id: sessionId,
            jobId: jobId,
            deviceId: deviceId,
            createdAt: Date(timeIntervalSince1970: startedAt),
            isActive: isActive,
            workingDirectory: workingDir,
            shell: "default"
        )

        lifecycleBySession[sessionId] = .initializing
        subscribeToSessionOutputIfNeeded(sessionId: sessionId, deviceId: deviceId)
        lifecycleBySession[sessionId] = .active

        return session
    }

    private func subscribeToSessionOutputIfNeeded(sessionId: String, deviceId: UUID) {
        guard outputPublishers[sessionId] == nil else { return }
        subscribeToSessionOutput(sessionId: sessionId, deviceId: deviceId)
    }

    private func ensureSession(jobId: String, shell: String? = nil, autostartIfNeeded: Bool = true) async throws -> TerminalSession {
        guard !ensureInFlight.contains(jobId) else {
            try await Task.sleep(nanoseconds: 100_000_000)
            if let session = activeSessions.values.first(where: { $0.jobId == jobId }) {
                return session
            }
            throw DataServiceError.invalidState("Concurrent ensure in progress for job \(jobId)")
        }

        ensureInFlight.insert(jobId)
        defer { ensureInFlight.remove(jobId) }

        if let existing = activeSessions.values.first(where: { $0.jobId == jobId }) {
            return existing
        }

        guard let deviceId = connectionManager.activeDeviceId else {
            throw DataServiceError.connectionError("No active device")
        }

        let sessionId = jobToSessionId[jobId] ?? jobId

        var statusData: [String: Any]?
        do {
            for try await response in CommandRouter.terminalGetStatus(sessionId: sessionId) {
                if let result = response.result?.value as? [String: Any] {
                    statusData = result
                }
                if response.isFinal { break }
            }
        } catch {
            self.logger.warning("Failed to get status for \(sessionId), will try to start: \(error)")
        }

        if let status = statusData?["status"] as? String {
            if status == "running" || status == "restored" {
                var metadataDict: [String: Any]?
                do {
                    for try await response in CommandRouter.terminalGetMetadata(sessionId: sessionId) {
                        if let result = response.result?.value as? [String: Any] {
                            metadataDict = result
                        }
                        if response.isFinal { break }
                    }
                } catch {
                    self.logger.warning("Failed to get metadata: \(error)")
                }

                let session = rebuildSessionFromMetadata(
                    sessionId: sessionId,
                    jobId: jobId,
                    deviceId: deviceId,
                    metadata: metadataDict ?? [:]
                )
                activeSessions[sessionId] = session
                jobToSessionId[jobId] = sessionId

                return session
            }
        }

        if autostartIfNeeded {
            // Check for existing binding or create default context for autostart
            let context: TerminalContextBinding
            if let existingBinding = bindingStore.getByJobId(jobId) {
                context = TerminalContextBinding(
                    appSessionId: existingBinding.appSessionId,
                    contextType: existingBinding.contextType,
                    jobId: existingBinding.jobId
                )
            } else {
                // Default context for autostart
                context = TerminalContextBinding(
                    appSessionId: "",
                    contextType: .implementationPlan,
                    jobId: jobId
                )
            }
            return try await startSession(jobId: jobId, shell: shell, context: context)
        } else {
            throw DataServiceError.invalidState("Session \(jobId) is stopped and autostart disabled")
        }
    }

    /// Subscribes to terminal output via raw binary frames.
    /// Sends bind control message to pair this mobile device with the desktop producer.
    /// Binary frames are forwarded as-is without any decoding.
    private func subscribeToSessionOutput(sessionId: String, deviceId: UUID) {
        guard let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return
        }

        // Binary subscription is now global - do not subscribe per session

        let outputSubject = PassthroughSubject<TerminalOutput, Never>()
        outputPublishers[sessionId] = outputSubject

        let bytesSubject = ensureBytesPublisher(for: sessionId)

        // Keep terminal.exit subscription for session termination
        let exitSubscription = relayClient.events
            .filter { event in
                event.eventType == "terminal.exit"
            }
            .compactMap { event -> TerminalOutput? in
                let dict = event.data.mapValues { $0.value }
                guard let sid = dict["sessionId"] as? String, sid == sessionId else { return nil }
                let code = dict["code"] as? Int
                let line = code != nil ? "[Session exited (code \(code!))]" : "[Session exited]"
                let exitReason = code != nil ? "Exited (code \(code!))" : "Exited"
                self.lifecycleBySession[sid] = .inactive(reason: exitReason)
                self.activeSessions[sid]?.isActive = false
                self.finalizeBinding(sessionId: sid)

                return TerminalOutput(sessionId: sid, data: line, timestamp: Date(), outputType: .system)
            }
            .sink { output in
                outputSubject.send(output)
            }

        eventSubscriptions[sessionId] = exitSubscription
    }

    private func parseTerminalOutputFromEntry(_ entry: [String: Any], sessionId: String) -> TerminalOutput? {
        guard let data = entry["data"] as? String else { return nil }

        let content: String
        if let decodedData = Data(base64Encoded: data),
           let decodedString = String(data: decodedData, encoding: .utf8) {
            content = decodedString
        } else {
            content = data
        }

        let timestamp = entry["timestamp"] as? TimeInterval ?? Date().timeIntervalSince1970
        let type = (entry["type"] as? String) ?? "stdout"

        return TerminalOutput(
            sessionId: sessionId,
            data: content,
            timestamp: Date(timeIntervalSince1970: timestamp),
            outputType: type == "stderr" ? .stderr : .stdout
        )
    }

}

// MARK: - Supporting Types

public struct TerminalSession {
    public let id: String
    public let jobId: String
    public let deviceId: UUID
    public let createdAt: Date
    public var isActive: Bool
    public let workingDirectory: String
    public let shell: String

    public init(id: String, jobId: String, deviceId: UUID, createdAt: Date, isActive: Bool, workingDirectory: String, shell: String) {
        self.id = id
        self.jobId = jobId
        self.deviceId = deviceId
        self.createdAt = createdAt
        self.isActive = isActive
        self.workingDirectory = workingDirectory
        self.shell = shell
    }
}

public struct TerminalOutput {
    public let sessionId: String
    public let data: String
    public let timestamp: Date
    public let outputType: TerminalOutputType

    public init(sessionId: String, data: String, timestamp: Date, outputType: TerminalOutputType) {
        self.sessionId = sessionId
        self.data = data
        self.timestamp = timestamp
        self.outputType = outputType
    }
}

public enum TerminalOutputType: String, CaseIterable {
    case stdout = "stdout"
    case stderr = "stderr"
    case system = "system"

    public init?(_ rawValue: String) {
        self.init(rawValue: rawValue)
    }
}

// MARK: - Payload Types

struct TerminalWritePayload: Codable {
    let sessionId: String
    let data: String
}

struct TerminalDetachPayload: Codable {
    let jobId: String
    let clientId: String
}

// MARK: - Publisher Extensions

extension AnyPublisher {
    public func async() async throws -> Output {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            cancellable = self
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
