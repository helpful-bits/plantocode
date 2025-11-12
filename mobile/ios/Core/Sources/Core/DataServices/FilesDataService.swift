import Foundation
import Combine
import OSLog

public struct FindFilesSuggestion: Hashable {
    public let path: String
    public let reason: String?
    public let score: Double?
    public init(path: String, reason: String? = nil, score: Double? = nil) {
        self.path = path
        self.reason = reason
        self.score = score
    }
}

public enum FindFilesEvent: Equatable {
    case progress(Double, message: String?)
    case suggestions([FindFilesSuggestion])
    case info(String)
    case completed
    case error(String)
}

/// Service for accessing file system data from desktop
@MainActor
public final class FilesDataService: ObservableObject {
    private let logger = Logger(subsystem: "PlanToCode", category: "FilesDataService")

    // MARK: - Published Properties
    @Published public var files: [FileInfo] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    @Published public var searchResults: [FileInfo] = []
    @Published public var currentSearchTerm: String = ""
    @Published public var currentSortBy: String = "name"
    @Published public var currentSortOrder: String = "asc"
    @Published public var currentFilterMode: String = "all"

    // MARK: - Private Properties
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private var cancellables = Set<AnyCancellable>()
    private let serverRelayClient: ServerRelayClient?
    private var isApplyingRemoteState = false
    private var lastFileSearch: [String: Date] = [:] // cacheKey -> timestamp for deduplication

    private var deviceKey: String {
        MultiConnectionManager.shared.activeDeviceId?.uuidString ?? "no_device"
    }

    // MARK: - Initialization
    public init(apiClient: APIClientProtocol = APIClient.shared, cacheManager: CacheManager = CacheManager.shared) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        self.serverRelayClient = nil
        setupStateChangeBroadcasting()
    }

    public init(apiClient: APIClientProtocol = APIClient.shared, cacheManager: CacheManager = CacheManager.shared, serverRelayClient: ServerRelayClient) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        self.serverRelayClient = serverRelayClient
        setupStateChangeBroadcasting()
    }

    public func reset() {
        files = []
        searchResults = []
        isLoading = false
        error = nil
        currentSearchTerm = ""
        currentSortBy = "name"
        currentSortOrder = "asc"
        currentFilterMode = "all"
        lastFileSearch = [:]
        isApplyingRemoteState = false
        cancellables.removeAll()
    }

    // MARK: - Public Methods

    /// Search files with various filters and patterns
    public func searchFiles(query: String, maxResults: Int = 50, includeContent: Bool = false, projectDirectory: String) async throws -> [FileInfo] {
        // Time-based deduplication: if we searched recently, return cached data
        let cacheKey = "files_\(projectDirectory)_\(query)_\(maxResults)_\(includeContent)"
        if let lastSearch = lastFileSearch[cacheKey],
           Date().timeIntervalSince(lastSearch) < 3.0 {
            logger.debug("Skipping duplicate file search within 3s window: \(query)")
            // Return current files data without making a network call
            return self.files
        }

        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            throw DataServiceError.invalidState("Not connected to desktop")
        }

        for try await response in CommandRouter.filesSearch(
            projectDirectory: projectDirectory,
            query: query,
            includeContent: includeContent,
            maxResults: maxResults
        ) {
            if let result = response.result?.value as? [String: Any] {
                // Desktop returns { "files": [...], "total_count": 123 }
                // Handle both NSArray and Swift Array
                if let filesArray = result["files"] as? NSArray {
                    let fileInfos = filesArray.compactMap { fileObj -> FileInfo? in
                        guard let dict = fileObj as? [String: Any] else {
                            return nil
                        }
                        return FileInfo(from: dict)
                    }
                    // Update timestamp after successful search
                    self.lastFileSearch[cacheKey] = Date()
                    return fileInfos
                } else if let files = result["files"] as? [[String: Any]] {
                    let fileInfos = files.compactMap { dict in
                        FileInfo(from: dict)
                    }
                    // Update timestamp after successful search
                    self.lastFileSearch[cacheKey] = Date()
                    return fileInfos
                }
            }

            if let error = response.error {
                throw DataServiceError.serverError(error.message)
            }
        }
        return []
    }


    /// Get file content with preview support
    public func getFileContent(request: FileContentRequest) -> AnyPublisher<FileContentResponse, DataServiceError> {
        let cacheKey = "dev_\(deviceKey)_file_content_\(request.filePath.hashValue)"

        if let cached: FileContentResponse = cacheManager.get(key: cacheKey) {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        return apiClient.request(
            endpoint: .getFileContent,
            method: .POST,
            body: request
        )
        .decode(type: FileContentResponse.self, decoder: JSONDecoder.apiDecoder)
        .map { [weak self] response in
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 300) // 5 min cache
            return response
        }
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// List directory contents
    public func listDirectory(request: DirectoryListRequest) -> AnyPublisher<DirectoryListResponse, DataServiceError> {
        let cacheKey = "dev_\(deviceKey)_directory_\(request.directoryPath.hashValue)"

        if let cached: DirectoryListResponse = cacheManager.get(key: cacheKey) {
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        return apiClient.request(
            endpoint: .listDirectory,
            method: .POST,
            body: request
        )
        .decode(type: DirectoryListResponse.self, decoder: JSONDecoder.apiDecoder)
        .map { [weak self] response in
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 120) // 2 min cache
            return response
        }
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get metadata for multiple files
    public func getFilesMetadata(request: FileMetadataRequest) -> AnyPublisher<FileMetadataResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .getFilesMetadata,
            method: .POST,
            body: request
        )
        .decode(type: FileMetadataResponse.self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Validate file path for security
    public func validatePath(request: PathValidationRequest) -> AnyPublisher<PathValidationResponse, DataServiceError> {
        return apiClient.request(
            endpoint: .validatePath,
            method: .POST,
            body: request
        )
        .decode(type: PathValidationResponse.self, decoder: JSONDecoder.apiDecoder)
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    // MARK: - Convenience Methods

    /// Quick search by file name
    public func searchByFileName(_ fileName: String, in projectDirectory: String) async throws -> [FileInfo] {
        return try await searchFiles(
            query: fileName,
            maxResults: 100,
            includeContent: false,
            projectDirectory: projectDirectory
        )
    }

    /// Search for files by extension
    public func searchByExtension(_ extension: String, in projectDirectory: String) async throws -> [FileInfo] {
        return try await searchFiles(
            query: "*.\(`extension`)",
            maxResults: 200,
            includeContent: false,
            projectDirectory: projectDirectory
        )
    }

    /// Search file contents with regex
    public func searchContent(_ pattern: String, in projectDirectory: String) async throws -> [FileInfo] {
        return try await searchFiles(
            query: pattern,
            maxResults: 100,
            includeContent: true,
            projectDirectory: projectDirectory
        )
    }

    /// Get file preview (first N lines)
    public func getFilePreview(_ filePath: String, in projectDirectory: String, lines: UInt32 = 50) -> AnyPublisher<String, DataServiceError> {
        let request = FileContentRequest(
            filePath: filePath,
            projectDirectory: projectDirectory,
            previewLines: lines
        )

        return getFileContent(request: request)
            .map(\.content)
            .eraseToAnyPublisher()
    }

    /// Browse directory with common settings
    public func browseDirectory(_ path: String, in projectDirectory: String, includeHidden: Bool = false) -> AnyPublisher<DirectoryListResponse, DataServiceError> {
        let request = DirectoryListRequest(
            directoryPath: path,
            projectDirectory: projectDirectory,
            includeHidden: includeHidden,
            sortBy: .name,
            sortOrder: .asc
        )

        return listDirectory(request: request)
    }


    /// Convenience overload with default project directory
    public func searchFilesWithDefaultProject(query: String, maxResults: Int = 50, includeContent: Bool = false) async throws -> [FileInfo] {
        guard let defaultProjectDirectory = PlanToCodeCore.shared.dataServices?.currentProject?.directory
                                             ?? AppState.shared.selectedProjectDirectory,
              !defaultProjectDirectory.isEmpty else {
            throw DataServiceError.invalidState("No project directory configured")
        }

        return try await searchFiles(
            query: query,
            maxResults: maxResults,
            includeContent: includeContent,
            projectDirectory: defaultProjectDirectory
        )
    }

    /// Start file finder workflow using RPC call
    public func startFileFinderWorkflow(sessionId: String) -> AsyncThrowingStream<Any, Error> {
        guard let relayClient = serverRelayClient else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No relay client available"))
            }
        }

        guard let deviceId = MultiConnectionManager.shared.activeDeviceId else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "workflows.startFileFinder",
                        params: [
                            "sessionId": sessionId
                        ]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Start web search workflow using RPC call
    public func startWebSearchWorkflow(sessionId: String, query: String) -> AsyncThrowingStream<Any, Error> {
        guard let relayClient = serverRelayClient else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No relay client available"))
            }
        }

        guard let deviceId = MultiConnectionManager.shared.activeDeviceId else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.connectionError("No active device connection"))
            }
        }

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = RpcRequest(
                        method: "workflows.startWebSearch",
                        params: [
                            "sessionId": sessionId,
                            "query": query
                        ]
                    )

                    for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                        if let error = response.error {
                            continuation.finish(throwing: DataServiceError.serverError("RPC Error: \(error.message)"))
                            return
                        }

                        if let result = response.result?.value {
                            continuation.yield(result)
                            if response.isFinal {
                                continuation.finish()
                                return
                            }
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    public func workflowsStartFileFinder(sessionId: String,
                                       taskDescription: String,
                                       projectDirectory: String,
                                       excludedPaths: [String],
                                       timeoutMs: Int = 120_000) -> AsyncThrowingStream<RpcResponse, Error> {
        CommandRouter.workflowsStartFileFinder(sessionId: sessionId,
                                              taskDescription: taskDescription,
                                              projectDirectory: projectDirectory,
                                              excludedPaths: excludedPaths,
                                              timeoutMs: timeoutMs)
    }

    private func parseProgress(_ any: Any) -> Double? {
        if let d = any as? Double { return d > 1.0 ? min(d / 100.0, 1.0) : max(min(d, 1.0), 0.0) }
        if let i = any as? Int { return Double(i) > 1.0 ? min(Double(i) / 100.0, 1.0) : max(min(Double(i), 1.0), 0.0) }
        if let s = any as? String, let d = Double(s) { return d > 1.0 ? min(d / 100.0, 1.0) : max(min(d, 1.0), 0.0) }
        return nil
    }

    private func makeSuggestion(from dict: [String: Any]) -> FindFilesSuggestion? {
        let path = (dict["path"] as? String) ?? (dict["filePath"] as? String)
        let reason = (dict["reason"] as? String) ?? (dict["why"] as? String)
        let score: Double?
        if let s = dict["score"] as? Double { score = s }
        else if let r = dict["rank"] as? Double { score = r }
        else if let str = dict["score"] as? String, let d = Double(str) { score = d }
        else { score = nil }
        guard let p = path, !p.isEmpty else { return nil }
        return FindFilesSuggestion(path: p, reason: reason, score: score)
    }

    public func startFindFiles(sessionId: String,
                             taskDescription: String,
                             projectDirectory: String,
                             excludedPaths: [String] = [],
                             timeoutMs: Int = 120_000) -> AsyncThrowingStream<FindFilesEvent, Error> {
        let source = CommandRouter.workflowsStartFileFinder(sessionId: sessionId,
                                                           taskDescription: taskDescription,
                                                           projectDirectory: projectDirectory,
                                                           excludedPaths: excludedPaths,
                                                           timeoutMs: timeoutMs)
        return AsyncThrowingStream { continuation in
            Task {
                var bestSuggestionsByPath: [String: FindFilesSuggestion] = [:]
                do {
                    for try await resp in source {
                        if let err = resp.error {
                            continuation.yield(.error(err.message))
                            continuation.finish(throwing: DataServiceError.serverError(err.message))
                            break
                        }
                        if let dict = resp.result?.value as? [String: Any] {
                            if let p = dict["progress"].flatMap(parseProgress) {
                                let msg = (dict["message"] as? String)
                                    ?? (dict["status"] as? String)
                                    ?? (dict["stage"] as? String)
                                continuation.yield(.progress(p, message: msg))
                            }
                            if let arr = dict["files"] as? [Any] ?? dict["recommendations"] as? [Any] {
                                var batch: [FindFilesSuggestion] = []
                                for item in arr {
                                    if let d = item as? [String: Any], let s = makeSuggestion(from: d) {
                                        let existing = bestSuggestionsByPath[s.path]
                                        let chosen: FindFilesSuggestion
                                        if let ex = existing {
                                            let score = max(ex.score ?? -Double.infinity, s.score ?? -Double.infinity)
                                            let reason = ex.reason ?? s.reason
                                            chosen = FindFilesSuggestion(path: s.path, reason: reason, score: score.isFinite ? score : nil)
                                        } else {
                                            chosen = s
                                        }
                                        bestSuggestionsByPath[s.path] = chosen
                                        batch.append(chosen)
                                    }
                                }
                                if !batch.isEmpty {
                                    continuation.yield(.suggestions(Array(Set(batch))))
                                }
                            }
                            if dict["path"] != nil || dict["filePath"] != nil, let s = makeSuggestion(from: dict) {
                                let existing = bestSuggestionsByPath[s.path]
                                let chosen = existing ?? s
                                bestSuggestionsByPath[s.path] = chosen
                                continuation.yield(.suggestions([chosen]))
                            }
                            if let info = (dict["message"] as? String) ?? (dict["status"] as? String) ?? (dict["stage"] as? String) {
                                continuation.yield(.info(info))
                            }
                        }
                        if resp.isFinal == true {
                            continuation.yield(.completed)
                            continuation.finish()
                            break
                        }
                    }
                } catch {
                    continuation.yield(.error(error.localizedDescription))
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    public func applyRemoteBrowserState(
        sessionId: String,
        searchTerm: String?,
        sortBy: String?,
        sortOrder: String?,
        filterMode: String?
    ) {
        isApplyingRemoteState = true

        if let v = searchTerm, v != currentSearchTerm {
            currentSearchTerm = v
        }
        if let v = sortBy, v != currentSortBy {
            currentSortBy = v
        }
        if let v = sortOrder, v != currentSortOrder {
            currentSortOrder = v
        }
        if let v = filterMode, v != self.currentFilterMode {
            self.currentFilterMode = v
        }

        // Trigger search with updated state
        performSearch(query: currentSearchTerm)

        DispatchQueue.main.async {
            self.isApplyingRemoteState = false
        }
    }

    // MARK: - State Broadcasting

    private func setupStateChangeBroadcasting() {
        $currentSearchTerm
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in self?.broadcastStateChangeAndSearch() }
            .store(in: &cancellables)

        $currentSortBy
            .dropFirst()
            .sink { [weak self] _ in self?.broadcastStateChangeAndSearch() }
            .store(in: &cancellables)

        $currentSortOrder
            .dropFirst()
            .sink { [weak self] _ in self?.broadcastStateChangeAndSearch() }
            .store(in: &cancellables)

        $currentFilterMode
            .dropFirst()
            .sink { [weak self] _ in self?.broadcastStateChangeAndSearch() }
            .store(in: &cancellables)
    }

    private func broadcastStateChangeAndSearch() {
        guard !isApplyingRemoteState else { return }

        // Kick off a fetch for local UX parity
        self.performSearch(query: self.currentSearchTerm)

        guard let session = PlanToCodeCore.shared.dataServices?.sessionService.currentSession else { return }

        // Guard against cross-project broadcasts during rapid project switches
        if let currentProjectDir = PlanToCodeCore.shared.dataServices?.currentProject?.directory,
           session.projectDirectory != currentProjectDir {
            logger.debug("Suppressing file browser state broadcast: session project mismatch")
            return
        }

        Task {
            try? await CommandRouter.sessionUpdateFileBrowserState(
                sessionId: session.id,
                projectDirectory: session.projectDirectory,
                searchTerm: self.currentSearchTerm.isEmpty ? nil : self.currentSearchTerm,
                sortBy: self.currentSortBy,
                sortOrder: self.currentSortOrder,
                filterMode: self.currentFilterMode
            )
        }
    }

    public func performSearch(query: String) {
        // Trigger file search with current query
        Task {
            do {
                guard let project = PlanToCodeCore.shared.dataServices?.currentProject else { return }
                let results = try await searchFiles(
                    query: query,
                    maxResults: 10000,
                    includeContent: false,
                    projectDirectory: project.directory
                )
                await MainActor.run {
                    self.files = results
                }
            } catch {
                logger.error("Search failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Cache Management

    public func invalidateCache() {
        cacheManager.invalidatePattern("files_")
        cacheManager.invalidatePattern("file_content_")
        cacheManager.invalidatePattern("directory_")
    }

    /// Reset files state when active device changes
    @MainActor
    public func onActiveDeviceChanged() {
        invalidateCache()
        lastFileSearch.removeAll() // Clear deduplication timestamps on device change
        files.removeAll()
        searchResults.removeAll()
        currentSearchTerm = ""
        error = nil
        isLoading = false
        logger.info("Files state reset for device change")
    }

    public func preloadProjectFiles(projectDirectory: String) {
        Task {
            do {
                let results = try await searchFiles(
                    query: "",
                    maxResults: 500,
                    includeContent: false,
                    projectDirectory: projectDirectory
                )
                await MainActor.run {
                    self.files = results
                }
            } catch {
                logger.error("Failed to preload project files: \(error.localizedDescription)")
            }
        }
    }

    public func getFileHistoryState(sessionId: String) async throws -> [String: Any] {
        try await CommandRouter.sessionGetHistoryStateRaw(sessionId: sessionId, kind: "files")
    }

    public func undoFileSelection(sessionId: String) async throws {
        var state = try await getFileHistoryState(sessionId: sessionId)
        let entries = (state["entries"] as? [Any]) ?? []
        var current = (state["currentIndex"] as? Int) ?? Int(state["currentIndex"] as? Int64 ?? 0)
        guard current > 0 else { return }
        current -= 1
        state["currentIndex"] = Int64(current)
        let version = (state["version"] as? Int64) ?? Int64(state["version"] as? Int ?? 0)
        _ = try await CommandRouter.sessionSyncHistoryStateRaw(sessionId: sessionId, kind: "files", state: state, expectedVersion: version)
    }

    public func redoFileSelection(sessionId: String) async throws {
        var state = try await getFileHistoryState(sessionId: sessionId)
        let entries = (state["entries"] as? [Any]) ?? []
        var current = (state["currentIndex"] as? Int) ?? Int(state["currentIndex"] as? Int64 ?? 0)
        guard current < max(0, entries.count - 1) else { return }
        current += 1
        state["currentIndex"] = Int64(current)
        let version = (state["version"] as? Int64) ?? Int64(state["version"] as? Int ?? 0)
        _ = try await CommandRouter.sessionSyncHistoryStateRaw(sessionId: sessionId, kind: "files", state: state, expectedVersion: version)
    }
}

// MARK: - Supporting Types

public struct FileSearchRequest: Codable {
    public let projectDirectory: String
    public let globPatterns: [String]?
    public let regexPattern: String?
    public let fileNamePattern: String?
    public let contentPattern: String?
    public let fileTypes: [String]?
    public let excludePatterns: [String]?
    public let maxFileSize: UInt64?
    public let includeHidden: Bool?
    public let maxResults: UInt32?
    public let page: UInt32?
    public let pageSize: UInt32?

    public init(
        projectDirectory: String,
        globPatterns: [String]? = nil,
        regexPattern: String? = nil,
        fileNamePattern: String? = nil,
        contentPattern: String? = nil,
        fileTypes: [String]? = nil,
        excludePatterns: [String]? = nil,
        maxFileSize: UInt64? = nil,
        includeHidden: Bool? = false,
        maxResults: UInt32? = 1000,
        page: UInt32? = 0,
        pageSize: UInt32? = 50
    ) {
        self.projectDirectory = projectDirectory
        self.globPatterns = globPatterns
        self.regexPattern = regexPattern
        self.fileNamePattern = fileNamePattern
        self.contentPattern = contentPattern
        self.fileTypes = fileTypes
        self.excludePatterns = excludePatterns
        self.maxFileSize = maxFileSize
        self.includeHidden = includeHidden
        self.maxResults = maxResults
        self.page = page
        self.pageSize = pageSize
    }

    var cacheKey: String {
        let components = [
            projectDirectory.hashValue,
            fileNamePattern?.hashValue ?? 0,
            contentPattern?.hashValue ?? 0,
            fileTypes?.joined(separator: ",").hashValue ?? 0
        ]
        return components.map(String.init).joined(separator: "_")
    }
}

public struct FileSearchResponse: Codable {
    public let files: [FileInfo]
    public let totalCount: UInt32
    public let page: UInt32
    public let pageSize: UInt32
    public let hasMore: Bool
    public let searchTimeMs: UInt64
}

public struct FileInfo: Codable, Identifiable, Equatable {
    public init?(from dict: [String: Any]) {
        guard let path = dict["path"] as? String,
              let name = dict["name"] as? String else {
            return nil
        }
        self.id = path
        self.path = path
        self.relativePath = dict["relativePath"] as? String ?? path
        self.name = name
        self.size = (dict["size"] as? UInt64) ?? 0
        self.modifiedAt = (dict["modifiedAt"] as? Int64) ?? 0
        self.createdAt = dict["createdAt"] as? Int64
        self.fileType = (dict["fileType"] as? String) ?? "file"
        self.fileExtension = dict["fileExtension"] as? String
        self.isDirectory = (dict["isDirectory"] as? Bool) ?? false
        self.isHidden = (dict["isHidden"] as? Bool) ?? false
        self.isBinary = dict["isBinary"] as? Bool
        self.permissions = FilePermissions(readable: true, writable: true, executable: false)
        self.contentPreview = dict["contentPreview"] as? String
        self.matchInfo = nil
    }

    public let id: String
    public let path: String
    public let relativePath: String
    public let name: String
    public let size: UInt64
    public let modifiedAt: Int64
    public let createdAt: Int64?
    public let fileType: String
    public let fileExtension: String?
    public let isDirectory: Bool
    public let isHidden: Bool
    public let isBinary: Bool?
    public let permissions: FilePermissions
    public let contentPreview: String?
    public let matchInfo: MatchInfo?

    private enum CodingKeys: String, CodingKey {
        case id
        case path
        case relativePath
        case name
        case size
        case modifiedAt
        case createdAt
        case fileType
        case fileExtension = "extension"
        case isDirectory
        case isHidden
        case isBinary
        case permissions
        case contentPreview
        case matchInfo
    }

    public var formattedSize: String {
        ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
    }

    public var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(modifiedAt))
        return DateFormatter.medium.string(from: date)
    }

    public var icon: String {
        if isDirectory {
            return "folder"
        }

        switch fileType.lowercased() {
        case "rust": return "swift"
        case "javascript", "typescript": return "doc.text"
        case "python": return "doc.text"
        case "markdown": return "doc.richtext"
        case "json": return "doc.text"
        case "image": return "photo"
        case "binary": return "doc.binary"
        default: return "doc"
        }
    }
}

public struct FilePermissions: Codable, Equatable {
    public let readable: Bool
    public let writable: Bool
    public let executable: Bool
}

public struct MatchInfo: Codable, Equatable {
    public let matchType: MatchType
    public let matchCount: UInt32
    public let lineMatches: [LineMatch]?
    public let relevanceScore: Float
}

public enum MatchType: String, Codable {
    case fileName
    case fileContent
    case both
}

public struct LineMatch: Codable, Equatable {
    public let lineNumber: UInt32
    public let lineContent: String
    public let matchStart: UInt32
    public let matchEnd: UInt32
    public let contextBefore: String?
    public let contextAfter: String?
}

public struct FileContentRequest: Codable {
    public let filePath: String
    public let projectDirectory: String
    public let previewLines: UInt32?
    public let startLine: UInt32?
    public let endLine: UInt32?
    public let encoding: String?

    public init(
        filePath: String,
        projectDirectory: String,
        previewLines: UInt32? = nil,
        startLine: UInt32? = nil,
        endLine: UInt32? = nil,
        encoding: String? = "utf-8"
    ) {
        self.filePath = filePath
        self.projectDirectory = projectDirectory
        self.previewLines = previewLines
        self.startLine = startLine
        self.endLine = endLine
        self.encoding = encoding
    }
}

public struct FileContentResponse: Codable {
    public let content: String
    public let isTruncated: Bool
    public let totalLines: UInt32
    public let encoding: String
    public let fileInfo: FileInfo
    public let isBinary: Bool
}

public struct DirectoryListRequest: Codable {
    public let directoryPath: String
    public let projectDirectory: String
    public let includeFiles: Bool?
    public let includeDirectories: Bool?
    public let includeHidden: Bool?
    public let recursive: Bool?
    public let maxDepth: UInt32?
    public let fileTypes: [String]?
    public let sortBy: DirectorySortBy?
    public let sortOrder: SortOrder?

    public init(
        directoryPath: String,
        projectDirectory: String,
        includeFiles: Bool? = true,
        includeDirectories: Bool? = true,
        includeHidden: Bool? = false,
        recursive: Bool? = false,
        maxDepth: UInt32? = 3,
        fileTypes: [String]? = nil,
        sortBy: DirectorySortBy? = .name,
        sortOrder: SortOrder? = .asc
    ) {
        self.directoryPath = directoryPath
        self.projectDirectory = projectDirectory
        self.includeFiles = includeFiles
        self.includeDirectories = includeDirectories
        self.includeHidden = includeHidden
        self.recursive = recursive
        self.maxDepth = maxDepth
        self.fileTypes = fileTypes
        self.sortBy = sortBy
        self.sortOrder = sortOrder
    }
}

public struct DirectoryListResponse: Codable {
    public let files: [FileInfo]
    public let directories: [FileInfo]
    public let totalFiles: UInt32
    public let totalDirectories: UInt32
    public let currentPath: String
    public let parentPath: String?
}

public enum DirectorySortBy: String, Codable, CaseIterable {
    case name
    case size
    case modifiedAt
    case type
}

public struct FileMetadataRequest: Codable {
    public let filePaths: [String]
    public let projectDirectory: String
    public let includeContentInfo: Bool?

    public init(
        filePaths: [String],
        projectDirectory: String,
        includeContentInfo: Bool? = false
    ) {
        self.filePaths = filePaths
        self.projectDirectory = projectDirectory
        self.includeContentInfo = includeContentInfo
    }
}

public struct FileMetadataResponse: Codable {
    public let files: [FileMetadata]
    public let notFound: [String]
    public let accessDenied: [String]
}

public struct FileMetadata: Codable {
    public let path: String
    public let info: FileInfo
    public let contentInfo: ContentInfo?
    public let gitInfo: GitFileInfo?
}

public struct ContentInfo: Codable {
    public let lineCount: UInt32
    public let wordCount: UInt32
    public let characterCount: UInt32
    public let encoding: String
    public let language: String?
    public let hasBom: Bool
    public let lineEndings: LineEndingType
}

public enum LineEndingType: String, Codable {
    case unix
    case windows
    case mac
    case mixed
}

public struct GitFileInfo: Codable {
    public let isTracked: Bool
    public let status: String?
    public let lastCommit: String?
    public let lastModifiedBy: String?
    public let branch: String?
}

public struct PathValidationRequest: Codable {
    public let path: String
    public let projectDirectory: String
    public let operation: PathOperation

    public init(path: String, projectDirectory: String, operation: PathOperation) {
        self.path = path
        self.projectDirectory = projectDirectory
        self.operation = operation
    }
}

public enum PathOperation: String, Codable {
    case read
    case write
    case execute
    case delete
}

public struct PathValidationResponse: Codable {
    public let isValid: Bool
    public let isSafe: Bool
    public let normalizedPath: String
    public let issues: [PathIssue]
    public let permissions: FilePermissions
}

public struct PathIssue: Codable {
    public let issueType: PathIssueType
    public let message: String
    public let severity: IssueSeverity
}

public enum PathIssueType: String, Codable {
    case outsideProject
    case accessDenied
    case doesNotExist
    case invalidCharacters
    case tooLong
    case symlinkLoop
    case insecurePath
}

public enum IssueSeverity: String, Codable {
    case error
    case warning
    case info
}
