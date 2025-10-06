import Foundation
import Combine

@MainActor
public final class SessionDataService: ObservableObject {
    @Published public private(set) var currentSessionId: String?
    @Published public var sessions: [Session] = []
    @Published public var currentSession: Session?
    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    private let offlineQueue = OfflineActionQueue()

    public init() {
        self.currentSessionId = "mobile-session-\(UUID().uuidString)"
    }

    @discardableResult
    public func ensureSession() -> String {
        if let id = currentSessionId { return id }
        let id = "mobile-session-\(UUID().uuidString)"
        currentSessionId = id
        return id
    }

    @discardableResult
    public func newSession() -> String {
        let id = "mobile-session-\(UUID().uuidString)"
        currentSessionId = id
        return id
    }

    public func fetchSessions(projectDirectory: String) async throws -> [Session] {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionList(projectDirectory: projectDirectory)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value {
                    // Try to parse as wrapped response first, then fall back to raw array
                    var sessionsArray: [[String: Any]]?
                    if let dict = value as? [String: Any], let arr = dict["sessions"] as? [[String: Any]] {
                        sessionsArray = arr
                    } else if let arr = value as? [[String: Any]] {
                        sessionsArray = arr
                    }

                    guard let items = sessionsArray else {
                        await MainActor.run {
                            self.isLoading = false
                        }
                        throw DataServiceError.invalidResponse("Expected sessions array")
                    }

                    let sessionList = items.compactMap { dict -> Session? in
                        guard let id = dict["id"] as? String,
                              let name = dict["name"] as? String,
                              let projectDirectory = dict["projectDirectory"] as? String,
                              let createdAt = dict["createdAt"] as? Int64,
                              let updatedAt = dict["updatedAt"] as? Int64 else {
                            return nil
                        }

                        return Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: dict["taskDescription"] as? String,
                            createdAt: createdAt,
                            updatedAt: updatedAt,
                            includedFiles: dict["includedFiles"] as? [String] ?? [],
                            forceExcludedFiles: dict["forceExcludedFiles"] as? [String] ?? []
                        )
                    }

                    await MainActor.run {
                        self.sessions = sessionList
                        self.isLoading = false
                    }
                    let cacheKey = "sessions_\(projectDirectory.replacingOccurrences(of: "/", with: "_"))"
                    CacheManager.shared.set(sessionList, forKey: cacheKey, ttl: 300)
                    return sessionList
                }

                if response.isFinal == true {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    return []
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            return sessions
        } catch {
            let cacheKey = "sessions_\(projectDirectory.replacingOccurrences(of: "/", with: "_"))"
            if let cached: [Session] = CacheManager.shared.get(key: cacheKey) {
                await MainActor.run {
                    self.sessions = cached
                    self.isLoading = false
                }
                return cached
            }
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func getSession(id: String) async throws -> Session? {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionGet(id: id)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped session or use raw response
                    let sessionDict = (value["session"] as? [String: Any]) ?? value

                    if let id = sessionDict["id"] as? String,
                       let name = sessionDict["name"] as? String,
                       let projectDirectory = sessionDict["projectDirectory"] as? String,
                       let createdAt = sessionDict["createdAt"] as? Int64,
                       let updatedAt = sessionDict["updatedAt"] as? Int64 {

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            createdAt: createdAt,
                            updatedAt: updatedAt,
                            includedFiles: sessionDict["includedFiles"] as? [String] ?? [],
                            forceExcludedFiles: sessionDict["forceExcludedFiles"] as? [String] ?? []
                        )

                        await MainActor.run {
                            self.currentSession = session
                            self.isLoading = false
                        }
                        return session
                    }
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            return nil
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func createSession(name: String, projectDirectory: String, taskDescription: String?) async throws -> Session {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionCreate(
                name: name,
                projectDirectory: projectDirectory,
                taskDescription: taskDescription
            )

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped session or use raw response
                    let sessionDict = (value["session"] as? [String: Any]) ?? value

                    if let id = sessionDict["id"] as? String,
                       let name = sessionDict["name"] as? String,
                       let projectDirectory = sessionDict["projectDirectory"] as? String,
                       let createdAt = sessionDict["createdAt"] as? Int64,
                       let updatedAt = sessionDict["updatedAt"] as? Int64 {

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            createdAt: createdAt,
                            updatedAt: updatedAt,
                            includedFiles: sessionDict["includedFiles"] as? [String] ?? [],
                            forceExcludedFiles: sessionDict["forceExcludedFiles"] as? [String] ?? []
                        )

                        await MainActor.run {
                            self.currentSession = session
                            self.currentSessionId = session.id
                            // Add to sessions list if not already present
                            if !self.sessions.contains(where: { $0.id == session.id }) {
                                self.sessions.append(session)
                            }
                            self.isLoading = false
                        }
                        return session
                    }
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No session data received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func updateSession(id: String, updates: [String: Any]) async throws {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionUpdate(id: id, updates: updates)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped session or use raw response
                    let sessionDict = (value["session"] as? [String: Any]) ?? value

                    if let id = sessionDict["id"] as? String,
                       let name = sessionDict["name"] as? String,
                       let projectDirectory = sessionDict["projectDirectory"] as? String,
                       let createdAt = sessionDict["createdAt"] as? Int64,
                       let updatedAt = sessionDict["updatedAt"] as? Int64 {

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            createdAt: createdAt,
                            updatedAt: updatedAt,
                            includedFiles: sessionDict["includedFiles"] as? [String] ?? [],
                            forceExcludedFiles: sessionDict["forceExcludedFiles"] as? [String] ?? []
                        )

                        await MainActor.run {
                            // Update current session if it's the same
                            if self.currentSession?.id == session.id {
                                self.currentSession = session
                            }
                            // Update in sessions list
                            if let index = self.sessions.firstIndex(where: { $0.id == session.id }) {
                                self.sessions[index] = session
                            }
                            self.isLoading = false
                        }
                        return
                    }
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func deleteSession(id: String) async throws {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionDelete(id: id)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                // Deletion typically returns success without data
                if response.result != nil || response.isFinal {
                    await MainActor.run {
                        // Remove from sessions list
                        self.sessions.removeAll { $0.id == id }
                        // Clear current session if it was deleted
                        if self.currentSession?.id == id {
                            self.currentSession = nil
                        }
                        if self.currentSessionId == id {
                            self.currentSessionId = nil
                        }
                        self.isLoading = false
                    }
                    return
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func duplicateSession(id: String, newName: String?) async throws -> Session {
        guard MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId ?? UUID()) != nil else {
            let action = QueuedAction(type: .duplicateSession(sourceSessionId: id, newName: newName))
            offlineQueue.enqueue(action)
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionDuplicate(sourceSessionId: id, newName: newName)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped session or use raw response
                    let sessionDict = (value["session"] as? [String: Any]) ?? value

                    if let id = sessionDict["id"] as? String,
                       let name = sessionDict["name"] as? String,
                       let projectDirectory = sessionDict["projectDirectory"] as? String,
                       let createdAt = sessionDict["createdAt"] as? Int64,
                       let updatedAt = sessionDict["updatedAt"] as? Int64 {

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            createdAt: createdAt,
                            updatedAt: updatedAt,
                            includedFiles: sessionDict["includedFiles"] as? [String] ?? [],
                            forceExcludedFiles: sessionDict["forceExcludedFiles"] as? [String] ?? []
                        )

                        await MainActor.run {
                            self.sessions.append(session)
                            self.isLoading = false
                        }
                        return session
                    }
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No session data received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func getTaskDescriptionHistory(sessionId: String) async throws -> [String] {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionGetTaskDescriptionHistory(sessionId: sessionId)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let result = response.result?.value as? [String: Any],
                   let history = result["history"] as? [String] {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    return history
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            return []
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func syncTaskDescriptionHistory(sessionId: String, history: [String]) async throws {
        guard MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId ?? UUID()) != nil else {
            let action = QueuedAction(type: .syncTaskHistory(sessionId: sessionId, history: history))
            offlineQueue.enqueue(action)
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionSyncTaskDescriptionHistory(sessionId: sessionId, history: history)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if response.result != nil || response.isFinal {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    return
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func updateSessionFiles(sessionId: String, addIncluded: [String]?, removeIncluded: [String]?, addExcluded: [String]?, removeExcluded: [String]?) async throws -> Session {
        guard MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId ?? UUID()) != nil else {
            let action = QueuedAction(type: .updateFiles(sessionId: sessionId, addIncluded: addIncluded, removeIncluded: removeIncluded, addExcluded: addExcluded, removeExcluded: removeExcluded))
            offlineQueue.enqueue(action)
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionUpdateFiles(id: sessionId, addIncluded: addIncluded, removeIncluded: removeIncluded, addExcluded: addExcluded, removeExcluded: removeExcluded)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped session or use raw response
                    let sessionDict = (value["session"] as? [String: Any]) ?? value

                    if let id = sessionDict["id"] as? String,
                       let name = sessionDict["name"] as? String,
                       let projectDirectory = sessionDict["projectDirectory"] as? String,
                       let createdAt = sessionDict["createdAt"] as? Int64,
                       let updatedAt = sessionDict["updatedAt"] as? Int64 {

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            createdAt: createdAt,
                            updatedAt: updatedAt,
                            includedFiles: sessionDict["includedFiles"] as? [String] ?? [],
                            forceExcludedFiles: sessionDict["forceExcludedFiles"] as? [String] ?? []
                        )

                        await MainActor.run {
                            if self.currentSession?.id == session.id {
                                self.currentSession = session
                            }
                            if let index = self.sessions.firstIndex(where: { $0.id == session.id }) {
                                self.sessions[index] = session
                            }
                            self.isLoading = false
                        }
                        return session
                    }
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No session data received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func getFileRelationships(sessionId: String) async throws -> [String: Any] {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionGetFileRelationships(sessionId: sessionId)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped relationships or use raw response
                    let relationships = (value["relationships"] as? [String: Any]) ?? value

                    await MainActor.run {
                        self.isLoading = false
                    }
                    return relationships
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No file relationships data received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func fetchSessionOverview(id: String) async throws -> [String: Any] {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionGetOverview(sessionId: id)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped overview or use raw response
                    let overview = (value["overview"] as? [String: Any]) ?? value

                    await MainActor.run {
                        self.isLoading = false
                    }
                    return overview
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No overview data received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func fetchSessionContents(id: String) async throws -> [String: Any] {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionGetContents(sessionId: id)

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let value = response.result?.value as? [String: Any] {
                    // Try to extract wrapped contents or use raw response
                    let contents = (value["contents"] as? [String: Any]) ?? value

                    await MainActor.run {
                        self.isLoading = false
                    }
                    return contents
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No contents data received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func updateTaskDescription(sessionId: String, content: String) async throws {
        guard MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId ?? UUID()) != nil else {
            let action = QueuedAction(type: .updateTaskDescription(sessionId: sessionId, content: content))
            offlineQueue.enqueue(action)
            throw DataServiceError.offline
        }

        try await updateSession(id: sessionId, updates: ["taskDescription": content])

        if let currentHistory = try? await getTaskDescriptionHistory(sessionId: sessionId) {
            var updatedHistory = currentHistory
            updatedHistory.append(content)
            try await syncTaskDescriptionHistory(sessionId: sessionId, history: updatedHistory)
        }
    }

    public func enhanceAndUpdateTaskDescription(sessionId: String, content: String) async throws {
        guard MultiConnectionManager.shared.relayConnection(for: MultiConnectionManager.shared.activeDeviceId ?? UUID()) != nil else {
            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.textEnhance(text: content, context: "task description")

            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let result = response.result?.value as? [String: Any],
                   let enhancedText = result["enhancedText"] as? String {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    try await updateTaskDescription(sessionId: sessionId, content: enhancedText)
                    return
                }
            }

            await MainActor.run {
                self.isLoading = false
            }
            throw DataServiceError.invalidResponse("No enhanced text received")
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

    public func processOfflineQueue() async {
        await offlineQueue.processPending(with: self)
    }
}