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
    private var connectionStateCancellable: AnyCancellable?
    private var jobToSessionId: [String: String] = [:]
    private var ensureInFlight: Set<String> = []

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
    }

    deinit {
        eventSubscriptions.values.forEach { $0.cancel() }
    }

    // MARK: - Terminal Session Management

    /// Start a new terminal session for the given job
    public func startSession(jobId: String, workingDirectory: String? = nil, shell: String? = nil) async throws -> TerminalSession {
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

        // Use provided working directory
        if let workingDirectory = workingDirectory {
            params["workingDirectory"] = workingDirectory
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
        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)
        try await writeViaRelay(session: session, data: data)
    }

    /// Send large text to terminal in chunks to avoid overwhelming the PTY
    public func sendLargeText(jobId: String, text: String, appendCarriageReturn: Bool = true, chunkSize: Int = 4096) async throws {
        guard !text.isEmpty else { return }

        let session = try await ensureSession(jobId: jobId, autostartIfNeeded: true)

        let finalText = appendCarriageReturn ? text + "\n" : text
        guard let data = finalText.data(using: .utf8) else {
            throw DataServiceError.invalidState("Failed to encode text as UTF-8")
        }

        // Split into chunks by byte count (not String length) and send sequentially
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

    private func ensureSession(jobId: String, workingDirectory: String? = nil, shell: String? = nil, autostartIfNeeded: Bool = true) async throws -> TerminalSession {
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

                Task {
                    do {
                        let logEntries = try await self.getLog(jobId: jobId)
                        for entry in logEntries {
                            if let publisher = self.outputPublishers[sessionId] {
                                publisher.send(entry)
                            }
                        }
                    } catch {
                        logger.warning("Failed to hydrate log: \(error)")
                    }
                }

                if status == "restored" && autostartIfNeeded {
                    _ = try await startSession(jobId: jobId, workingDirectory: workingDirectory, shell: shell)
                }

                return session
            }
        }

        if autostartIfNeeded {
            return try await startSession(jobId: jobId, workingDirectory: workingDirectory, shell: shell)
        } else {
            throw DataServiceError.invalidState("Session \(jobId) is stopped and autostart disabled")
        }
    }

    /// Subscribes to terminal output events for a session via relay protocol
    ///
    /// Terminal synchronization pattern:
    /// - Listens to "terminal.output" event topic for real-time output streaming
    /// - Listens to "terminal.exit" event topic for session termination
    /// - Events are pushed from desktop via relay server to mobile devices
    /// - Terminal data is Base64 encoded in transit and decoded here
    /// - Supports both stdout and stderr streams with proper type identification
    private func subscribeToSessionOutput(sessionId: String, deviceId: UUID) {
        guard let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return
        }

        let outputSubject = PassthroughSubject<TerminalOutput, Never>()
        outputPublishers[sessionId] = outputSubject

        // Subscribe to terminal.output events
        let outputSubscription = relayClient.events
            .filter { event in
                event.eventType == "terminal.output"
            }
            .compactMap { event in
                self.parseTerminalOutput(from: event.data.mapValues { $0.value }, sessionId: sessionId)
            }
            .sink { output in
                outputSubject.send(output)
            }

        // Subscribe to terminal.exit events
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
                return TerminalOutput(sessionId: sid, data: line, timestamp: Date(), outputType: .system)
            }
            .sink { output in
                outputSubject.send(output)
            }

        // Store both subscriptions
        let combinedSubscription = AnyCancellable {
            outputSubscription.cancel()
            exitSubscription.cancel()
        }
        eventSubscriptions[sessionId] = combinedSubscription
    }

    private func parseTerminalOutput(from event: [String: Any], sessionId: String) -> TerminalOutput? {
        guard let sid = event["sessionId"] as? String, sid == sessionId else {
            return nil
        }

        // Decode base64 data
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