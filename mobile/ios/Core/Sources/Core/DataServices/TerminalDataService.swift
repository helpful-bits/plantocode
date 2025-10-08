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

    /// Resize terminal window
    public func resize(jobId: String, cols: Int, rows: Int) async throws {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId && $0.isActive }) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
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
        } catch {
            lastError = error as? DataServiceError ?? DataServiceError.networkError(error)
            throw error
        }
    }

    /// Kill a terminal session
    public func kill(jobId: String) async throws {
        guard let session = activeSessions.values.first(where: { $0.jobId == jobId }) else {
            throw DataServiceError.invalidState("No active session for job \(jobId)")
        }

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

    // MARK: - Private Methods

    private func setupEventSubscriptions() {
        // This would subscribe to global terminal events if needed
        // For now, we subscribe to specific session outputs when sessions are created
    }

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