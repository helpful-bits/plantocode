import Foundation
import Combine
import CommonCrypto

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
    private var lastSessionsFetch: [String: Date] = [:]
    private var lastSessionsFetchSuccess: [String: Bool] = [:] // Track if last fetch succeeded
    private var lastHistoryVersionBySession: [String: Int64] = [:]
    private var lastHistoryChecksumBySession: [String: String] = [:] // projectDirectory -> timestamp
    private let taskHistoryMaxEntries = 200
    private var pendingRetryTasks: [String: Task<Void, Never>] = [:] // Pending retry tasks by project
    private var lastKnownDeviceId: String? // Stable device ID for cache key
    private var sessionFetchInFlight: [String: Task<Session?, Error>] = [:]
    private var historyStateObserver: NSObjectProtocol?
    private var fileFinderJobCompletionObserver: NSObjectProtocol?
    private var pendingActiveSessionBroadcast: (sessionId: String, projectDirectory: String)?
    private let allowedSessionUpdateFields: Set<String> = [
        "name",
        "projectDirectory",
        "mergeInstructions",
        "searchTerm",
        "searchSelectedFilesOnly",
        "modelUsed",
        "videoAnalysisPrompt"
    ]
    private struct FileSelectionDelta {
        let addIncluded: [String]?
        let removeIncluded: [String]?
        let addExcluded: [String]?
        let removeExcluded: [String]?
    }

    private enum FileHistoryOperationType {
        case applyDelta(FileSelectionDelta)
        case shiftIndex(Int)
    }

    private struct FileHistoryOperation {
        let type: FileHistoryOperationType
        let idempotencyKey: String?
        let enqueueIfOffline: Bool
        let completion: (Result<Void, Error>) -> Void
    }

    private var fileHistoryQueues: [String: [FileHistoryOperation]] = [:]
    private var fileHistoryProcessing: Set<String> = []
    private var fileHistoryStateCache: [String: FileHistoryStatePayload] = [:]
    private var pendingRemoteFileHistoryState: [String: FileHistoryStatePayload] = [:]

    /// Stable device key that persists across connection transitions
    /// Uses the last known device ID to prevent cache key changes during reconnection
    private var stableDeviceKey: String {
        if let activeId = MultiConnectionManager.shared.activeDeviceId?.uuidString.lowercased() {
            lastKnownDeviceId = activeId
            return activeId
        }
        // Fall back to last known ID during connection transitions
        return lastKnownDeviceId ?? "default"
    }

    /// Safely get a valid index for a session ID, checking bounds and ID match
    private func validSessionIndex(for sessionId: String) -> Int? {
        guard let index = sessionsIndex[sessionId],
              index < sessions.count,
              sessions[index].id == sessionId else {
            return nil
        }
        return index
    }

    private func isRelayConnected() -> Bool {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relay = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return false
        }
        guard relay.isConnected, relay.hasSessionCredentials else {
            return false
        }
        if let state = MultiConnectionManager.shared.connectionStates[deviceId] {
            return state.isConnected
        }
        return false
    }

    private func makeSessionFetchKey(id: String, projectDirectory: String?) -> String {
        return "\(id)::\(projectDirectory ?? "nil-project")"
    }

    /// Adds a session to the list if it doesn't already exist.
    /// Updates both the sessions array and sessionsIndex atomically.
    /// Returns true if the session was added, false if it already existed.
    @discardableResult
    private func addSessionIfNotExists(_ session: Session) -> Bool {
        guard !sessions.contains(where: { $0.id == session.id }) else {
            return false
        }
        sessions.append(session)
        sessionsIndex[session.id] = sessions.count - 1
        return true
    }

    public init() {
        self.currentSessionId = "mobile-session-\(UUID().uuidString)"
        setupHistoryStateListener()
        setupFileFinderJobCompletionListener()
    }

    /// Setup listener for file-finding job completion notifications
    /// This triggers a session refresh to ensure mobile has latest file selections
    private func setupFileFinderJobCompletionListener() {
        fileFinderJobCompletionObserver = NotificationCenter.default.addObserver(
            forName: NSNotification.Name("file-finding-job-completed"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self else { return }

            guard let userInfo = notification.userInfo,
                  let sessionId = userInfo["sessionId"] as? String else {
                return
            }

            // Only refresh if this is the current session
            guard self.currentSession?.id == sessionId else {
                return
            }

            // Refresh the session to get latest file selections
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                _ = try? await self.getSession(id: sessionId)
            }
        }
    }

    /// Setup listener for history-state-changed events from relay
    private func setupHistoryStateListener() {
        historyStateObserver = NotificationCenter.default.addObserver(
            forName: NSNotification.Name("relay-event-history-state-changed"),
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let self = self else { return }

            // Extract raw data from notification quickly (stays on current thread)
            guard let event = notification.userInfo?["event"] as? RelayEvent,
                  let sessionId = event.data["sessionId"]?.value as? String,
                  let kind = event.data["kind"]?.value as? String,
                  let stateDict = event.data["state"]?.value as? [String: Any] else {
                return
            }

            // Move heavy processing to background
            Task.detached(priority: .utility) { [weak self] in
                guard let self = self else { return }

                let key = "\(sessionId)::\(kind)"

                if kind == "files" {
                    do {
                        let fileState = try FileHistoryStateCodec.decodeState(from: stateDict)
                        await MainActor.run { [weak self] in
                            guard let self = self else { return }
                            self.applyOrDeferFileHistoryState(sessionId: sessionId, state: fileState)
                        }
                    } catch {
                        return
                    }
                } else {
                    // For other kinds (e.g., "task"), use generic HistoryState decoding
                    do {
                        // Heavy JSON processing in background
                        let stateData = try JSONSerialization.data(withJSONObject: stateDict)
                        let historyState = try JSONDecoder().decode(HistoryState.self, from: stateData)

                        // Update state on main actor
                        await MainActor.run { [weak self] in
                            guard let self = self else { return }

                            if let lastVer = self.lastHistoryVersionBySession[key], historyState.version < lastVer {
                                return
                            }
                            if let lastChecksum = self.lastHistoryChecksumBySession[key], historyState.checksum == lastChecksum {
                                return
                            }

                            let newValue = self.currentHistoryValue(historyState) ?? ""

                            if kind == "task" {
                                var currentText = ""
                                if let current = self.currentSession, current.id == sessionId {
                                    currentText = current.taskDescription ?? ""
                                } else if let index = self.sessions.firstIndex(where: { $0.id == sessionId }) {
                                    currentText = self.sessions[index].taskDescription ?? ""
                                }

                                let trimmedCurrent = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
                                let trimmedNew = newValue.trimmingCharacters(in: .whitespacesAndNewlines)

                                if !trimmedNew.isEmpty && trimmedNew == trimmedCurrent {
                                    self.lastHistoryVersionBySession[key] = historyState.version
                                    self.lastHistoryChecksumBySession[key] = historyState.checksum
                                    return
                                }

                                self.updateSessionTaskDescriptionInMemory(
                                    sessionId: sessionId,
                                    taskDescription: newValue
                                )
                            }

                            self.lastHistoryVersionBySession[key] = historyState.version
                            self.lastHistoryChecksumBySession[key] = historyState.checksum

                            NotificationCenter.default.post(
                                name: NSNotification.Name("apply-history-state"),
                                object: nil,
                                userInfo: [
                                    "sessionId": sessionId,
                                    "kind": kind,
                                    "state": historyState
                                ]
                            )
                        }
                    } catch {
                        print("Failed to decode history state: \(error)")
                    }
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
    /// Preserves cached sessions during transition to avoid empty state flicker
    @MainActor
    public func onActiveDeviceChanged() {
        // Cancel any pending retry tasks
        for (_, task) in pendingRetryTasks {
            task.cancel()
        }
        pendingRetryTasks.removeAll()
        fileHistoryQueues.removeAll()
        fileHistoryProcessing.removeAll()
        fileHistoryStateCache.removeAll()
        pendingRemoteFileHistoryState.removeAll()
        lastHistoryVersionBySession.removeAll()
        lastHistoryChecksumBySession.removeAll()

        // Clear fetch timestamps to allow fresh fetch, but preserve sessions
        // This prevents "no sessions" flicker during device transitions
        lastSessionsFetch.removeAll()
        lastSessionsFetchSuccess.removeAll()

        // Only clear current session selection, not the full sessions list
        // Sessions will be replaced when fresh data arrives
        currentSession = nil
        currentSessionId = nil
        hasLoadedOnce = false
        error = nil
        isLoading = false
        pendingActiveSessionBroadcast = nil

        // Create a new ephemeral session ID
        _ = newSession()
    }

    public func resetState() {
        Task { @MainActor in
            // Cancel pending retries
            for (_, task) in self.pendingRetryTasks {
                task.cancel()
            }
            self.pendingRetryTasks.removeAll()
            self.fileHistoryQueues.removeAll()
            self.fileHistoryProcessing.removeAll()
            self.fileHistoryStateCache.removeAll()
            self.pendingRemoteFileHistoryState.removeAll()
            self.lastHistoryVersionBySession.removeAll()
            self.lastHistoryChecksumBySession.removeAll()
            self.lastSessionsFetch.removeAll()
            self.lastSessionsFetchSuccess.removeAll()

            self.sessions = []
            self.currentSession = nil
            self.currentSessionId = nil
            self.hasLoadedOnce = false
            self.error = nil
            self.isLoading = false
            self.pendingActiveSessionBroadcast = nil
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

    /// Called when connection is restored (e.g., app returns from background)
    /// Refreshes session state and history to recover from missed relay events
    public func onConnectionRestored() {
        Task { @MainActor in
            if let pending = pendingActiveSessionBroadcast {
                do {
                    try await broadcastActiveSessionChanged(
                        sessionId: pending.sessionId,
                        projectDirectory: pending.projectDirectory
                    )
                } catch {
                    pendingActiveSessionBroadcast = pending
                }
            } else {
                _ = try? await fetchActiveSession()
            }

            guard let sessionId = currentSession?.id else { return }

            // Refresh current session to get latest file selections
            _ = try? await getSession(id: sessionId)
            await refreshHistoryState(sessionId: sessionId)
            await processOfflineQueue()
        }
    }

    private func refreshHistoryState(sessionId: String) async {
        await refreshTaskHistoryState(sessionId: sessionId)
        await refreshFileHistoryState(sessionId: sessionId)
    }

    private func refreshTaskHistoryState(sessionId: String) async {
        do {
            let historyState = try await getHistoryState(sessionId: sessionId, kind: "task", summaryOnly: false)
            let key = "\(sessionId)::task"

            if let lastVer = lastHistoryVersionBySession[key], historyState.version < lastVer {
                return
            }
            if let lastChecksum = lastHistoryChecksumBySession[key], historyState.checksum == lastChecksum {
                return
            }

            let newValue = currentHistoryValue(historyState) ?? ""
            var currentText = ""
            if let current = currentSession, current.id == sessionId {
                currentText = current.taskDescription ?? ""
            } else if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
                currentText = sessions[index].taskDescription ?? ""
            }

            let trimmedCurrent = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedNew = newValue.trimmingCharacters(in: .whitespacesAndNewlines)

            if !trimmedNew.isEmpty && trimmedNew == trimmedCurrent {
                lastHistoryVersionBySession[key] = historyState.version
                lastHistoryChecksumBySession[key] = historyState.checksum
                return
            }

            lastHistoryVersionBySession[key] = historyState.version
            lastHistoryChecksumBySession[key] = historyState.checksum

            updateSessionTaskDescriptionInMemory(
                sessionId: sessionId,
                taskDescription: newValue
            )

            NotificationCenter.default.post(
                name: NSNotification.Name("apply-history-state"),
                object: nil,
                userInfo: [
                    "sessionId": sessionId,
                    "kind": "task",
                    "state": historyState
                ]
            )
        } catch {
            // Ignore history refresh errors; relay events will backfill when possible
        }
    }

    private func refreshFileHistoryState(sessionId: String) async {
        do {
            let stateDict = try await CommandRouter.sessionGetHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                summaryOnly: false
            )
            let state = try FileHistoryStateCodec.decodeState(from: stateDict)
            applyOrDeferFileHistoryState(sessionId: sessionId, state: state)
        } catch {
            // Ignore history refresh errors; relay events will backfill when possible
        }
    }

    public func fetchSessions(projectDirectory: String) async throws -> [Session] {
        let cacheKey = "sessions_\(stableDeviceKey)_\(projectDirectory.replacingOccurrences(of: "/", with: "_"))"

        // Deduplication: Skip if we recently fetched successfully
        // Use shorter window (3s) after failure to allow faster retry
        let dedupWindow: TimeInterval = (lastSessionsFetchSuccess[projectDirectory] == true) ? 15.0 : 3.0
        if let lastFetch = lastSessionsFetch[projectDirectory],
           Date().timeIntervalSince(lastFetch) < dedupWindow {
            return await MainActor.run { self.sessions }
        }

        // Check if there's already an in-flight request for this project
        if let existing = sessionsFetchInFlight[projectDirectory] {
            return try await existing.value
        }

        // Check connection state - if not connected, try to serve from cache immediately
        let isConnected = MultiConnectionManager.shared.activeDeviceId != nil &&
            MultiConnectionManager.shared.connectionStates.values.contains { state in
                if case .connected = state { return true }
                return false
            }

        if !isConnected {
            // Not connected - serve from cache if available
            if let cached: [Session] = CacheManager.shared.get(key: cacheKey) {
                await MainActor.run {
                    if self.sessions.isEmpty {
                        self.sessions = cached
                        self.sessionsIndex = Dictionary(uniqueKeysWithValues: cached.enumerated().map { ($1.id, $0) })
                    }
                    self.hasLoadedOnce = true
                }
                // Schedule retry when connection is restored
                scheduleRetryOnReconnect(projectDirectory: projectDirectory)
                return cached
            }
            // No cache and not connected - throw offline error
            throw DataServiceError.offline
        }

        // Create new task for this fetch
        let task = Task<[Session], Error> {
            defer {
                Task { @MainActor in
                    self.sessionsFetchInFlight.removeValue(forKey: projectDirectory)
                }
            }

            // Cache-first: Show existing sessions while loading fresh data
            // This prevents empty state flicker
            await MainActor.run {
                self.isLoading = true
                self.error = nil
            }

            do {
                // Request bounded page to prevent huge transfers over relay
                let stream = CommandRouter.sessionList(projectDirectory: projectDirectory, limit: 50, offset: 0)

                for try await response in stream {
                    if let error = response.error {
                        await MainActor.run {
                            self.isLoading = false
                        }
                        throw DataServiceError.serverError(error.message)
                    }

                    if let value = response.result?.value {
                        // Decode the desktop envelope {sessions, totalCount, offset, limit}
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
                            self.error = nil
                            // Mark fetch as successful
                            self.lastSessionsFetch[projectDirectory] = Date()
                            self.lastSessionsFetchSuccess[projectDirectory] = true
                        }
                        // Update cache with fresh data
                        CacheManager.shared.set(sessionList, forKey: cacheKey, ttl: 300)
                        // Cancel any pending retry since we succeeded
                        self.cancelPendingRetry(for: projectDirectory)
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
                // On failure, try cache fallback
                if let cached: [Session] = CacheManager.shared.get(key: cacheKey) {
                    await MainActor.run {
                        // Only update sessions if currently empty to avoid replacing newer data
                        if self.sessions.isEmpty {
                            self.sessions = cached
                            self.sessionsIndex = Dictionary(uniqueKeysWithValues: cached.enumerated().map { ($1.id, $0) })
                        }
                        self.isLoading = false
                        self.hasLoadedOnce = true
                        // Clear error since we have cached data to show
                        self.error = nil
                        // Mark fetch as failed for shorter dedup window
                        self.lastSessionsFetch[projectDirectory] = Date()
                        self.lastSessionsFetchSuccess[projectDirectory] = false
                    }
                    // Schedule automatic retry
                    self.scheduleRetry(for: projectDirectory, delay: 5.0)
                    return cached
                }

                await MainActor.run {
                    self.error = DataServiceError.networkError(error)
                    self.isLoading = false
                    // Mark fetch as failed
                    self.lastSessionsFetchSuccess[projectDirectory] = false
                    // Don't set lastSessionsFetch timestamp so next attempt isn't blocked
                }
                // Schedule retry even if no cache
                self.scheduleRetry(for: projectDirectory, delay: 5.0)
                throw error
            }
        }

        // Store the task in the in-flight dictionary
        sessionsFetchInFlight[projectDirectory] = task
        return try await task.value
    }

    /// Schedule an automatic retry for session fetch after a delay
    private func scheduleRetry(for projectDirectory: String, delay: TimeInterval) {
        // Cancel any existing retry for this project
        pendingRetryTasks[projectDirectory]?.cancel()

        let task = Task { @MainActor [weak self] in
            guard let self = self else { return }

            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            // Check if task was cancelled
            guard !Task.isCancelled else { return }

            // Check if we're now connected
            let isConnected = MultiConnectionManager.shared.activeDeviceId != nil &&
                MultiConnectionManager.shared.connectionStates.values.contains { state in
                    if case .connected = state { return true }
                    return false
                }

            guard isConnected else {
                // Still not connected, schedule another retry with backoff
                self.scheduleRetry(for: projectDirectory, delay: min(delay * 2, 30.0))
                return
            }

            // Retry the fetch
            _ = try? await self.fetchSessions(projectDirectory: projectDirectory)
        }

        pendingRetryTasks[projectDirectory] = task
    }

    /// Schedule retry when connection is restored
    private func scheduleRetryOnReconnect(projectDirectory: String) {
        // This will be triggered by connection state change handler
        // For now, schedule a short-delay retry
        scheduleRetry(for: projectDirectory, delay: 2.0)
    }

    /// Cancel pending retry task for a project
    private func cancelPendingRetry(for projectDirectory: String) {
        pendingRetryTasks[projectDirectory]?.cancel()
        pendingRetryTasks.removeValue(forKey: projectDirectory)
    }

    /// Check if sessions were recently fetched successfully
    /// Returns false if the last fetch failed, to allow retry on reconnection
    public func hasRecentSessionsFetch(for projectDirectory: String, within interval: TimeInterval) -> Bool {
        guard let lastFetch = lastSessionsFetch[projectDirectory] else {
            return false
        }
        // If last fetch failed, don't consider it as recent to allow retry
        if lastSessionsFetchSuccess[projectDirectory] == false {
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
        let key = makeSessionFetchKey(id: id, projectDirectory: nil)

        // Check if there's already an in-flight request for this session
        if let existing = sessionFetchInFlight[key] {
            return try await existing.value
        }

        // Create new task for this fetch
        let task = Task<Session?, Error> {
            defer {
                Task { @MainActor in
                    self.sessionFetchInFlight.removeValue(forKey: key)
                }
            }

            await MainActor.run {
                self.isLoading = true
                self.error = nil
            }

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
        }

        // Store the task in the in-flight dictionary
        sessionFetchInFlight[key] = task
        return try await task.value
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
                            self.addSessionIfNotExists(session)
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

    public func updateSession(
        id: String,
        updates: [String: Any],
        idempotencyKey: String? = nil,
        enqueueIfOffline: Bool = true
    ) async throws {
        let invalidFields = updates.keys.filter { !allowedSessionUpdateFields.contains($0) }
        if !invalidFields.isEmpty {
            throw DataServiceError.invalidRequest(
                "Unsupported session update fields: \(invalidFields.sorted().joined(separator: ", "))"
            )
        }

        guard isRelayConnected() else {
            if enqueueIfOffline {
                let encodedUpdates = updates.mapValues { AnyCodable(any: $0) }
                let action = QueuedAction(type: .updateSessionFields(sessionId: id, updates: encodedUpdates))
                offlineQueue.enqueue(action)
            }
            applyLocalSessionUpdates(sessionId: id, updates: updates)
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionUpdate(id: id, updates: updates, idempotencyKey: idempotencyKey)

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
            let connectivityError = isRelayConnectivityError(error)
            await MainActor.run {
                self.error = connectivityError ? DataServiceError.offline : DataServiceError.networkError(error)
                self.isLoading = false
            }
            if connectivityError {
                if enqueueIfOffline {
                    let encodedUpdates = updates.mapValues { AnyCodable(any: $0) }
                    let action = QueuedAction(type: .updateSessionFields(sessionId: id, updates: encodedUpdates))
                    offlineQueue.enqueue(action)
                }
                applyLocalSessionUpdates(sessionId: id, updates: updates)
                throw DataServiceError.offline
            }
            throw error
        }
    }

    private func applyLocalSessionUpdates(sessionId: String, updates: [String: Any]) {
        guard !updates.isEmpty else { return }

        func updatedSession(_ session: Session) -> Session {
            let name = (updates["name"] as? String) ?? session.name
            let projectDirectory = (updates["projectDirectory"] as? String) ?? session.projectDirectory
            let taskDescription = session.taskDescription
            let mergeInstructions = (updates["mergeInstructions"] as? String) ?? session.mergeInstructions
            let createdAt = session.createdAt
            let updatedAt = Int64(Date().timeIntervalSince1970)
            let includedFiles = session.includedFiles
            let forceExcludedFiles = session.forceExcludedFiles

            return Session(
                id: session.id,
                name: name,
                projectDirectory: projectDirectory,
                taskDescription: taskDescription,
                mergeInstructions: mergeInstructions,
                createdAt: createdAt,
                updatedAt: updatedAt,
                includedFiles: includedFiles,
                forceExcludedFiles: forceExcludedFiles
            )
        }

        if let current = currentSession, current.id == sessionId {
            currentSession = updatedSession(current)
        }

        if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
            sessions[index] = updatedSession(sessions[index])
        }
    }

    public func deleteSession(id: String, idempotencyKey: String? = nil) async throws {
        guard isRelayConnected() else {
            let action = QueuedAction(type: .deleteSession(sessionId: id))
            offlineQueue.enqueue(action)
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionDelete(id: id, idempotencyKey: idempotencyKey)

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

    public func duplicateSession(id: String, newName: String?, idempotencyKey: String? = nil) async throws -> Session {
        guard isRelayConnected() else {
            let action = QueuedAction(type: .duplicateSession(sourceSessionId: id, newName: newName))
            offlineQueue.enqueue(action)
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.sessionDuplicate(sourceSessionId: id, newName: newName, idempotencyKey: idempotencyKey)

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
                            self.addSessionIfNotExists(session)
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

    public func renameSession(id: String, newName: String, idempotencyKey: String? = nil) async throws {
        try await updateSession(id: id, updates: ["name": newName], idempotencyKey: idempotencyKey)
    }

    public func cachedFileHistoryState(sessionId: String) -> FileHistoryStatePayload? {
        return fileHistoryStateCache[sessionId]
    }

    private func cacheFileHistoryState(sessionId: String, state: FileHistoryStatePayload) {
        fileHistoryStateCache[sessionId] = state
        let key = "\(sessionId)::files"
        lastHistoryVersionBySession[key] = state.version
        if !state.checksum.isEmpty {
            lastHistoryChecksumBySession[key] = state.checksum
        }
    }

    private func shouldApplyFileHistoryState(sessionId: String, state: FileHistoryStatePayload) -> Bool {
        let key = "\(sessionId)::files"
        if let lastVer = lastHistoryVersionBySession[key], state.version < lastVer {
            return false
        }
        if let lastChecksum = lastHistoryChecksumBySession[key],
           !state.checksum.isEmpty,
           state.checksum == lastChecksum {
            return false
        }
        return true
    }

    private func hasPendingFileHistoryOps(sessionId: String) -> Bool {
        if fileHistoryProcessing.contains(sessionId) {
            return true
        }
        if let queue = fileHistoryQueues[sessionId], !queue.isEmpty {
            return true
        }
        return false
    }

    private func applyFileHistoryState(sessionId: String, state: FileHistoryStatePayload) {
        cacheFileHistoryState(sessionId: sessionId, state: state)
        guard !state.entries.isEmpty else { return }

        let rawIndex = Int(state.currentIndex)
        let clampedIndex = max(0, min(rawIndex, state.entries.count - 1))
        let entry = state.entries[clampedIndex]
        let includedFiles = FileHistoryStateCodec.parseFileList(from: entry.includedFiles)
        let forceExcludedFiles = FileHistoryStateCodec.parseFileList(from: entry.forceExcludedFiles)

        updateSessionFilesInMemory(
            sessionId: sessionId,
            includedFiles: includedFiles,
            forceExcludedFiles: forceExcludedFiles
        )
    }

    private func applyOrDeferFileHistoryState(sessionId: String, state: FileHistoryStatePayload) {
        guard shouldApplyFileHistoryState(sessionId: sessionId, state: state) else { return }
        if hasPendingFileHistoryOps(sessionId: sessionId) {
            pendingRemoteFileHistoryState[sessionId] = state
            return
        }
        applyFileHistoryState(sessionId: sessionId, state: state)
    }

    private func ensureFileHistoryState(sessionId: String) async throws -> FileHistoryStatePayload {
        if let cached = fileHistoryStateCache[sessionId] {
            return cached
        }
        let rawState = try await CommandRouter.sessionGetHistoryStateRaw(
            sessionId: sessionId,
            kind: "files",
            summaryOnly: false,
            maxEntries: 50
        )
        let state = try FileHistoryStateCodec.decodeState(from: rawState)
        cacheFileHistoryState(sessionId: sessionId, state: state)
        return state
    }

    private func startFileHistoryQueueIfNeeded(sessionId: String) {
        if fileHistoryProcessing.contains(sessionId) {
            return
        }
        fileHistoryProcessing.insert(sessionId)
        Task { [weak self] in
            await self?.processFileHistoryQueue(sessionId: sessionId)
        }
    }

    private func enqueueFileHistoryOperation(
        sessionId: String,
        type: FileHistoryOperationType,
        idempotencyKey: String?,
        enqueueIfOffline: Bool
    ) async throws {
        try await withCheckedThrowingContinuation { continuation in
            let op = FileHistoryOperation(
                type: type,
                idempotencyKey: idempotencyKey,
                enqueueIfOffline: enqueueIfOffline
            ) { result in
                continuation.resume(with: result)
            }
            fileHistoryQueues[sessionId, default: []].append(op)
            startFileHistoryQueueIfNeeded(sessionId: sessionId)
        }
    }

    private func processFileHistoryQueue(sessionId: String) async {
        defer {
            fileHistoryProcessing.remove(sessionId)
            if let pending = pendingRemoteFileHistoryState.removeValue(forKey: sessionId) {
                applyOrDeferFileHistoryState(sessionId: sessionId, state: pending)
            }
        }

        while true {
            guard let op = fileHistoryQueues[sessionId]?.first else {
                break
            }
            fileHistoryQueues[sessionId]?.removeFirst()

            do {
                switch op.type {
                case .applyDelta(let delta):
                    try await syncFileHistoryDelta(
                        sessionId: sessionId,
                        delta: delta,
                        idempotencyKey: op.idempotencyKey
                    )
                case .shiftIndex(let delta):
                    try await syncFileHistoryIndexDelta(
                        sessionId: sessionId,
                        delta: delta,
                        idempotencyKey: op.idempotencyKey
                    )
                }
                op.completion(.success(()))
            } catch {
                let connectivityError = isRelayConnectivityError(error)
                let errorToReturn = connectivityError ? DataServiceError.offline : error
                if connectivityError, case .applyDelta(let delta) = op.type, op.enqueueIfOffline {
                    let action = QueuedAction(type: .updateFiles(
                        sessionId: sessionId,
                        addIncluded: delta.addIncluded,
                        removeIncluded: delta.removeIncluded,
                        addExcluded: delta.addExcluded,
                        removeExcluded: delta.removeExcluded
                    ))
                    offlineQueue.enqueue(action)
                }

                op.completion(.failure(errorToReturn))

                if connectivityError {
                    if let remaining = fileHistoryQueues.removeValue(forKey: sessionId) {
                        for pendingOp in remaining {
                            if case .applyDelta(let delta) = pendingOp.type, pendingOp.enqueueIfOffline {
                                let action = QueuedAction(type: .updateFiles(
                                    sessionId: sessionId,
                                    addIncluded: delta.addIncluded,
                                    removeIncluded: delta.removeIncluded,
                                    addExcluded: delta.addExcluded,
                                    removeExcluded: delta.removeExcluded
                                ))
                                offlineQueue.enqueue(action)
                            }
                            pendingOp.completion(.failure(DataServiceError.offline))
                        }
                    }
                    break
                }
            }
        }
    }

    private func syncFileHistoryDelta(
        sessionId: String,
        delta: FileSelectionDelta,
        idempotencyKey: String?
    ) async throws {
        func applyDelta(included: [String], excluded: [String]) -> (included: [String], excluded: [String]) {
            var includedSet = Set(included)
            var excludedSet = Set(excluded)

            if let removeIncluded = delta.removeIncluded {
                for file in removeIncluded { includedSet.remove(file) }
            }
            if let removeExcluded = delta.removeExcluded {
                for file in removeExcluded { excludedSet.remove(file) }
            }
            if let addIncluded = delta.addIncluded {
                for file in addIncluded where !file.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    includedSet.insert(file)
                    excludedSet.remove(file)
                }
            }
            if let addExcluded = delta.addExcluded {
                for file in addExcluded where !file.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    excludedSet.insert(file)
                    includedSet.remove(file)
                }
            }

            var nextIncluded = Array(includedSet)
            var nextExcluded = Array(excludedSet)
            nextIncluded.sort()
            nextExcluded.sort()
            return (nextIncluded, nextExcluded)
        }

        let historyState = try await ensureFileHistoryState(sessionId: sessionId)
        let clampedIndex = historyState.entries.isEmpty
            ? 0
            : min(max(0, Int(historyState.currentIndex)), historyState.entries.count - 1)
        let currentEntry = historyState.entries.isEmpty ? nil : historyState.entries[clampedIndex]

        let currentIncluded: [String]
        let currentExcluded: [String]
        if let entry = currentEntry {
            currentIncluded = FileHistoryStateCodec.parseFileList(from: entry.includedFiles)
            currentExcluded = FileHistoryStateCodec.parseFileList(from: entry.forceExcludedFiles)
        } else if let session = currentSession, session.id == sessionId {
            currentIncluded = session.includedFiles
            currentExcluded = session.forceExcludedFiles
        } else if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
            currentIncluded = sessions[index].includedFiles
            currentExcluded = sessions[index].forceExcludedFiles
        } else {
            currentIncluded = []
            currentExcluded = []
        }

        let next = applyDelta(included: currentIncluded, excluded: currentExcluded)
        if Set(next.included) == Set(currentIncluded) && Set(next.excluded) == Set(currentExcluded) {
            return
        }

        let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
        let maxSequence = historyState.entries.map { $0.sequenceNumber }.max() ?? -1
        let nextSequence = maxSequence + 1
        let newEntry = FileHistoryEntryPayload(
            includedFiles: JSONSanitizer.stringifyStringArray(next.included),
            forceExcludedFiles: JSONSanitizer.stringifyStringArray(next.excluded),
            timestampMs: nowMs,
            deviceId: MultiConnectionManager.shared.activeDeviceId?.uuidString.lowercased(),
            opType: "user-edit",
            sequenceNumber: nextSequence,
            version: historyState.version
        )

        var updatedEntries = historyState.entries.prefix(clampedIndex + 1)
        var newEntries = Array(updatedEntries)
        newEntries.append(newEntry)
        if newEntries.count > 50 {
            newEntries = Array(newEntries.suffix(50))
        }

        let newIndex = Int64(max(0, newEntries.count - 1))
        let checksum = FileHistoryStateCodec.computeChecksum(
            entries: newEntries,
            currentIndex: newIndex,
            version: historyState.version
        )

        let updatedState = FileHistoryStatePayload(
            entries: newEntries,
            currentIndex: newIndex,
            version: historyState.version,
            checksum: checksum
        )

        let syncKey = idempotencyKey ?? "file-history:\(sessionId):\(updatedState.checksum)"
        let stateDict = try FileHistoryStateCodec.encodeState(updatedState)

        do {
            let syncResult = try await CommandRouter.sessionSyncHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                state: stateDict,
                expectedVersion: historyState.version,
                idempotencyKey: syncKey
            )
            let appliedState = (try? FileHistoryStateCodec.decodeState(from: syncResult)) ?? updatedState
            applyFileHistoryState(sessionId: sessionId, state: appliedState)
        } catch {
            guard isHistoryConflict(error) else { throw error }
            let latestRaw = try await CommandRouter.sessionGetHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                summaryOnly: false,
                maxEntries: 50
            )
            let latestState = try FileHistoryStateCodec.decodeState(from: latestRaw)
            cacheFileHistoryState(sessionId: sessionId, state: latestState)

            let latestIndex = latestState.entries.isEmpty
                ? 0
                : min(max(0, Int(latestState.currentIndex)), latestState.entries.count - 1)
            let latestEntry = latestState.entries.isEmpty ? nil : latestState.entries[latestIndex]
            let latestIncluded: [String]
            let latestExcluded: [String]
            if let entry = latestEntry {
                latestIncluded = FileHistoryStateCodec.parseFileList(from: entry.includedFiles)
                latestExcluded = FileHistoryStateCodec.parseFileList(from: entry.forceExcludedFiles)
            } else if let session = currentSession, session.id == sessionId {
                latestIncluded = session.includedFiles
                latestExcluded = session.forceExcludedFiles
            } else if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
                latestIncluded = sessions[index].includedFiles
                latestExcluded = sessions[index].forceExcludedFiles
            } else {
                latestIncluded = []
                latestExcluded = []
            }
            let rebased = applyDelta(included: latestIncluded, excluded: latestExcluded)
            if Set(rebased.included) == Set(latestIncluded) && Set(rebased.excluded) == Set(latestExcluded) {
                return
            }

            let retryEntry = FileHistoryEntryPayload(
                includedFiles: JSONSanitizer.stringifyStringArray(rebased.included),
                forceExcludedFiles: JSONSanitizer.stringifyStringArray(rebased.excluded),
                timestampMs: nowMs,
                deviceId: MultiConnectionManager.shared.activeDeviceId?.uuidString.lowercased(),
                opType: "user-edit",
                sequenceNumber: (latestState.entries.map { $0.sequenceNumber }.max() ?? -1) + 1,
                version: latestState.version
            )

            let retryIndex = latestState.entries.isEmpty
                ? 0
                : min(max(0, Int(latestState.currentIndex)), latestState.entries.count - 1)
            var retryEntries = latestState.entries.prefix(retryIndex + 1)
            var updatedRetryEntries = Array(retryEntries)
            updatedRetryEntries.append(retryEntry)
            if updatedRetryEntries.count > 50 {
                updatedRetryEntries = Array(updatedRetryEntries.suffix(50))
            }

            let retryNewIndex = Int64(max(0, updatedRetryEntries.count - 1))
            let retryChecksum = FileHistoryStateCodec.computeChecksum(
                entries: updatedRetryEntries,
                currentIndex: retryNewIndex,
                version: latestState.version
            )
            let retryState = FileHistoryStatePayload(
                entries: updatedRetryEntries,
                currentIndex: retryNewIndex,
                version: latestState.version,
                checksum: retryChecksum
            )
            let retryDict = try FileHistoryStateCodec.encodeState(retryState)
            let retrySyncKey = "file-history:\(sessionId):\(retryState.checksum)"
            let retryResult = try await CommandRouter.sessionSyncHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                state: retryDict,
                expectedVersion: latestState.version,
                idempotencyKey: retrySyncKey
            )
            let appliedRetry = (try? FileHistoryStateCodec.decodeState(from: retryResult)) ?? retryState
            applyFileHistoryState(sessionId: sessionId, state: appliedRetry)
        }
    }

    private func syncFileHistoryIndexDelta(
        sessionId: String,
        delta: Int,
        idempotencyKey: String?
    ) async throws {
        func applyDelta(state: FileHistoryStatePayload, delta: Int) -> FileHistoryStatePayload? {
            guard !state.entries.isEmpty else { return nil }
            let clampedCurrent = max(0, min(Int(state.currentIndex), state.entries.count - 1))
            let nextIndex = clampedCurrent + delta
            guard nextIndex >= 0, nextIndex < state.entries.count else { return nil }
            var updated = state
            updated.currentIndex = Int64(nextIndex)
            updated.checksum = FileHistoryStateCodec.computeChecksum(
                entries: updated.entries,
                currentIndex: updated.currentIndex,
                version: updated.version
            )
            return updated
        }

        let baseState = try await ensureFileHistoryState(sessionId: sessionId)
        guard let updated = applyDelta(state: baseState, delta: delta) else { return }

        let encodedState = try FileHistoryStateCodec.encodeState(updated)
        let syncKey = idempotencyKey ?? "file-history-index:\(sessionId):\(updated.checksum)"

        do {
            let syncResult = try await CommandRouter.sessionSyncHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                state: encodedState,
                expectedVersion: updated.version,
                idempotencyKey: syncKey
            )
            let appliedState = (try? FileHistoryStateCodec.decodeState(from: syncResult)) ?? updated
            applyFileHistoryState(sessionId: sessionId, state: appliedState)
        } catch {
            guard isHistoryConflict(error) else { throw error }

            let latestRaw = try await CommandRouter.sessionGetHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                summaryOnly: false,
                maxEntries: 50
            )
            let latestState = try FileHistoryStateCodec.decodeState(from: latestRaw)
            cacheFileHistoryState(sessionId: sessionId, state: latestState)
            guard let retryState = applyDelta(state: latestState, delta: delta) else { return }
            let encodedRetry = try FileHistoryStateCodec.encodeState(retryState)
            let retryKey = "file-history-index:\(sessionId):\(retryState.checksum)"
            let syncResult = try await CommandRouter.sessionSyncHistoryStateRaw(
                sessionId: sessionId,
                kind: "files",
                state: encodedRetry,
                expectedVersion: retryState.version,
                idempotencyKey: retryKey
            )
            let appliedState = (try? FileHistoryStateCodec.decodeState(from: syncResult)) ?? retryState
            applyFileHistoryState(sessionId: sessionId, state: appliedState)
        }
    }

    public func updateSessionFiles(
        sessionId: String,
        addIncluded: [String]?,
        removeIncluded: [String]?,
        addExcluded: [String]?,
        removeExcluded: [String]?,
        idempotencyKey: String? = nil,
        enqueueIfOffline: Bool = true
    ) async throws -> Session {
        func normalize(_ values: [String]?) -> [String]? {
            guard let values else { return nil }
            let cleaned = values.compactMap { value -> String? in
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
            return cleaned.isEmpty ? nil : cleaned
        }

        let delta = FileSelectionDelta(
            addIncluded: normalize(addIncluded),
            removeIncluded: normalize(removeIncluded),
            addExcluded: normalize(addExcluded),
            removeExcluded: normalize(removeExcluded)
        )

        if delta.addIncluded == nil && delta.removeIncluded == nil && delta.addExcluded == nil && delta.removeExcluded == nil {
            if let session = currentSession, session.id == sessionId {
                return session
            }
            if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
                return sessions[index]
            }
            throw DataServiceError.invalidResponse("Updated session not found")
        }

        func applyUpdates(included: [String], excluded: [String]) -> (included: [String], excluded: [String]) {
            var includedSet = Set(included)
            var excludedSet = Set(excluded)

            if let removeIncluded = delta.removeIncluded {
                for file in removeIncluded { includedSet.remove(file) }
            }
            if let removeExcluded = delta.removeExcluded {
                for file in removeExcluded { excludedSet.remove(file) }
            }
            if let addIncluded = delta.addIncluded {
                for file in addIncluded {
                    includedSet.insert(file)
                    excludedSet.remove(file)
                }
            }
            if let addExcluded = delta.addExcluded {
                for file in addExcluded {
                    excludedSet.insert(file)
                    includedSet.remove(file)
                }
            }

            var nextIncluded = Array(includedSet)
            var nextExcluded = Array(excludedSet)
            nextIncluded.sort()
            nextExcluded.sort()
            return (nextIncluded, nextExcluded)
        }

        let currentIncluded = currentSession?.id == sessionId
            ? currentSession?.includedFiles ?? []
            : sessions.first(where: { $0.id == sessionId })?.includedFiles ?? []
        let currentExcluded = currentSession?.id == sessionId
            ? currentSession?.forceExcludedFiles ?? []
            : sessions.first(where: { $0.id == sessionId })?.forceExcludedFiles ?? []
        let next = applyUpdates(included: currentIncluded, excluded: currentExcluded)
        if Set(next.included) != Set(currentIncluded) || Set(next.excluded) != Set(currentExcluded) {
            updateSessionFilesInMemory(
                sessionId: sessionId,
                includedFiles: next.included,
                forceExcludedFiles: next.excluded
            )
        }

        guard isRelayConnected() else {
            if enqueueIfOffline {
                let action = QueuedAction(type: .updateFiles(
                    sessionId: sessionId,
                    addIncluded: delta.addIncluded,
                    removeIncluded: delta.removeIncluded,
                    addExcluded: delta.addExcluded,
                    removeExcluded: delta.removeExcluded
                ))
                offlineQueue.enqueue(action)
            }
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            try await enqueueFileHistoryOperation(
                sessionId: sessionId,
                type: .applyDelta(delta),
                idempotencyKey: idempotencyKey,
                enqueueIfOffline: enqueueIfOffline
            )
            isLoading = false

            if let session = currentSession, session.id == sessionId {
                return session
            }
            if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
                return sessions[index]
            }
            throw DataServiceError.invalidResponse("Updated session not found")
        } catch {
            let connectivityError = isRelayConnectivityError(error)
            self.error = connectivityError ? DataServiceError.offline : DataServiceError.networkError(error)
            self.isLoading = false
            if connectivityError {
                throw DataServiceError.offline
            }
            throw error
        }
    }

    public func updateFileHistoryIndex(
        sessionId: String,
        delta: Int,
        idempotencyKey: String? = nil
    ) async throws {
        guard delta != 0 else { return }
        guard isRelayConnected() else {
            throw DataServiceError.offline
        }

        isLoading = true
        error = nil

        do {
            try await enqueueFileHistoryOperation(
                sessionId: sessionId,
                type: .shiftIndex(delta),
                idempotencyKey: idempotencyKey,
                enqueueIfOffline: false
            )
            isLoading = false
        } catch {
            let connectivityError = isRelayConnectivityError(error)
            self.error = connectivityError ? DataServiceError.offline : DataServiceError.networkError(error)
            self.isLoading = false
            if connectivityError {
                throw DataServiceError.offline
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
    public func processOfflineQueue() async {
        await offlineQueue.processPending(with: self)
    }

    /// Check if there are pending offline actions
    public var hasPendingOfflineActions: Bool {
        return offlineQueue.hasPendingActions
    }

    public func updateSessionFilesInMemory(
        sessionId: String,
        includedFiles: [String],
        forceExcludedFiles: [String]
    ) {
        // Sanitize and deduplicate file arrays using JSONSanitizer
        // This handles nested arrays, stringified JSON, and preserves stable order
        let sanitizedIncluded = JSONSanitizer.ensureUniqueStringArray(includedFiles)
        let sanitizedExcluded = JSONSanitizer.ensureUniqueStringArray(forceExcludedFiles)

        func withUpdatedFiles(_ session: Session) -> Session {
            Session(
                id: session.id,
                name: session.name,
                projectDirectory: session.projectDirectory,
                taskDescription: session.taskDescription,
                mergeInstructions: session.mergeInstructions,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                includedFiles: sanitizedIncluded,
                forceExcludedFiles: sanitizedExcluded
            )
        }

        if let cs = self.currentSession, cs.id == sessionId {
            self.currentSession = withUpdatedFiles(cs)
        }

        if let index = self.sessions.firstIndex(where: { $0.id == sessionId }) {
            self.sessions[index] = withUpdatedFiles(self.sessions[index])
        }
    }

    public func updateSessionTaskDescriptionInMemory(
        sessionId: String,
        taskDescription: String
    ) {
        let trimmed = taskDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let updatedValue: String? = trimmed.isEmpty ? nil : taskDescription

        func withUpdatedTask(_ session: Session) -> Session {
            Session(
                id: session.id,
                name: session.name,
                projectDirectory: session.projectDirectory,
                taskDescription: updatedValue,
                mergeInstructions: session.mergeInstructions,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                includedFiles: session.includedFiles,
                forceExcludedFiles: session.forceExcludedFiles
            )
        }

        if let cs = self.currentSession, cs.id == sessionId {
            self.currentSession = withUpdatedTask(cs)
        }

        if let index = self.sessions.firstIndex(where: { $0.id == sessionId }) {
            self.sessions[index] = withUpdatedTask(self.sessions[index])
        }
    }

    public func broadcastActiveSessionChanged(sessionId: String, projectDirectory: String) async throws {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId),
              relayClient.isConnected,
              relayClient.hasSessionCredentials else {
            pendingActiveSessionBroadcast = (sessionId: sessionId, projectDirectory: projectDirectory)
            throw DataServiceError.offline
        }
        try await relayClient.sendEvent(eventType: "active-session-changed", data: [
            "sessionId": sessionId,
            "projectDirectory": projectDirectory
        ])
        pendingActiveSessionBroadcast = nil
    }

    // MARK: - HistoryState Methods

    /// Get history state from desktop
    public func getHistoryState(sessionId: String, kind: String, summaryOnly: Bool = false, maxEntries: Int? = nil) async throws -> HistoryState {
        return try await CommandRouter.sessionGetHistoryState(sessionId: sessionId, kind: kind, summaryOnly: summaryOnly, maxEntries: maxEntries)
    }

    /// Sync history state to desktop
    public func syncHistoryState(sessionId: String, kind: String, state: HistoryState, expectedVersion: Int64, idempotencyKey: String? = nil) async throws -> HistoryState {
        let resolvedIdempotencyKey = idempotencyKey ?? historySyncIdempotencyKey(
            sessionId: sessionId,
            kind: kind,
            state: state
        )

        guard isRelayConnected() else {
            try enqueueOfflineHistorySync(
                sessionId: sessionId,
                kind: kind,
                state: state,
                expectedVersion: expectedVersion
            )
            throw DataServiceError.offline
        }

        do {
            return try await CommandRouter.sessionSyncHistoryState(
                sessionId: sessionId,
                kind: kind,
                state: state,
                expectedVersion: expectedVersion,
                idempotencyKey: resolvedIdempotencyKey
            )
        } catch {
            if isHistoryConflict(error) {
                do {
                    return try await CommandRouter.sessionMergeHistoryState(sessionId: sessionId, kind: kind, remoteState: state)
                } catch {
                    throw DataServiceError.serverError("Failed to merge history state: \(error.localizedDescription)")
                }
            }
            if isRelayConnectivityError(error) {
                try enqueueOfflineHistorySync(
                    sessionId: sessionId,
                    kind: kind,
                    state: state,
                    expectedVersion: expectedVersion
                )
                throw DataServiceError.offline
            }
            throw DataServiceError.serverError("Failed to sync history state: \(error.localizedDescription)")
        }
    }

    private func localTaskDescriptionValue(for sessionId: String) -> String {
        if let session = currentSession, session.id == sessionId {
            return session.taskDescription ?? ""
        }
        if let index = sessions.firstIndex(where: { $0.id == sessionId }) {
            return sessions[index].taskDescription ?? ""
        }
        return ""
    }

    private func makeOfflineTaskHistoryState(newValue: String, opType: String) -> HistoryState {
        let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
        let version: Int64 = 1
        let entry = HistoryEntry(
            value: newValue,
            createdAt: nowMs,
            deviceId: MultiConnectionManager.shared.activeDeviceId?.uuidString.lowercased(),
            opType: opType,
            sequenceNumber: 0,
            version: version
        )
        let checksum = computeTaskHistoryChecksum(entries: [entry], currentIndex: 0, version: version)
        return HistoryState(
            entries: [entry],
            currentIndex: 0,
            version: version,
            checksum: checksum
        )
    }

    private func syncTaskHistoryState(
        sessionId: String,
        newValue: String,
        state: HistoryState,
        expectedVersion: Int64,
        idempotencyKey: String?
    ) async throws -> HistoryState {
        do {
            let synced = try await syncHistoryState(
                sessionId: sessionId,
                kind: "task",
                state: state,
                expectedVersion: expectedVersion,
                idempotencyKey: idempotencyKey
            )
            let syncedValue = lastNonEmptyHistoryValue(synced) ?? newValue
            await MainActor.run {
                self.updateSessionTaskDescriptionInMemory(
                    sessionId: sessionId,
                    taskDescription: syncedValue
                )
            }
            return synced
        } catch {
            if case DataServiceError.offline = error {
                await MainActor.run {
                    self.updateSessionTaskDescriptionInMemory(
                        sessionId: sessionId,
                        taskDescription: newValue
                    )
                }
            }
            throw error
        }
    }

    private func updateTaskDescriptionInternal(
        sessionId: String,
        newValue: String,
        opType: String,
        idempotencyKey: String?,
        historyState: HistoryState?,
        allowHistoryFetch: Bool
    ) async throws -> HistoryState {
        var resolvedHistory = historyState
        if resolvedHistory == nil && allowHistoryFetch {
            do {
                resolvedHistory = try await getHistoryState(sessionId: sessionId, kind: "task", summaryOnly: false)
            } catch {
                if !isRelayConnectivityError(error) {
                    throw error
                }
            }
        }

        if let historyState = resolvedHistory {
            let lastValue = lastNonEmptyHistoryValue(historyState) ?? ""
            if newValue == lastValue {
                return historyState
            }

            let nowMs = Int64(Date().timeIntervalSince1970 * 1000)
            let nextSequence = nextTaskSequenceNumber(from: historyState.entries)
            let newEntry = HistoryEntry(
                value: newValue,
                createdAt: nowMs,
                deviceId: MultiConnectionManager.shared.activeDeviceId?.uuidString.lowercased(),
                opType: opType,
                sequenceNumber: nextSequence,
                version: historyState.version
            )

            let clampedIndex = historyState.entries.isEmpty
                ? -1
                : min(max(0, Int(historyState.currentIndex)), historyState.entries.count - 1)

            var updatedEntries: [HistoryEntry]
            if clampedIndex >= 0 {
                updatedEntries = Array(historyState.entries.prefix(clampedIndex + 1))
            } else {
                updatedEntries = []
            }
            updatedEntries.append(newEntry)

            if updatedEntries.count > taskHistoryMaxEntries {
                updatedEntries = Array(updatedEntries.suffix(taskHistoryMaxEntries))
            }

            let newIndex = Int64(max(0, updatedEntries.count - 1))
            let checksum = computeTaskHistoryChecksum(
                entries: updatedEntries,
                currentIndex: newIndex,
                version: historyState.version
            )

            let updatedState = HistoryState(
                entries: updatedEntries,
                currentIndex: newIndex,
                version: historyState.version,
                checksum: checksum
            )

            return try await syncTaskHistoryState(
                sessionId: sessionId,
                newValue: newValue,
                state: updatedState,
                expectedVersion: historyState.version,
                idempotencyKey: idempotencyKey
            )
        }

        let baseValue = localTaskDescriptionValue(for: sessionId)
        if newValue == baseValue {
            return makeOfflineTaskHistoryState(newValue: newValue, opType: opType)
        }

        let offlineState = makeOfflineTaskHistoryState(newValue: newValue, opType: opType)
        return try await syncTaskHistoryState(
            sessionId: sessionId,
            newValue: newValue,
            state: offlineState,
            expectedVersion: offlineState.version,
            idempotencyKey: idempotencyKey
        )
    }

    public func updateTaskDescription(
        sessionId: String,
        newValue: String,
        opType: String = "user-edit",
        idempotencyKey: String? = nil
    ) async throws -> HistoryState {
        return try await updateTaskDescriptionInternal(
            sessionId: sessionId,
            newValue: newValue,
            opType: opType,
            idempotencyKey: idempotencyKey,
            historyState: nil,
            allowHistoryFetch: true
        )
    }

    public func appendTaskDescription(
        sessionId: String,
        appendText: String,
        opType: String = "improvement",
        idempotencyKey: String? = nil
    ) async throws -> HistoryState {
        let trimmed = appendText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return try await getHistoryState(sessionId: sessionId, kind: "task", summaryOnly: false)
        }

        var historyState: HistoryState?
        do {
            historyState = try await getHistoryState(sessionId: sessionId, kind: "task", summaryOnly: false)
        } catch {
            if !isRelayConnectivityError(error) {
                throw error
            }
        }

        let base = historyState.flatMap { lastNonEmptyHistoryValue($0) } ?? localTaskDescriptionValue(for: sessionId)
        let updated = base + appendText

        return try await updateTaskDescriptionInternal(
            sessionId: sessionId,
            newValue: updated,
            opType: opType,
            idempotencyKey: idempotencyKey,
            historyState: historyState,
            allowHistoryFetch: false
        )
    }

    private func currentHistoryValue(_ state: HistoryState) -> String? {
        guard !state.entries.isEmpty else { return nil }
        let clamped = min(max(0, Int(state.currentIndex)), state.entries.count - 1)
        return state.entries[clamped].value
    }

    /// Returns the last non-empty value from history state entries
    public func lastNonEmptyHistoryValue(_ state: HistoryState) -> String? {
        for entry in state.entries.reversed() {
            let trimmed = entry.value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return entry.value
            }
        }
        return nil
    }

    /// Merge history state with desktop
    public func mergeHistoryState(sessionId: String, kind: String, remoteState: HistoryState) async throws -> HistoryState {
        do {
            return try await CommandRouter.sessionMergeHistoryState(sessionId: sessionId, kind: kind, remoteState: remoteState)
        } catch {
            throw DataServiceError.serverError("Failed to merge history state: \(error.localizedDescription)")
        }
    }

    private func isHistoryConflict(_ error: Error) -> Bool {
        guard let relayError = error as? ServerRelayError else { return false }
        switch relayError {
        case .serverError(let code, let message):
            if code == "-32003" || code.lowercased() == "conflict" {
                return true
            }
            let lower = message.lowercased()
            return lower.contains("version mismatch") || lower.contains("conflict")
        default:
            return false
        }
    }

    private func isRelayConnectivityError(_ error: Error) -> Bool {
        if let relayError = error as? ServerRelayError {
            switch relayError {
            case .notConnected, .disconnected, .networkError, .timeout:
                return true
            case .serverError(let code, let message):
                let lower = message.lowercased()
                return code == "-32010"
                    || lower.contains("desktop is offline")
                    || lower.contains("device not connected")
                    || lower.contains("not connected")
            case .invalidState(let message):
                let lower = message.lowercased()
                return lower.contains("no sync result received")
                    || lower.contains("no history state received")
                    || lower.contains("no merge result received")
                    || lower.contains("desktop is offline")
                    || lower.contains("device not connected")
            default:
                return false
            }
        }

        if let dataError = error as? DataServiceError {
            switch dataError {
            case .offline, .timeout, .serviceUnavailable:
                return true
            case .connectionError(let message):
                let lower = message.lowercased()
                return lower.contains("not connected")
                    || lower.contains("offline")
                    || lower.contains("desktop is offline")
                    || lower.contains("device not connected")
                    || lower.contains("no active device")
            case .networkError(let underlying):
                if isRelayConnectivityError(underlying) {
                    return true
                }
                return true
            case .serverError(let message):
                let lower = message.lowercased()
                return lower.contains("desktop is offline")
                    || lower.contains("device not connected")
                    || lower.contains("not connected")
                    || lower.contains("no active device")
            case .invalidState(let message):
                let lower = message.lowercased()
                return lower.contains("no sync result received")
                    || lower.contains("no history state received")
                    || lower.contains("no merge result received")
                    || lower.contains("desktop is offline")
                    || lower.contains("device not connected")
            default:
                break
            }
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet,
                 .networkConnectionLost,
                 .timedOut,
                 .cannotFindHost,
                 .cannotConnectToHost,
                 .dnsLookupFailed:
                return true
            default:
                break
            }
        }

        return false
    }

    private func historySyncIdempotencyKey(sessionId: String, kind: String, state: HistoryState) -> String {
        return "history:\(sessionId):\(kind):\(state.checksum)"
    }

    private func enqueueOfflineHistorySync(
        sessionId: String,
        kind: String,
        state: HistoryState,
        expectedVersion: Int64
    ) throws {
        do {
            let stateData = try JSONEncoder().encode(state)
            let action = QueuedAction(type: .syncHistoryState(
                sessionId: sessionId,
                kind: kind,
                state: stateData,
                expectedVersion: expectedVersion
            ))
            offlineQueue.enqueue(action)
        } catch {
            throw DataServiceError.invalidResponse("Failed to encode history state for offline sync")
        }
    }

    private func nextTaskSequenceNumber(from entries: [HistoryEntry]) -> Int32 {
        let maxValue = entries.compactMap { $0.sequenceNumber }.map { Int64($0) }.max() ?? -1
        let next = maxValue + 1
        if next > Int64(Int32.max) {
            return Int32.max
        }
        if next < Int64(Int32.min) {
            return Int32.min
        }
        return Int32(next)
    }

    private func computeTaskHistoryChecksum(entries: [HistoryEntry], currentIndex: Int64, version: Int64) -> String {
        struct ChecksumEntry: Encodable {
            let value: String
            let timestampMs: Int64
            let deviceId: String?
            let sequenceNumber: Int64
            let version: Int64

            enum CodingKeys: String, CodingKey {
                case value
                case timestampMs
                case deviceId
                case sequenceNumber
                case version
            }
        }

        struct ChecksumPayload: Encodable {
            let currentIndex: Int64
            let entries: [ChecksumEntry]
            let version: Int64

            enum CodingKeys: String, CodingKey {
                case currentIndex
                case entries
                case version
            }
        }

        let checksumEntries = entries.map { entry in
            ChecksumEntry(
                value: entry.value,
                timestampMs: entry.createdAt,
                deviceId: entry.deviceId,
                sequenceNumber: Int64(entry.sequenceNumber ?? 0),
                version: entry.version
            )
        }

        let payload = ChecksumPayload(currentIndex: currentIndex, entries: checksumEntries, version: version)
        guard let data = try? JSONEncoder().encode(payload) else {
            return ""
        }

        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }

        return hash.map { String(format: "%02x", $0) }.joined()
    }

    public func loadSessionById(sessionId: String, projectDirectory: String) async throws {
        let key = makeSessionFetchKey(id: sessionId, projectDirectory: projectDirectory)

        // Check if there's already an in-flight request for this session
        if let existing = sessionFetchInFlight[key] {
            _ = try await existing.value
            return
        }

        // Create new task for this fetch
        let task = Task<Session?, Error> {
            defer {
                Task { @MainActor in
                    self.sessionFetchInFlight.removeValue(forKey: key)
                }
            }

            guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
                  let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
                throw DataServiceError.connectionError("No active device connection")
            }

            let request = RpcRequest(method: "session.get", params: ["sessionId": sessionId])
            var resolvedSession: Session? = nil
            for try await response in relayClient.invoke(request: request) {
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
        return resolvedSession
        }

        // Store the task in the in-flight dictionary
        sessionFetchInFlight[key] = task
        _ = try await task.value
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

        case "session-task-updated":
            handleSessionTaskUpdated(dict: dict)

        case "session-snapshot":
            handleSessionSnapshot(dict: dict)

        default:
            break
        }
    }

    private func handleSessionCreated(dict: [String: Any]) {
        guard let sessionData = dict["session"] as? [String: Any],
              let session = parseSession(from: sessionData) else {
            return
        }

        guard addSessionIfNotExists(session) else {
            return
        }

        // Sort by createdAt (newest first) to maintain consistent ordering
        sessions.sort { $0.createdAt > $1.createdAt }
        // Rebuild index after sorting
        sessionsIndex = Dictionary(uniqueKeysWithValues: sessions.enumerated().map { ($1.id, $0) })
    }

    private func handleSessionUpdated(dict: [String: Any]) {
        guard let sessionData = dict["session"] as? [String: Any],
              let sessionId = sessionData["id"] as? String else {
            return
        }

        // Parse updated session
        guard let updatedSession = parseSession(from: sessionData) else { return }

        // Update currentSession even if not in sessionsIndex (same pattern as handleSessionFilesUpdated)
        if currentSession?.id == sessionId {
            if shouldApplySessionUpdate(existing: currentSession, incoming: updatedSession) {
                currentSession = updatedSession
            }
        }

        // Also update in sessions array if present
        if let index = validSessionIndex(for: sessionId) {
            if shouldApplySessionUpdate(existing: sessions[index], incoming: updatedSession) {
                sessions[index] = updatedSession
            }
        }
    }

    private func handleSessionDeleted(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String,
              let index = validSessionIndex(for: sessionId) else {
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
        guard let sessionId = dict["sessionId"] as? String else {
            return
        }
        if hasPendingFileHistoryOps(sessionId: sessionId) {
            return
        }
        if fileHistoryStateCache[sessionId] != nil {
            return
        }

        // Sanitize incoming files using JSONSanitizer to handle:
        // - Stringified JSON arrays (e.g., "[\"file1.txt\"]")
        // - Actual string arrays
        // - Nested arrays
        // - Empty/invalid values
        let includedRaw = dict["includedFiles"] ?? []
        let excludedRaw = dict["forceExcludedFiles"] ?? []
        let includedFiles = JSONSanitizer.ensureUniqueStringArray(includedRaw)
        let forceExcludedFiles = JSONSanitizer.ensureUniqueStringArray(excludedRaw)

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
        if let index = validSessionIndex(for: sessionId) {
            let session = sessions[index]
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

    private func handleSessionTaskUpdated(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String else {
            return
        }

        let taskDescription = dict["taskDescription"] as? String ?? ""
        updateSessionTaskDescriptionInMemory(
            sessionId: sessionId,
            taskDescription: taskDescription
        )
    }

    private func handleSessionSnapshot(dict: [String: Any]) {
        guard let sessionData = dict["session"] as? [String: Any] else {
            return
        }

        let sessionId = (dict["sessionId"] as? String) ?? (sessionData["id"] as? String)
        guard let sessionId else { return }
        guard let updatedSession = parseSession(from: sessionData) else { return }

        if currentSession?.id == sessionId {
            if shouldApplySessionUpdate(existing: currentSession, incoming: updatedSession) {
                currentSession = updatedSession
            }
        }

        if let index = validSessionIndex(for: sessionId) {
            if shouldApplySessionUpdate(existing: sessions[index], incoming: updatedSession) {
                sessions[index] = updatedSession
            }
        } else {
            _ = addSessionIfNotExists(updatedSession)
        }

        func updateHistoryMeta(kind: String, payload: [String: Any]) {
            let versionValue = payload["version"] as? Int64 ?? (payload["version"] as? Int).map(Int64.init) ?? 0
            let checksum = payload["checksum"] as? String
            let key = "\(sessionId)::\(kind)"
            if let checksum, checksum != lastHistoryChecksumBySession[key] {
                lastHistoryVersionBySession[key] = versionValue
                lastHistoryChecksumBySession[key] = checksum
                Task { [weak self] in
                    guard let self else { return }
                    if kind == "task" {
                        await self.refreshTaskHistoryState(sessionId: sessionId)
                    } else if kind == "files" {
                        await self.refreshFileHistoryState(sessionId: sessionId)
                    }
                }
            }
        }

        if let taskHistory = dict["taskHistory"] as? [String: Any] {
            updateHistoryMeta(kind: "task", payload: taskHistory)
        }
        if let fileHistory = dict["fileHistory"] as? [String: Any] {
            updateHistoryMeta(kind: "files", payload: fileHistory)
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

    private func shouldApplySessionUpdate(existing: Session?, incoming: Session) -> Bool {
        guard let existing else { return true }
        guard existing.updatedAt > 0, incoming.updatedAt > 0 else { return true }
        return incoming.updatedAt >= existing.updatedAt
    }

    deinit {
        if let observer = historyStateObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = fileFinderJobCompletionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        // Cancel all pending retry tasks
        for (_, task) in pendingRetryTasks {
            task.cancel()
        }
    }

    // MARK: - Prompt Methods

    /// Get implementation plan prompt for viewing
    public func getPlanPrompt(
        sessionId: String,
        taskDescription: String,
        projectDirectory: String,
        relevantFiles: [String]
    ) async throws -> PromptResponse {
        isLoading = true
        error = nil

        do {
            let stream = CommandRouter.getImplementationPlanPrompt(
                sessionId: sessionId,
                taskDescription: taskDescription,
                projectDirectory: projectDirectory,
                relevantFiles: relevantFiles
            )

            var result: PromptResponse?
            for try await response in stream {
                if let error = response.error {
                    await MainActor.run {
                        self.isLoading = false
                    }
                    throw DataServiceError.serverError(error.message)
                }

                if let resultData = response.result?.value as? [String: Any],
                   let promptDict = resultData["prompt"] as? [String: Any],
                   let systemPrompt = promptDict["systemPrompt"] as? String,
                   let userPrompt = promptDict["userPrompt"] as? String,
                   let combinedPrompt = promptDict["combinedPrompt"] as? String {
                    result = PromptResponse(
                        systemPrompt: systemPrompt,
                        userPrompt: userPrompt,
                        combinedPrompt: combinedPrompt
                    )
                    if response.isFinal {
                        break
                    }
                }
            }

            await MainActor.run {
                self.isLoading = false
            }

            guard let finalResult = result else {
                throw DataServiceError.invalidResponse("No prompt data received")
            }

            return finalResult
        } catch {
            await MainActor.run {
                self.error = DataServiceError.networkError(error)
                self.isLoading = false
            }
            throw error
        }
    }

}

private struct FilesHistoryState: Codable {
    let includedFiles: [String]
    let forceExcludedFiles: [String]
}
