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

/// Ring buffer for terminal output bytes with automatic head-trimming.
///
/// Maintains a rolling window of recent terminal output using byte-based capacity
/// (not frame count). When capacity is exceeded, older bytes are removed from the head.
///
/// This buffer persists across view attach/detach cycles, enabling instant rendering
/// when reopening the terminal sheet.
private struct ByteRing {
    private var storage: Data
    private let maxBytes: Int

    init(maxBytes: Int = 2_000_000) {
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

    // MARK: - Private Properties
    private let connectionManager = MultiConnectionManager.shared
    private var eventSubscriptions: [String: AnyCancellable] = [:]
    private var outputPublishers: [String: PassthroughSubject<TerminalOutput, Never>] = [:]
    private var outputBytesPublishers: [String: PassthroughSubject<Data, Never>] = [:]
    private var connectionStateCancellable: AnyCancellable?
    private var jobToSessionId: [String: String] = [:]
    private var ensureInFlight: Set<String> = []
    private var outputRings: [String: ByteRing] = [:]
    private var boundSessions: Set<String> = []
    private var activeDeviceReconnectCancellable: AnyCancellable?
    private var recentSentChunks: [String: [Data]] = [:]
    private let recentSentChunksLimit = 3
    private var lastActivityBySession: [String: Date] = [:]
    private let bindingStore = TerminalBindingStore.shared
    private var currentBoundSessionId: String?
    private var globalBinarySubscription: AnyCancellable?
    private var binarySubscriptionDeviceId: UUID?
    private var firstResizeCompleted = Set<String>() // Tracks session.id keys
    private var bindingRefCount = [String: Int]() // session.id -> refcount
    private var pendingUnbindTasks: [String: Task<Void, Never>] = [:]
    private var binarySubscriptionEstablishing = false
    private var isGlobalBinarySubscribed: Bool = false
    private let binarySubscriptionQueue = DispatchQueue(label: "TerminalDataService.binarySubscription")
    private var bootstrapInFlight = false
    private var lastBootstrapAt: Date?

    // MARK: - Initialization
    public init() {
        self.setupEventSubscriptions()

        NotificationCenter.default.addObserver(
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

                        // Binary subscription is now ONLY established via activeDeviceReconnectCancellable
                        // to ensure single-source subscription setup and eliminate race conditions
                    }
                }
            }

        self.activeDeviceReconnectCancellable = MultiConnectionManager.shared.$connectionStates
            .sink { [weak self] (states: [UUID: ConnectionState]) in
                guard let self = self else { return }
                guard let activeId = self.connectionManager.activeDeviceId else { return }

                if case .connected = states[activeId] {
                    Task { @MainActor in
                        if let activeDeviceId = self.binarySubscriptionDeviceId,
                           self.globalBinarySubscription != nil,
                           self.isGlobalBinarySubscribed {
                            return
                        }

                        self.ensureGlobalBinarySubscriptionForActiveDevice()

                        for sessionId in self.boundSessions {
                            if let relayClient = self.connectionManager.relayConnection(for: activeId),
                               relayClient.isConnected {
                                do {
                                    self.logger.info("terminal.reconnect.rebind sid=\(sessionId)")
                                    try await relayClient.sendBinaryBind(producerDeviceId: activeId.uuidString, sessionId: sessionId, includeSnapshot: true)
                                } catch {
                                    self.logger.error("Failed to rebind session \(sessionId): \(error)")
                                }
                            }
                        }
                    }
                }
            }
    }

    deinit {
        self.eventSubscriptions.values.forEach { $0.cancel() }
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

        var params: [String: Any] = [:]
        if jobId.hasPrefix("task-terminal-") == false {
            params["jobId"] = jobId
        }
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

            let session = TerminalSession(
                id: sessionId,
                jobId: jobId,
                deviceId: deviceId,
                createdAt: Date(),
                isActive: true,
                workingDirectory: data["workingDirectory"] as? String ?? "~",
                shell: data["shell"] as? String ?? "default"
            )

            self.activeSessions[sessionId] = session
            self.jobToSessionId[jobId] = sessionId

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

            // Subscribe to terminal output events for this session
            self.subscribeToSessionOutput(sessionId: sessionId, deviceId: deviceId)

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
    public func write(jobId: String, data: String) async throws {
        guard let textData = data.data(using: .utf8) else {
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
    public func sendLargeText(jobId: String, text: String, appendCarriageReturn: Bool = true, chunkSize: Int = 4096) async throws {
        guard !text.isEmpty else { return }

        let session = try await self.ensureSession(jobId: jobId, autostartIfNeeded: true)

        let finalText = appendCarriageReturn ? text + "\n" : text
        let data = Data(finalText.utf8)

        var offset = 0
        while offset < data.count {
            let endIndex = min(offset + chunkSize, data.count)
            let chunk = data[offset..<endIndex]

            try await self.writeViaRelay(session: session, data: Data(chunk))

            offset = endIndex
            await Task.yield()
        }
    }


    private func writeViaRelay(session: TerminalSession, data: String) async throws {
        do {
            for try await response in CommandRouter.terminalWrite(sessionId: session.id, text: data) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }
                if response.isFinal {
                    break
                }
            }
        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    private func writeViaRelay(session: TerminalSession, data: Data) async throws {
        if let binding = self.bindingStore.getByTerminalSessionId(session.id) {
            self.logger.info("terminal.write sessionId=\(session.id) appSessionId=\(binding.appSessionId) contextType=\(binding.contextType.rawValue) jobId=\(binding.jobId ?? "nil") bytes=\(data.count)")
        }

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
                    break
                }
            }
        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Resize terminal window
    public func resize(jobId: String, cols: Int, rows: Int) async throws {
        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)

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

            // Trigger first-resize binding with delay to allow layout to stabilize
            let sessionId = session.id
            if !firstResizeCompleted.contains(sessionId) && cols > 10 && rows > 5 {
                firstResizeCompleted.insert(sessionId)

                // Delay binding to ensure terminal layout is fully stable
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 300_000_000) // 300ms
                    self.attachLiveBinary(for: jobId, includeSnapshot: true)
                }
            }
        } catch {
            self.lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Kill a terminal session
    public func kill(jobId: String) async throws {
        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: false)

        do {
            for try await response in CommandRouter.terminalKill(sessionId: session.id) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }
                if response.isFinal {
                    break
                }
            }

            // Update session state
            activeSessions[session.id]?.isActive = false

            self.logger.info("Terminal session killed: \(session.id)")

            // Finalize binding cleanup
            finalizeBinding(sessionId: session.id)

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
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            self.logger.warning("Cannot attach: no session for job \(jobId)")
            return
        }

        let sessionId = session.id

        if let pending = pendingUnbindTasks.removeValue(forKey: sessionId) {
            pending.cancel()
            self.logger.info("Cancelled deferred unbind for session \(sessionId)")
        }

        // Increment ref count
        bindingRefCount[sessionId, default: 0] += 1

        // If already bound OR multiple attach calls, skip binding
        if boundSessions.contains(sessionId) || bindingRefCount[sessionId]! > 1 {
            self.logger.info("Already bound to session \(sessionId)")
            return
        }

        // Ensure publishers and ring exist BEFORE binding
        _ = ensureBytesPublisher(for: sessionId)
        if outputRings[sessionId] == nil {
            outputRings[sessionId] = ByteRing(maxBytes: 2_000_000)
        }

        // Bind to this session (enforces single active bind)
        bindBinary(to: sessionId, includeSnapshot: includeSnapshot)
        boundSessions.insert(sessionId)

        self.logger.info("Attached binary stream for session \(sessionId) with includeSnapshot=\(includeSnapshot)")
    }

    private func bindBinary(to sessionId: String, includeSnapshot: Bool) {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            self.logger.warning("Cannot bind: no active relay connection")
            return
        }

        // Don't send unbind - let the new bind overwrite the old route on server
        // Sending unbind here causes a race where it clears ALL routes, including the new one being established
        if let current = currentBoundSessionId, current != sessionId {
            self.logger.info("Switching bind from session \(current) to \(sessionId) - server will overwrite route")
        }

        // Set new binding
        currentBoundSessionId = sessionId
        ensureGlobalBinarySubscription(relayClient: relayClient, deviceId: deviceId)

        // Send binary bind synchronously  to ensure it's sent before returning
        Task {
            do {
                try await relayClient.sendBinaryBind(producerDeviceId: deviceId.uuidString, sessionId: sessionId, includeSnapshot: includeSnapshot)
            } catch {
                self.logger.error("Failed to send binary bind: \(error)")
            }
        }
        self.logger.info("Bound binary stream to session: \(sessionId)")
    }

    private func ensureGlobalBinarySubscription(relayClient: ServerRelayClient, deviceId: UUID) {
        if let currentId = binarySubscriptionDeviceId,
           currentId == deviceId,
           globalBinarySubscription != nil,
           isGlobalBinarySubscribed {
            return
        }

        let shouldEstablish = binarySubscriptionQueue.sync { () -> Bool in
            if isGlobalBinarySubscribed, binarySubscriptionDeviceId == deviceId {
                return false
            }
            if binarySubscriptionDeviceId != nil, binarySubscriptionDeviceId != deviceId {
                globalBinarySubscription?.cancel()
                globalBinarySubscription = nil
                isGlobalBinarySubscribed = false
            }
            isGlobalBinarySubscribed = true
            binarySubscriptionDeviceId = deviceId
            return true
        }

        guard shouldEstablish else { return }

        globalBinarySubscription = relayClient.terminalBytes
            .receive(on: DispatchQueue.main)
            .sink { [weak self] evt in
                guard let self = self else { return }

                let sid = evt.sessionId ?? self.currentBoundSessionId
                guard let sid = sid else {
                    self.logger.debug("Dropping binary bytes: no sessionId in event or binding")
                    return
                }

                if self.outputRings[sid] == nil {
                    self.outputRings[sid] = ByteRing(maxBytes: 2_000_000)
                }
                self.outputRings[sid]!.append(evt.data)

                let pub = self.outputBytesPublishers[sid] ?? self.ensureBytesPublisher(for: sid)
                pub.send(evt.data)

                self.lastActivityBySession[sid] = Date()

                if let decoded = String(data: evt.data, encoding: .utf8),
                   let textPublisher = self.outputPublishers[sid] {
                    let output = TerminalOutput(
                        sessionId: sid,
                        data: decoded,
                        timestamp: evt.timestamp,
                        outputType: .stdout
                    )
                    textPublisher.send(output)
                }
            }

        self.logger.info("Global binary subscription established for device \(deviceId)")
    }

    private func ensureGlobalBinarySubscriptionForActiveDevice() {
        // Resolve active device/relay from MultiConnectionManager
        guard let activeDeviceId = connectionManager.activeDeviceId,
              let activeRelay = connectionManager.relayConnection(for: activeDeviceId) else {
            return
        }

        if let currentId = binarySubscriptionDeviceId,
           currentId == activeDeviceId,
           globalBinarySubscription != nil,
           isGlobalBinarySubscribed {
            return
        }

        ensureGlobalBinarySubscription(relayClient: activeRelay, deviceId: activeDeviceId)
    }

    // Binding is session-scoped and persists until finalizeBinding(sessionId:) runs on real teardown (exit/kill).
    // View detachment MUST NOT alter binding state or send unbind. Only decrement local refcount for diagnostics.
    public func detachLiveBinary(for jobId: String) {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            return
        }

        let sessionId = session.id

        // Decrement ref count
        let updatedCount = max(0, bindingRefCount[sessionId, default: 0] - 1)
        if updatedCount == 0 {
            bindingRefCount.removeValue(forKey: sessionId)
        } else {
            bindingRefCount[sessionId] = updatedCount
        }

        // DO NOT unbind - binding lifecycle is managed by finalizeBinding
        self.logger.info("Detached binary stream for session \(sessionId), refCount=\(self.bindingRefCount[sessionId, default: 0])")
    }

    /// Finalize binding cleanup - called when a session exits or is killed
    private func finalizeBinding(sessionId: String) {
        if let pending = pendingUnbindTasks.removeValue(forKey: sessionId) {
            pending.cancel()
        }

        // Clear all binding state at the top of the function
        boundSessions.remove(sessionId)
        bindingRefCount.removeValue(forKey: sessionId)
        firstResizeCompleted.remove(sessionId)
        if currentBoundSessionId == sessionId {
            currentBoundSessionId = nil
        }

        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return
        }

        let task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_000_000_000) // Allow rebinding to occur first
            await MainActor.run {
                guard let self else { return }

                if self.boundSessions.contains(sessionId) || self.bindingRefCount[sessionId] != nil {
                    self.logger.info("Deferred unbind skipped for session \(sessionId) - session rebound before timeout")
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
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
        }

        do {
            var logEntries: [[String: Any]]?

            for try await response in CommandRouter.terminalGetLog(sessionId: session.id, maxLines: 1000) {
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
                    sessionId: session.id,
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

                let session = rebuildSessionFromMetadata(
                    sessionId: sessionId,
                    jobId: sessionId,
                    deviceId: deviceId,
                    metadata: metadata
                )
                activeSessions[sessionId] = session
                jobToSessionId[sessionId] = sessionId

                self.logger.info("Bootstrapped session: \(sessionId)")
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
        isGlobalBinarySubscribed = false

        eventSubscriptions.values.forEach { $0.cancel() }
        eventSubscriptions.removeAll()

        activeSessions.removeAll()
        jobToSessionId.removeAll()

        outputPublishers.removeAll()
        outputBytesPublishers.removeAll()
        outputRings.removeAll()

        boundSessions.removeAll()
        bindingRefCount.removeAll()
        currentBoundSessionId = nil

        pendingUnbindTasks.values.forEach { $0.cancel() }
        pendingUnbindTasks.removeAll()

        lastActivityBySession.removeAll()
        firstResizeCompleted.removeAll()
        recentSentChunks.removeAll()

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

        subscribeToSessionOutputIfNeeded(sessionId: sessionId, deviceId: deviceId)

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

                if status == "restored" && autostartIfNeeded {
                    // Check for existing binding or create default context for autostart
                    let context: TerminalContextBinding
                    if let existingBinding = bindingStore.getByJobId(jobId) {
                        context = TerminalContextBinding(
                            appSessionId: existingBinding.appSessionId,
                            contextType: existingBinding.contextType,
                            jobId: existingBinding.jobId
                        )
                    } else {
                        // Default context for autostart recovery
                        context = TerminalContextBinding(
                            appSessionId: "",
                            contextType: .implementationPlan,
                            jobId: jobId
                        )
                    }
                    _ = try await startSession(jobId: jobId, shell: shell, context: context)
                }

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
                self.activeSessions[sid]?.isActive = false

                // Finalize binding on exit
                self.finalizeBinding(sessionId: sid)

                return TerminalOutput(sessionId: sid, data: line, timestamp: Date(), outputType: .system)
            }
            .sink { output in
                outputSubject.send(output)
            }

        eventSubscriptions[sessionId] = exitSubscription
    }

    private func parseTerminalOutput(from event: [String: Any], sessionId: String) -> TerminalOutput? {
        guard let sid = event["sessionId"] as? String, sid == sessionId else {
            return nil
        }

        // Terminal data is base64-encoded by desktop; fallback to raw string for compatibility
        guard let dataB64 = event["data"] as? String else { return nil }
        let decodedData: String
        if let decodedBytes = Data(base64Encoded: dataB64),
           let decoded = String(data: decodedBytes, encoding: .utf8) {
            decodedData = decoded
        } else {
            decodedData = dataB64
        }

        let ts = event["timestamp"] as? Double ?? Date().timeIntervalSince1970
        let typeStr = event["type"] as? String ?? "stdout"
        let type: TerminalOutputType = TerminalOutputType(rawValue: typeStr) ?? .stdout

        return TerminalOutput(
            sessionId: sid,
            data: decodedData,
            timestamp: Date(timeIntervalSince1970: ts),
            outputType: type
        )
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
