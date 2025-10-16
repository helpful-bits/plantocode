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
        storage.append(data)
        if storage.count > maxBytes {
            let overflow = storage.count - maxBytes
            storage.removeFirst(overflow)
        }
    }

    func snapshot() -> Data {
        return storage
    }

    var isEmpty: Bool {
        return storage.isEmpty
    }
}

/// Service for managing terminal sessions via RPC calls to connected desktop devices
@MainActor
public class TerminalDataService: ObservableObject {
    private let logger = Logger(subsystem: "VibeManager", category: "TerminalDataService")

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

    // MARK: - Initialization
    public init() {
        setupEventSubscriptions()

        connectionStateCancellable = MultiConnectionManager.shared.$connectionStates
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

        activeDeviceReconnectCancellable = MultiConnectionManager.shared.$connectionStates
            .sink { [weak self] (states: [UUID: ConnectionState]) in
                guard let self = self else { return }
                guard let activeId = self.connectionManager.activeDeviceId else { return }

                if case .connected = states[activeId] {
                    Task { @MainActor in
                        for sessionId in self.boundSessions {
                            if let relayClient = self.connectionManager.relayConnection(for: activeId),
                               relayClient.isConnected {
                                // Note: includeSnapshot parameter will be added to sendBinaryBind in Step 2
                                relayClient.sendBinaryBind(producerDeviceId: activeId.uuidString)
                                self.logger.info("Rebound session \(sessionId) after reconnect")
                            }
                        }
                    }
                }
            }
    }

    deinit {
        eventSubscriptions.values.forEach { $0.cancel() }
    }

    // MARK: - Terminal Session Management

    /// Start a new terminal session for the given job
    public func startSession(jobId: String, shell: String? = nil) async throws -> TerminalSession {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            throw DataServiceError.connectionError("No active device connection")
        }

        isLoading = true
        defer { isLoading = false }

        var params: [String: Any] = ["jobId": jobId]

        // Use provided shell or fetch default from settings
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

            activeSessions[sessionId] = session
            jobToSessionId[jobId] = sessionId

            // Subscribe to terminal output events for this session
            subscribeToSessionOutput(sessionId: sessionId, deviceId: deviceId)

            // Check for initialLog in response and hydrate
            if let initialLog = data["initialLog"] as? [[String: Any]], !initialLog.isEmpty {
                if let publisher = outputPublishers[sessionId] {
                    for entry in initialLog {
                        if let output = parseTerminalOutputFromEntry(entry, sessionId: sessionId) {
                            publisher.send(output)
                        }
                    }
                }
            }

            logger.info("Terminal session started: \(sessionId) for job \(jobId)")
            return session

        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
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
        if let existingSession = activeSessions.values.first(where: { $0.jobId == jobId }),
           outputPublishers[existingSession.id] != nil {
            try await writeViaRelay(session: existingSession, data: data)
            return
        }

        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)
        try await writeViaRelay(session: session, data: data)
    }

    /// Send large text to terminal in chunks to avoid overwhelming the PTY
    public func sendLargeText(jobId: String, text: String, appendCarriageReturn: Bool = true, chunkSize: Int = 4096) async throws {
        guard !text.isEmpty else { return }

        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)

        let finalText = appendCarriageReturn ? text + "\n" : text
        let data = Data(finalText.utf8)

        var offset = 0
        while offset < data.count {
            let endIndex = min(offset + chunkSize, data.count)
            let chunk = data[offset..<endIndex]

            try await writeViaRelay(session: session, data: Data(chunk))

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
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    private func writeViaRelay(session: TerminalSession, data: Data) async throws {
        guard connectionManager.activeDeviceId != nil,
              connectionManager.relayConnection(for: session.deviceId) != nil else {
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
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Resize terminal window
    public func resize(jobId: String, cols: Int, rows: Int) async throws {
        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)

        do {
            for try await response in CommandRouter.terminalResize(sessionId: session.id, cols: cols, rows: rows) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }
                if response.isFinal {
                    break
                }
            }
        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
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

            logger.info("Terminal session killed: \(session.id)")

            // Clean up subscriptions and publishers
            eventSubscriptions[session.id]?.cancel()
            eventSubscriptions.removeValue(forKey: session.id)
            outputPublishers.removeValue(forKey: session.id)
            lastActivityBySession.removeValue(forKey: session.id)
            activeSessions.removeValue(forKey: session.id)

        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
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

        logger.info("Terminal session detached: \(session.id) for job \(jobId)")
    }


    /// Detach via relay
    private func detachViaRelay(session: TerminalSession) async throws {
        detachLiveBinary(for: session.jobId)

        // Send unbind control message
        if let relayClient = connectionManager.relayConnection(for: session.deviceId) {
            relayClient.sendBinaryUnbind()
        }

        do {
            for try await response in CommandRouter.terminalDetach(sessionId: session.id) {
                if let error = response.error {
                    // Log but don't throw for detach errors - it's a cleanup operation
                    logger.warning("Terminal detach error (non-fatal): \(error)")
                }
                if response.isFinal {
                    break
                }
            }
        } catch {
            // Don't propagate detach errors - log and continue
            logger.warning("Terminal detach failed (non-fatal): \(error)")
        }
    }

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
            logger.warning("Cannot attach: no session for job \(jobId)")
            return
        }

        let sessionId = session.id

        // Already bound
        if boundSessions.contains(sessionId) {
            logger.debug("Session \(sessionId) already bound")
            return
        }

        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            logger.warning("Cannot attach: no active relay connection")
            return
        }

        // CRITICAL ORDER: Ensure publishers and ring exist BEFORE binding
        _ = ensureBytesPublisher(for: sessionId)
        if outputRings[sessionId] == nil {
            outputRings[sessionId] = ByteRing(maxBytes: 2_000_000)
        }

        // Now safe to bind - incoming frames have a destination
        // Note: ServerRelayClient.sendBinaryBind will be updated to accept includeSnapshot in Step 2
        relayClient.sendBinaryBind(producerDeviceId: deviceId.uuidString, includeSnapshot: includeSnapshot)
        boundSessions.insert(sessionId)

        logger.info("Attached binary stream for session \(sessionId) with includeSnapshot=\(includeSnapshot)")
    }

    /// Detach from live binary terminal output.
    ///
    /// This sends terminal.binary.unbind but keeps the ring buffer and publishers intact.
    /// This allows instant re-attachment without losing historical output.
    ///
    /// Call this when dismissing the terminal view to free server resources.
    ///
    /// - Parameter jobId: The terminal job ID
    public func detachLiveBinary(for jobId: String) {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            return
        }

        let sessionId = session.id

        guard boundSessions.contains(sessionId) else {
            return
        }

        if let deviceId = connectionManager.activeDeviceId,
           let relayClient = connectionManager.relayConnection(for: deviceId) {
            relayClient.sendBinaryUnbind()
        }

        boundSessions.remove(sessionId)

        logger.info("Detached binary stream for session \(sessionId)")
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
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    public func bootstrapFromRemote() async {
        guard let deviceId = connectionManager.activeDeviceId,
              connectionManager.relayConnection(for: deviceId) != nil else {
            return
        }

        do {
            var sessionIds: [String] = []
            for try await response in CommandRouter.terminalGetActiveSessions() {
                if let error = response.error {
                    logger.warning("Failed to get active sessions: \(error)")
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
                    logger.warning("Failed to get metadata for \(sessionId): \(error)")
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

                logger.info("Bootstrapped session: \(sessionId)")
            }
        } catch {
            logger.warning("Bootstrap failed: \(error)")
        }
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
            logger.warning("Failed to get status for \(sessionId), will try to start: \(error)")
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
                    logger.warning("Failed to get metadata: \(error)")
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
                    _ = try await startSession(jobId: jobId, shell: shell)
                }

                return session
            }
        }

        if autostartIfNeeded {
            return try await startSession(jobId: jobId, shell: shell)
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

        // Bind is now controlled by attachLiveBinary - don't bind here

        let outputSubject = PassthroughSubject<TerminalOutput, Never>()
        outputPublishers[sessionId] = outputSubject

        let bytesSubject = ensureBytesPublisher(for: sessionId)

        // Subscribe to raw binary frames
        let binarySubscription = relayClient.terminalBytes
            .sink { [weak self] evt in
                guard let self = self else { return }

                // Store into ring buffer (persistent across subscriptions)
                self.outputRings[sessionId, default: ByteRing(maxBytes: 2_000_000)].append(evt.data)

                self.lastActivityBySession[sessionId] = Date()
                // Forward raw bytes to bytes publisher (always show remote output)
                bytesSubject.send(evt.data)

                // Also decode to text for text-based output publisher (backward compat)
                if let decoded = String(data: evt.data, encoding: .utf8) {
                    let output = TerminalOutput(
                        sessionId: sessionId,
                        data: decoded,
                        timestamp: evt.timestamp,
                        outputType: .stdout
                    )
                    outputSubject.send(output)
                }
            }

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

                // Send unbind on exit
                relayClient.sendBinaryUnbind()

                return TerminalOutput(sessionId: sid, data: line, timestamp: Date(), outputType: .system)
            }
            .sink { output in
                outputSubject.send(output)
            }

        // Store both subscriptions
        let combinedSubscription = AnyCancellable {
            binarySubscription.cancel()
            exitSubscription.cancel()
        }
        eventSubscriptions[sessionId] = combinedSubscription
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