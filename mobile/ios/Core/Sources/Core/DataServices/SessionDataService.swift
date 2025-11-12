import Foundation
import Combine

@MainActor
public final class SessionDataService: ObservableObject {
    @Published public private(set) var currentSessionId: String?
    @Published public var sessions: [Session] = []

    // Custom property with backing store that only publishes when session ID actually changes
    private var _currentSession: Session?
    public let currentSessionPublisher = CurrentValueSubject<Session?, Never>(nil)

    public var currentSession: Session? {
        get { _currentSession }
        set {
            _currentSession = newValue
            currentSessionPublisher.send(newValue)
            objectWillChange.send()
        }
    }

    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    @Published public private(set) var hasLoadedOnce: Bool = false
    private let offlineQueue = OfflineActionQueue()
    private var sessionsIndex: [String: Int] = [:]
    private var sessionsFetchInFlight: [String: Task<[Session], Error>] = [:]
    private var lastSessionsFetch: [String: Date] = [:] // projectDirectory -> timestamp

    private var deviceKey: String {
        MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
    }

    public init() {
        self.currentSessionId = "mobile-session-\(UUID().uuidString)"
        setupHistoryStateListener()
    }

    /// Setup listener for history-state-changed events from relay
    private func setupHistoryStateListener() {
        // Subscribe to relay events
        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("relay-event-history-state-changed"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let event = notification.userInfo?["event"] as? RelayEvent,
                  let sessionId = event.data["sessionId"]?.value as? String,
                  let kind = event.data["kind"]?.value as? String,
                  let stateDict = event.data["state"]?.value as? [String: Any] else {
                return
            }

            // Apply history state change without recording
            Task { @MainActor in
                do {
                    let stateData = try JSONSerialization.data(withJSONObject: stateDict)
                    let historyState = try JSONDecoder().decode(HistoryState.self, from: stateData)

                    if kind == "files" {
                        guard let currentIndex = Int(exactly: historyState.currentIndex),
                              currentIndex >= 0,
                              currentIndex < historyState.entries.count else {
                            return
                        }

                        let currentEntry = historyState.entries[currentIndex]
                        if let entryData = currentEntry.value.data(using: .utf8),
                           let filesState = try? JSONDecoder().decode(FilesHistoryState.self, from: entryData) {
                            self.updateSessionFilesInMemory(
                                sessionId: sessionId,
                                includedFiles: filesState.includedFiles,
                                forceExcludedFiles: filesState.forceExcludedFiles
                            )
                        }
                    }

                    NotificationCenter.default.post(
                        name: NSNotification.Name("apply-history-state"),
                        object: nil,
                        userInfo: [
                            "sessionId": sessionId,
                            "kind": kind,
                            "state": historyState
                        ]
                    )
                } catch {
                    print("Failed to decode history state: \(error)")
                }
            }
        }
    }

    private func normalizeEpochSeconds(_ any: Any?) -> Int64 {
        switch any {
        case let v as Int64: return v > 1_000_000_000_000 ? v / 1000 : v
        case let v as Int:   let i = Int64(v); return i > 1_000_000_000_000 ? i / 1000 : i
        case let v as Double: let i = Int64(v); return i > 1_000_000_000_000 ? i / 1000 : i
        default: return 0
        }
    }

    private func ts(from dict: [String: Any], key: String) -> Int64 {
        return normalizeEpochSeconds(dict[key])
    }

    @discardableResult
    public func ensureSession() -> String {
        if let id = currentSessionId { return id }
        let id = "mobile-session-\(UUID().uuidString)"
        currentSessionId = id
        return id
    }

    /// Reset session state when active device changes
    @MainActor
    public func onActiveDeviceChanged() {
        sessions.removeAll()
        currentSession = nil
        currentSessionId = nil
        hasLoadedOnce = false
        error = nil
        isLoading = false

        // Create a new ephemeral session ID
        _ = newSession()
    }

    public func resetState() {
        Task { @MainActor in
            self.sessions = []
            self.currentSession = nil
            self.currentSessionId = nil
            self.hasLoadedOnce = false
            self.error = nil
            self.isLoading = false
        }
    }

    @discardableResult
    public func newSession() -> String {
        let id = "mobile-session-\(UUID().uuidString)"
        currentSessionId = id
        return id
    }

    @MainActor
    public func setSessions(_ sessions: [Session], activeId: String?) {
        self.sessions = sessions
        self.sessionsIndex = Dictionary(uniqueKeysWithValues: sessions.enumerated().map { ($1.id, $0) })

        if let activeId = activeId, let found = sessions.first(where: { $0.id == activeId }) {
            self.currentSession = found
        } else if let latest = sessions.sorted(by: { ($0.updatedAt) > ($1.updatedAt) }).first {
            self.currentSession = latest
        } else {
            self.currentSession = nil
        }
    }

    public func fetchSessions(projectDirectory: String) async throws -> [Session] {
        // Check if we fetched sessions for this project recently (within 15s)
        if let lastFetch = lastSessionsFetch[projectDirectory],
           Date().timeIntervalSince(lastFetch) < 15.0 {
            // Return cached sessions without network call
            return await MainActor.run { self.sessions }
        }

        // Check if there's already an in-flight request for this project
        if let existing = sessionsFetchInFlight[projectDirectory] {
            return try await existing.value
        }

        // Create new task for this fetch
        let task = Task<[Session], Error> {
            defer {
                Task { @MainActor in
                    self.sessionsFetchInFlight.removeValue(forKey: projectDirectory)
                }
            }

            await MainActor.run {
                self.isLoading = true
                self.error = nil
            }

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
                                  let projectDirectory = dict["projectDirectory"] as? String else {
                                return nil
                            }

                            let createdAt = self.ts(from: dict, key: "createdAt")
                            let updatedAt = self.ts(from: dict, key: "updatedAt")

                            let includedFiles = dict["includedFiles"] as? [String] ?? []
                            let forceExcludedFiles = dict["forceExcludedFiles"] as? [String] ?? []
                            let mergeInstructions = dict["mergeInstructions"] as? String

                            return Session(
                                id: id,
                                name: name,
                                projectDirectory: projectDirectory,
                                taskDescription: dict["taskDescription"] as? String,
                                mergeInstructions: mergeInstructions,
                                createdAt: createdAt,
                                updatedAt: updatedAt,
                                includedFiles: includedFiles,
                                forceExcludedFiles: forceExcludedFiles
                            )
                        }

                        await MainActor.run {
                            self.sessions = sessionList
                            // Build index for fast lookups
                            self.sessionsIndex = Dictionary(uniqueKeysWithValues: sessionList.enumerated().map { ($1.id, $0) })
                            self.isLoading = false
                            self.hasLoadedOnce = true
                        }
                        let cacheKey = "dev_\(self.deviceKey)_sessions_\(projectDirectory.replacingOccurrences(of: "/", with: "_"))"
                        CacheManager.shared.set(sessionList, forKey: cacheKey, ttl: 300)
                        await MainActor.run {
                            self.lastSessionsFetch[projectDirectory] = Date()
                        }
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
                return await MainActor.run { self.sessions }
            } catch {
                let cacheKey = "dev_\(self.deviceKey)_sessions_\(projectDirectory.replacingOccurrences(of: "/", with: "_"))"
                if let cached: [Session] = CacheManager.shared.get(key: cacheKey) {
                    await MainActor.run {
                        self.sessions = cached
                        self.isLoading = false
                        self.hasLoadedOnce = true
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

        // Store the task in the in-flight dictionary
        sessionsFetchInFlight[projectDirectory] = task
        return try await task.value
    }

    public func hasRecentSessionsFetch(for projectDirectory: String, within interval: TimeInterval) -> Bool {
        guard let lastFetch = lastSessionsFetch[projectDirectory] else {
            return false
        }
        return Date().timeIntervalSince(lastFetch) < interval
    }

    @MainActor
    public func fetchActiveSession() async throws -> Session? {
        isLoading = true
        defer { isLoading = false }

        do {
            // Get active session ID from desktop
            let stream = CommandRouter.appGetActiveSessionId()

            for try await response in stream {
                if let error = response.error {
                    throw DataServiceError.serverError(error.message)
                }

                if let result = response.result?.value as? [String: Any],
                   let sessionId = result["sessionId"] as? String,
                   !sessionId.isEmpty {

                    // Load the full session
                    let session = try await getSession(id: sessionId)
                    self.currentSession = session
                    return session
                }

                if response.isFinal { break }
            }

            return nil
        } catch {
            self.error = DataServiceError.networkError(error)
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
                       let projectDirectory = sessionDict["projectDirectory"] as? String {

                        let createdAt = ts(from: sessionDict, key: "createdAt")
                        let updatedAt = ts(from: sessionDict, key: "updatedAt")
                        let mergeInstructions = sessionDict["mergeInstructions"] as? String

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            mergeInstructions: mergeInstructions,
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
                       let projectDirectory = sessionDict["projectDirectory"] as? String {

                        let createdAt = ts(from: sessionDict, key: "createdAt")
                        let updatedAt = ts(from: sessionDict, key: "updatedAt")
                        let mergeInstructions = sessionDict["mergeInstructions"] as? String

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            mergeInstructions: mergeInstructions,
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
                        Task { [weak self] in
                            guard let self else { return }
                            try? await self.broadcastActiveSessionChanged(
                                sessionId: session.id,
                                projectDirectory: session.projectDirectory
                            )
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
                       let projectDirectory = sessionDict["projectDirectory"] as? String {

                        let createdAt = ts(from: sessionDict, key: "createdAt")
                        let updatedAt = ts(from: sessionDict, key: "updatedAt")
                        let mergeInstructions = sessionDict["mergeInstructions"] as? String

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            mergeInstructions: mergeInstructions,
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
                       let projectDirectory = sessionDict["projectDirectory"] as? String {

                        let createdAt = ts(from: sessionDict, key: "createdAt")
                        let updatedAt = ts(from: sessionDict, key: "updatedAt")
                        let mergeInstructions = sessionDict["mergeInstructions"] as? String

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            mergeInstructions: mergeInstructions,
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

    public func renameSession(id: String, newName: String) async throws {
        await MainActor.run { self.isLoading = true; self.error = nil }
        defer { Task { @MainActor in self.isLoading = false } }

        let stream = CommandRouter.sessionRename(sessionId: id, newName: newName)

        do {
            for try await response in stream {
                if let err = response.error {
                    await MainActor.run { self.error = DataServiceError.serverError(err.message) }
                    throw DataServiceError.serverError(err.message)
                }
                if response.isFinal {
                    await MainActor.run {
                        if let idx = self.sessions.firstIndex(where: { $0.id == id }) {
                            self.sessions[idx].name = newName
                        }
                        if self.currentSession?.id == id {
                            self.currentSession?.name = newName
                        }
                    }
                    return
                }
            }
        } catch {
            await MainActor.run { self.error = DataServiceError.networkError(error) }
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
                       let projectDirectory = sessionDict["projectDirectory"] as? String {

                        let createdAt = ts(from: sessionDict, key: "createdAt")
                        let updatedAt = ts(from: sessionDict, key: "updatedAt")
                        let mergeInstructions = sessionDict["mergeInstructions"] as? String

                        let session = Session(
                            id: id,
                            name: name,
                            projectDirectory: projectDirectory,
                            taskDescription: sessionDict["taskDescription"] as? String,
                            mergeInstructions: mergeInstructions,
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

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionUpdateTaskDescription(sessionId: sessionId, taskDescription: content)

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
            // Get project directory from current session
            let projectDirectory = currentSession?.projectDirectory
            let stream = CommandRouter.textEnhance(text: content, sessionId: sessionId, projectDirectory: projectDirectory)

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

    public func updateSessionFilesInMemory(
        sessionId: String,
        includedFiles: [String],
        forceExcludedFiles: [String]
    ) {
        guard let cs = self.currentSession, cs.id == sessionId else {
            return
        }

        // Create new Session instance with updated file lists
        let updatedSession = Session(
            id: cs.id,
            name: cs.name,
            projectDirectory: cs.projectDirectory,
            taskDescription: cs.taskDescription,
            mergeInstructions: cs.mergeInstructions,
            createdAt: cs.createdAt,
            updatedAt: cs.updatedAt,
            includedFiles: includedFiles,
            forceExcludedFiles: forceExcludedFiles
        )
        self.currentSession = updatedSession

        if let index = self.sessions.firstIndex(where: { $0.id == sessionId }) {
            self.sessions[index] = updatedSession
        }
    }

    public func broadcastActiveSessionChanged(sessionId: String, projectDirectory: String) async throws {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else { return }
        try await relayClient.sendEvent(eventType: "active-session-changed", data: [
            "sessionId": sessionId,
            "projectDirectory": projectDirectory
        ])
    }

    // MARK: - HistoryState Methods

    /// Get history state from desktop
    public func getHistoryState(sessionId: String, kind: String) async throws -> HistoryState {
        return try await CommandRouter.sessionGetHistoryState(sessionId: sessionId, kind: kind)
    }

    /// Sync history state to desktop
    public func syncHistoryState(sessionId: String, kind: String, state: HistoryState, expectedVersion: Int64) async throws -> HistoryState {
        return try await CommandRouter.sessionSyncHistoryState(sessionId: sessionId, kind: kind, state: state, expectedVersion: expectedVersion)
    }

    public func lastNonEmptyHistoryValue(_ state: HistoryState) -> String? {
        state.entries.reversed().map(\.value).map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.first { !$0.isEmpty }
    }

    /// Merge history state with desktop
    public func mergeHistoryState(sessionId: String, kind: String, remoteState: HistoryState) async throws -> HistoryState {
        return try await CommandRouter.sessionMergeHistoryState(sessionId: sessionId, kind: kind, remoteState: remoteState)
    }

    public func loadSessionById(sessionId: String, projectDirectory: String) async throws {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else { return }
        let request = RpcRequest(method: "session.get", params: ["sessionId": sessionId])
        var resolvedSession: Session? = nil
        for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
            if let result = response.result?.value as? [String: Any],
               let sessionDict = result["session"] as? [String: Any] {
                if let id = sessionDict["id"] as? String,
                   let name = sessionDict["name"] as? String,
                   let projDir = sessionDict["projectDirectory"] as? String {
                    let createdAt = ts(from: sessionDict, key: "createdAt")
                    let updatedAt = ts(from: sessionDict, key: "updatedAt")
                    let mergeInstructions = sessionDict["mergeInstructions"] as? String
                    let s = Session(
                        id: id,
                        name: name,
                        projectDirectory: projDir,
                        taskDescription: sessionDict["taskDescription"] as? String,
                        mergeInstructions: mergeInstructions,
                        createdAt: createdAt,
                        updatedAt: updatedAt,
                        includedFiles: sessionDict["includedFiles"] as? [String] ?? [],
                        forceExcludedFiles: sessionDict["forceExcludedFiles"] as? [String] ?? []
                    )
                    resolvedSession = s
                }
            }
            if response.isFinal { break }
        }
        if let s = resolvedSession {
            await MainActor.run { self.currentSession = s }
        }
    }

    // MARK: - Incremental Event Updates

    /// Apply relay event to update sessions incrementally without full refetch
    @MainActor
    public func applyRelayEvent(_ event: RelayEvent) {
        let dict = event.data.mapValues { $0.value }

        switch event.eventType {
        case "session-created":
            handleSessionCreated(dict: dict)

        case "session-updated":
            handleSessionUpdated(dict: dict)

        case "session-deleted":
            handleSessionDeleted(dict: dict)

        case "session-files-updated":
            handleSessionFilesUpdated(dict: dict)

        case "session-history-synced":
            handleSessionHistorySynced(dict: dict)

        case "session:auto-files-applied":
            handleSessionAutoFilesApplied(dict: dict)

        default:
            break
        }
    }

    private func handleSessionCreated(dict: [String: Any]) {
        guard let sessionData = dict["session"] as? [String: Any],
              let session = parseSession(from: sessionData),
              sessionsIndex[session.id] == nil else {
            return
        }

        // Add new session to list and index
        sessions.append(session)
        sessionsIndex[session.id] = sessions.count - 1

        // Sort by createdAt (newest first) to maintain consistent ordering
        sessions.sort { $0.createdAt > $1.createdAt }
        // Rebuild index after sorting
        sessionsIndex = Dictionary(uniqueKeysWithValues: sessions.enumerated().map { ($1.id, $0) })
    }

    private func handleSessionUpdated(dict: [String: Any]) {
        guard let sessionData = dict["session"] as? [String: Any],
              let sessionId = sessionData["id"] as? String,
              let index = sessionsIndex[sessionId] else {
            return
        }

        // Parse updated session
        if let updatedSession = parseSession(from: sessionData) {
            sessions[index] = updatedSession

            // Update currentSession if it's the same
            if currentSession?.id == sessionId {
                currentSession = updatedSession
            }
        }
    }

    private func handleSessionDeleted(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String ?? dict["id"] as? String,
              let index = sessionsIndex[sessionId] else {
            return
        }

        // Remove from list
        sessions.remove(at: index)
        sessionsIndex.removeValue(forKey: sessionId)

        // Rebuild index with updated positions
        sessionsIndex = Dictionary(uniqueKeysWithValues: sessions.enumerated().map { ($1.id, $0) })

        // Clear current session if it was deleted
        if currentSession?.id == sessionId {
            currentSession = nil
        }
        if currentSessionId == sessionId {
            currentSessionId = nil
        }
    }

    private func handleSessionFilesUpdated(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String,
              let includedFiles = dict["includedFiles"] as? [String],
              let forceExcludedFiles = dict["forceExcludedFiles"] as? [String] else {
            return
        }

        // Update currentSession even if not in sessionsIndex
        if currentSession?.id == sessionId {
            let cs = currentSession!
            let updatedSession = Session(
                id: cs.id,
                name: cs.name,
                projectDirectory: cs.projectDirectory,
                taskDescription: cs.taskDescription,
                mergeInstructions: cs.mergeInstructions,
                createdAt: cs.createdAt,
                updatedAt: cs.updatedAt,
                includedFiles: includedFiles,
                forceExcludedFiles: forceExcludedFiles
            )
            currentSession = updatedSession
        }

        // Also update in sessions array if present
        if let index = sessionsIndex[sessionId] {
            var session = sessions[index]
            let updatedSession = Session(
                id: session.id,
                name: session.name,
                projectDirectory: session.projectDirectory,
                taskDescription: session.taskDescription,
                mergeInstructions: session.mergeInstructions,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                includedFiles: includedFiles,
                forceExcludedFiles: forceExcludedFiles
            )
            sessions[index] = updatedSession
        }
    }

    private func handleSessionHistorySynced(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String,
              let taskDescription = dict["taskDescription"] as? String,
              let index = sessionsIndex[sessionId] else {
            return
        }

        // Update task description in session
        var session = sessions[index]
        let updatedSession = Session(
            id: session.id,
            name: session.name,
            projectDirectory: session.projectDirectory,
            taskDescription: taskDescription,
            mergeInstructions: session.mergeInstructions,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            includedFiles: session.includedFiles,
            forceExcludedFiles: session.forceExcludedFiles
        )
        sessions[index] = updatedSession

        // Update current session if it's the same
        if currentSession?.id == sessionId {
            currentSession = updatedSession
        }
    }

    private func handleSessionAutoFilesApplied(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String ?? dict["session_id"] as? String,
              let files = dict["files"] as? [String],
              let index = sessionsIndex[sessionId] else {
            return
        }

        var session = sessions[index]
        let updatedSession = Session(
            id: session.id,
            name: session.name,
            projectDirectory: session.projectDirectory,
            taskDescription: session.taskDescription,
            mergeInstructions: session.mergeInstructions,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            includedFiles: files,
            forceExcludedFiles: session.forceExcludedFiles
        )
        sessions[index] = updatedSession

        if currentSession?.id == sessionId {
            currentSession = updatedSession
        }
    }

    private func parseSession(from dict: [String: Any]) -> Session? {
        guard let id = dict["id"] as? String,
              let name = dict["name"] as? String,
              let projectDirectory = dict["projectDirectory"] as? String else {
            return nil
        }

        let createdAt = ts(from: dict, key: "createdAt")
        let updatedAt = ts(from: dict, key: "updatedAt")
        let mergeInstructions = dict["mergeInstructions"] as? String

        return Session(
            id: id,
            name: name,
            projectDirectory: projectDirectory,
            taskDescription: dict["taskDescription"] as? String,
            mergeInstructions: mergeInstructions,
            createdAt: createdAt,
            updatedAt: updatedAt,
            includedFiles: dict["includedFiles"] as? [String] ?? [],
            forceExcludedFiles: dict["forceExcludedFiles"] as? [String] ?? []
        )
    }

}

private struct FilesHistoryState: Codable {
    let includedFiles: [String]
    let forceExcludedFiles: [String]
}
