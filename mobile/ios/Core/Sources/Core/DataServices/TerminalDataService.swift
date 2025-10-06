import Foundation
import Combine
import OSLog
#if canImport(UIKit)
import UIKit
#endif

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

    // MARK: - Initialization
    public init() {
        setupEventSubscriptions()
    }

    deinit {
        eventSubscriptions.values.forEach { $0.cancel() }
    }

    // MARK: - Terminal Session Management

    /// Open a new terminal session with command and working directory
    public func openSession(command: String? = nil, cwd: String? = nil) -> AsyncThrowingStream<String, Error> {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "terminal.open",
                        params: [
                            "command": AnyCodable(command),
                            "cwd": AnyCodable(cwd)
                        ]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error \(error.code): \(error.message)"))
                            return
                        }

                        if let result = response.result?.value as? [String: Any],
                           let output = result["output"] as? String {
                            continuation.yield(output)
                        }

                        if response.isFinal {
                            continuation.finish()
                            return
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Write input to a terminal session
    public func write(sessionId: String, input: String) -> AsyncThrowingStream<String, Error> {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "terminal.write",
                        params: [
                            "sessionId": AnyCodable(sessionId),
                            "input": AnyCodable(input)
                        ]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error \(error.code): \(error.message)"))
                            return
                        }

                        if let result = response.result?.value as? [String: Any],
                           let output = result["output"] as? String {
                            continuation.yield(output)
                        }

                        if response.isFinal {
                            continuation.finish()
                            return
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Close a terminal session
    public func close(sessionId: String) async throws {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            throw DataServiceError.connectionError("No active device connection")
        }

        let request = RpcRequest(
            method: "terminal.close",
            params: [
                "sessionId": AnyCodable(sessionId)
            ]
        )

        for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
            if let error = response.error {
                throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
            }
            if response.isFinal {
                break
            }
        }
    }

    /// Execute a command with streaming output (convenience method)
    public func execute(command: String, cwd: String? = nil) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    var sessionId: String?

                    for try await output in openSession(command: command, cwd: cwd) {
                        if sessionId == nil, let result = parseSessionId(from: output) {
                            sessionId = result
                        }
                        continuation.yield(output)
                    }

                    if let sid = sessionId {
                        try await close(sessionId: sid)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Start a new terminal session for the given job
    public func startSession(jobId: String) async throws -> TerminalSession {
        guard let deviceId = connectionManager.activeDeviceId,
              let relayClient = connectionManager.relayConnection(for: deviceId) else {
            throw DataServiceError.connectionError("No active device connection")
        }

        isLoading = true
        defer { isLoading = false }

        let request = RpcRequest(
            method: "terminal.start",
            params: [
                "jobId": AnyCodable(jobId),
                "shell": AnyCodable("default"),
                "workingDirectory": AnyCodable(NSNull())
            ]
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

            // Subscribe to terminal output events for this session
            subscribeToSessionOutput(sessionId: sessionId, deviceId: deviceId)

            logger.info("Terminal session started: \(sessionId) for job \(jobId)")
            return session

        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Write data to a terminal session
    public func write(jobId: String, data: String) async throws {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId && $0.isActive }) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
        }

        // Route all operations through relay
        try await writeViaRelay(session: session, data: data)
    }


    /// Write via relay with base64 encoding
    private func writeViaRelay(session: TerminalSession, data: String) async throws {
        guard let relayClient = connectionManager.relayConnection(for: session.deviceId) else {
            throw DataServiceError.invalidState("No relay connection for session")
        }

        // Base64-encode the input data
        guard let dataBytes = data.data(using: .utf8) else {
            throw DataServiceError.invalidState("Failed to encode data as UTF-8")
        }
        let base64EncodedData = dataBytes.base64EncodedString()

        let request = RpcRequest(
            method: "terminal.write",
            params: [
                "sessionId": AnyCodable(session.id),
                "data": AnyCodable(base64EncodedData)
            ]
        )

        do {
            for try await response in relayClient.invoke(targetDeviceId: session.deviceId.uuidString, request: request) {
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
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId && $0.isActive }),
              let relayClient = connectionManager.relayConnection(for: session.deviceId) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
        }

        let request = RpcRequest(
            method: "terminal.resize",
            params: [
                "sessionId": AnyCodable(session.id),
                "cols": AnyCodable(cols),
                "rows": AnyCodable(rows)
            ]
        )

        do {
            for try await response in relayClient.invoke(targetDeviceId: session.deviceId.uuidString, request: request) {
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
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }),
              let relayClient = connectionManager.relayConnection(for: session.deviceId) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
        }

        let request = RpcRequest(
            method: "terminal.kill",
            params: [
                "sessionId": AnyCodable(session.id)
            ]
        )

        do {
            for try await response in relayClient.invoke(targetDeviceId: session.deviceId.uuidString, request: request) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }
                if response.isFinal {
                    break
                }
            }

            // Update session state
            activeSessions[session.id]?.isActive = false

            // Clean up subscriptions
            eventSubscriptions[session.id]?.cancel()
            eventSubscriptions.removeValue(forKey: session.id)
            outputPublishers.removeValue(forKey: session.id)

            logger.info("Terminal session killed: \(session.id)")

        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Send Ctrl+C to a terminal session
    public func sendCtrlC(jobId: String) async throws {
        try await write(jobId: jobId, data: "\u{03}") // ASCII ETX (End of Text) - Ctrl+C
    }

    /// Detach from a terminal session (cleanup on view dismiss)
    public func detach(jobId: String) async throws {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            // Already detached or never attached
            return
        }

        // Route all operations through relay
        try await detachViaRelay(session: session)

        // Clean up local session state
        activeSessions.removeValue(forKey: session.id)
        eventSubscriptions[session.id]?.cancel()
        eventSubscriptions.removeValue(forKey: session.id)
        outputPublishers.removeValue(forKey: session.id)

        logger.info("Terminal session detached: \(session.id) for job \(jobId)")
    }


    /// Detach via relay
    private func detachViaRelay(session: TerminalSession) async throws {
        guard let relayClient = connectionManager.relayConnection(for: session.deviceId) else {
            throw DataServiceError.invalidState("No relay connection for session")
        }

        let request = RpcRequest(
            method: "terminal.detach",
            params: [
                "jobId": AnyCodable(session.jobId),
                "clientId": AnyCodable(UIDevice.current.identifierForVendor?.uuidString ?? "unknown")
            ]
        )

        do {
            for try await response in relayClient.invoke(targetDeviceId: session.deviceId.uuidString, request: request) {
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
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }),
              let relayClient = connectionManager.relayConnection(for: session.deviceId) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
        }

        let request = RpcRequest(
            method: "terminal.getLog",
            params: [
                "sessionId": AnyCodable(session.id),
                "maxLines": AnyCodable(1000)
            ]
        )

        do {
            var logEntries: [[String: Any]]?

            for try await response in relayClient.invoke(targetDeviceId: session.deviceId.uuidString, request: request) {
                if let error = response.error {
                    throw DataServiceError.serverError("RPC Error \(error.code): \(error.message)")
                }

                if let result = response.result?.value as? [String: Any],
                   let entries = result["entries"] as? [[String: Any]] {
                    logEntries = entries
                    if response.isFinal {
                        break
                    }
                }
            }

            guard let entries = logEntries else {
                throw DataServiceError.invalidResponse("Invalid log response")
            }

            return entries.compactMap { entry in
                parseTerminalOutput(from: entry, sessionId: session.id)
            }

        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    // MARK: - Private Methods

    private func setupEventSubscriptions() {
        // This would subscribe to global terminal events if needed
        // For now, we subscribe to specific session outputs when sessions are created
    }

    private func subscribeToSessionOutput(sessionId: String, deviceId: UUID) {
        guard let relayClient = connectionManager.relayConnection(for: deviceId) else {
            return
        }

        // Create output publisher for this session
        let outputSubject = PassthroughSubject<TerminalOutput, Never>()
        outputPublishers[sessionId] = outputSubject

        // Subscribe to events from the relay client
        let subscription = relayClient.events
            .filter { event in
                event.eventType == "terminal.output" &&
                (event.data["sessionId"]?.value as? String) == sessionId
            }
            .compactMap { event in
                self.parseTerminalOutput(from: event.data.mapValues { $0.value }, sessionId: sessionId)
            }
            .sink { output in
                outputSubject.send(output)
            }

        eventSubscriptions[sessionId] = subscription
    }

    private func parseTerminalOutput(from event: [String: Any], sessionId: String) -> TerminalOutput? {
        guard
            let payload = event["data"] as? [String: Any],
            let sid = payload["sessionId"] as? String, sid == sessionId,
            let outputData = payload["data"] as? String,
            let ts = payload["timestamp"] as? Double,
            let typeStr = payload["type"] as? String
        else { return nil }

        let type: TerminalOutputType = TerminalOutputType(rawValue: typeStr) ?? .stdout
        return TerminalOutput(sessionId: sid, data: outputData, timestamp: Date(timeIntervalSince1970: ts), outputType: type)
    }

    private func parseSessionId(from output: String) -> String? {
        if let data = output.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
           let sessionId = json["sessionId"] as? String {
            return sessionId
        }
        return nil
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
    func async() async throws -> Output {
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