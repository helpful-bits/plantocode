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
    private var lastSessionsFetch: [String: Date] = [:]
    private var lastSessionsFetchSuccess: [String: Bool] = [:] // Track if last fetch succeeded
    private var lastHistoryVersionBySession: [String: Int64] = [:]
    private var lastHistoryChecksumBySession: [String: String] = [:] // projectDirectory -> timestamp
    private var pendingRetryTasks: [String: Task<Void, Never>] = [:] // Pending retry tasks by project
    private var lastKnownDeviceId: String? // Stable device ID for cache key
    private var sessionFetchInFlight: [String: Task<Session?, Error>] = [:]
    private var historyStateObserver: NSObjectProtocol?
    private var fileFinderJobCompletionObserver: NSObjectProtocol?

    /// Stable device key that persists across connection transitions
    /// Uses the last known device ID to prevent cache key changes during reconnection
    private var stableDeviceKey: String {
        if let activeId = MultiConnectionManager.shared.activeDeviceId?.uuidString {
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
                    // For files, parse directly from stateDict since desktop uses
                    // included_files/force_excluded_files as separate TEXT fields
                    guard let entriesAny = stateDict["entries"] as? [Any], !entriesAny.isEmpty else {
                        return
                    }

                    let version: Int64
                    if let v = stateDict["version"] as? Int64 {
                        version = v
                    } else if let v = stateDict["version"] as? Int {
                        version = Int64(v)
                    } else {
                        version = 0
                    }

                    let checksum = stateDict["checksum"] as? String

                    // Get current index
                    let rawIndex: Int
                    if let idx = stateDict["currentIndex"] as? Int {
                        rawIndex = idx
                    } else if let idx64 = stateDict["currentIndex"] as? Int64 {
                        rawIndex = Int(idx64)
                    } else {
                        rawIndex = 0
                    }
                    let clampedIndex = max(0, min(rawIndex, entriesAny.count - 1))

                    guard let entryDict = entriesAny[clampedIndex] as? [String: Any] else {
                        return
                    }

                    // Parse included_files and force_excluded_files from entry
                    // These may arrive as JSON-serialized arrays (e.g. "[\"file1.txt\", \"file2.txt\"]")
                    // or as actual arrays or strings - use JSONSanitizer to handle all cases
                    let includedRaw = entryDict["included_files"] ?? "[]"
                    let excludedRaw = entryDict["force_excluded_files"] ?? "[]"

                    // Use JSONSanitizer to handle stringified arrays, nested arrays, and edge cases
                    let includedFiles = JSONSanitizer.ensureUniqueStringArray(includedRaw)
                    let forceExcludedFiles = JSONSanitizer.ensureUniqueStringArray(excludedRaw)

                    // Update state on main actor
                    await MainActor.run { [weak self] in
                        guard let self = self else { return }

                        // Dedup based on version/checksum
                        if let lastVer = self.lastHistoryVersionBySession[key], version < lastVer {
                            return
                        }
                        if let lastChecksum = self.lastHistoryChecksumBySession[key], checksum == lastChecksum {
                            return
                        }

                        self.updateSessionFilesInMemory(
                            sessionId: sessionId,
                            includedFiles: includedFiles,
                            forceExcludedFiles: forceExcludedFiles
                        )

                        self.lastHistoryVersionBySession[key] = version
                        if let cs = checksum {
                            self.lastHistoryChecksumBySession[key] = cs
                        }
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

                            let newValue = self.lastNonEmptyHistoryValue(historyState) ?? ""

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
            self.lastSessionsFetch.removeAll()
            self.lastSessionsFetchSuccess.removeAll()

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

    /// Called when connection is restored (e.g., app returns from background)
    /// Refreshes current session to get latest includedFiles in case relay events were missed
    public func onConnectionRestored() {
        guard let sessionId = currentSession?.id else { return }

        Task {
            // Refresh current session to get latest file selections
            _ = try? await getSession(id: sessionId)
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

    /// Check if there are pending offline actions
    public var hasPendingOfflineActions: Bool {
        return offlineQueue.hasPendingActions
    }

    public func updateSessionFilesInMemory(
        sessionId: String,
        includedFiles: [String],
        forceExcludedFiles: [String]
    ) {
        guard let cs = self.currentSession, cs.id == sessionId else {
            return
        }

        // Sanitize and deduplicate file arrays using JSONSanitizer
        // This handles nested arrays, stringified JSON, and preserves stable order
        let sanitizedIncluded = JSONSanitizer.ensureUniqueStringArray(includedFiles)
        let sanitizedExcluded = JSONSanitizer.ensureUniqueStringArray(forceExcludedFiles)

        // Create new Session instance with updated file lists
        let updatedSession = Session(
            id: cs.id,
            name: cs.name,
            projectDirectory: cs.projectDirectory,
            taskDescription: cs.taskDescription,
            mergeInstructions: cs.mergeInstructions,
            createdAt: cs.createdAt,
            updatedAt: cs.updatedAt,
            includedFiles: sanitizedIncluded,
            forceExcludedFiles: sanitizedExcluded
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
        do {
            return try await CommandRouter.sessionSyncHistoryState(sessionId: sessionId, kind: kind, state: state, expectedVersion: expectedVersion)
        } catch {
            throw DataServiceError.serverError("Failed to sync history state: \(error.localizedDescription)")
        }
    }

    public func lastNonEmptyHistoryValue(_ state: HistoryState) -> String? {
        state.entries.reversed().map(\.value).map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.first { !$0.isEmpty }
    }

    /// Merge history state with desktop
    public func mergeHistoryState(sessionId: String, kind: String, remoteState: HistoryState) async throws -> HistoryState {
        do {
            return try await CommandRouter.sessionMergeHistoryState(sessionId: sessionId, kind: kind, remoteState: remoteState)
        } catch {
            throw DataServiceError.serverError("Failed to merge history state: \(error.localizedDescription)")
        }
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
            currentSession = updatedSession
        }

        // Also update in sessions array if present
        if let index = validSessionIndex(for: sessionId) {
            sessions[index] = updatedSession
        }
    }

    private func handleSessionDeleted(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String ?? dict["id"] as? String,
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

    private func handleSessionHistorySynced(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String,
              let taskDescription = dict["taskDescription"] as? String else {
            return
        }

        // Update currentSession even if not in sessionsIndex (same pattern as handleSessionFilesUpdated)
        if currentSession?.id == sessionId {
            let cs = currentSession!
            let updatedSession = Session(
                id: cs.id,
                name: cs.name,
                projectDirectory: cs.projectDirectory,
                taskDescription: taskDescription,
                mergeInstructions: cs.mergeInstructions,
                createdAt: cs.createdAt,
                updatedAt: cs.updatedAt,
                includedFiles: cs.includedFiles,
                forceExcludedFiles: cs.forceExcludedFiles
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
                taskDescription: taskDescription,
                mergeInstructions: session.mergeInstructions,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                includedFiles: session.includedFiles,
                forceExcludedFiles: session.forceExcludedFiles
            )
            sessions[index] = updatedSession
        }
    }

    private func handleSessionAutoFilesApplied(dict: [String: Any]) {
        guard let sessionId = dict["sessionId"] as? String ?? dict["session_id"] as? String,
              let files = dict["files"] as? [String] else {
            return
        }

        // Update currentSession even if not in sessionsIndex (same pattern as handleSessionFilesUpdated)
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
                includedFiles: files,
                forceExcludedFiles: cs.forceExcludedFiles
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
                includedFiles: files,
                forceExcludedFiles: session.forceExcludedFiles
            )
            sessions[index] = updatedSession
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
