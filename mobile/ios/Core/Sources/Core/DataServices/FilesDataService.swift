import Foundation
import Combine

/// Service for accessing file system data from desktop
@MainActor
public final class FilesDataService: ObservableObject {

    // MARK: - Published Properties
    @Published public var files: [FileInfo] = []
    @Published public var isLoading = false
    @Published public var error: DataServiceError?
    @Published public var searchResults: [FileInfo] = []

    // MARK: - Private Properties
    private let apiClient: APIClientProtocol
    private let cacheManager: CacheManager
    private var cancellables = Set<AnyCancellable>()
    private let serverRelayClient: ServerRelayClient?

    // MARK: - Initialization
    public init(apiClient: APIClientProtocol = APIClient.shared, cacheManager: CacheManager = CacheManager.shared) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        self.serverRelayClient = nil
    }

    public init(apiClient: APIClientProtocol = APIClient.shared, cacheManager: CacheManager = CacheManager.shared, serverRelayClient: ServerRelayClient) {
        self.apiClient = apiClient
        self.cacheManager = cacheManager
        self.serverRelayClient = serverRelayClient
    }

    // MARK: - Public Methods

    /// Search files with various filters and patterns
    public func searchFiles(query: String, maxResults: Int = 50, includeContent: Bool = false, projectDirectory: String) async throws -> [FileInfo] {
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
            if let result = response.result?.value as? [String: Any],
               let files = result["files"] as? [[String: Any]] {
                return files.compactMap { dict in
                    FileInfo(from: dict)
                }
            }
            if let error = response.error {
                throw DataServiceError.serverError(error.message)
            }
        }
        return []
    }

    /// Search files with various filters and patterns (legacy publisher version)
    public func searchFiles(request: FileSearchRequest) -> AnyPublisher<FileSearchResponse, DataServiceError> {
        isLoading = true
        error = nil

        let cacheKey = "files_search_\(request.cacheKey)"

        // Try cache first for recent searches
        if let cached: FileSearchResponse = cacheManager.get(key: cacheKey) {
            isLoading = false
            searchResults = cached.files
            return Just(cached)
                .setFailureType(to: DataServiceError.self)
                .eraseToAnyPublisher()
        }

        return apiClient.request(
            endpoint: .searchFiles,
            method: .POST,
            body: request
        )
        .decode(type: FileSearchResponse.self, decoder: JSONDecoder.apiDecoder)
        .map { [weak self] response in
            self?.searchResults = response.files
            self?.cacheManager.set(response, forKey: cacheKey, ttl: 180) // 3 min cache
            return response
        }
        .handleEvents(
            receiveOutput: { [weak self] _ in self?.isLoading = false },
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    self?.error = DataServiceError.networkError(error)
                }
            }
        )
        .mapError { DataServiceError.networkError($0) }
        .eraseToAnyPublisher()
    }

    /// Get file content with preview support
    public func getFileContent(request: FileContentRequest) -> AnyPublisher<FileContentResponse, DataServiceError> {
        let cacheKey = "file_content_\(request.filePath.hashValue)"

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
        let cacheKey = "directory_\(request.directoryPath.hashValue)"

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
    public func searchByFileName(_ fileName: String, in projectDirectory: String) -> AnyPublisher<[FileInfo], DataServiceError> {
        let request = FileSearchRequest(
            projectDirectory: projectDirectory,
            fileNamePattern: fileName,
            maxResults: 100
        )

        return searchFiles(request: request)
            .map(\.files)
            .eraseToAnyPublisher()
    }

    /// Search for files by extension
    public func searchByExtension(_ extension: String, in projectDirectory: String) -> AnyPublisher<[FileInfo], DataServiceError> {
        let request = FileSearchRequest(
            projectDirectory: projectDirectory,
            fileTypes: [`extension`],
            maxResults: 200
        )

        return searchFiles(request: request)
            .map(\.files)
            .eraseToAnyPublisher()
    }

    /// Search file contents with regex
    public func searchContent(_ pattern: String, in projectDirectory: String) -> AnyPublisher<[FileInfo], DataServiceError> {
        let request = FileSearchRequest(
            projectDirectory: projectDirectory,
            contentPattern: pattern,
            maxResults: 100
        )

        return searchFiles(request: request)
            .map(\.files)
            .eraseToAnyPublisher()
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
        let defaultProjectDirectory = "/path/to/project"
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
                            "sessionId": AnyCodable(sessionId)
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
                            "sessionId": AnyCodable(sessionId),
                            "query": AnyCodable(query)
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

    // MARK: - Cache Management

    public func invalidateCache() {
        cacheManager.invalidatePattern("files_")
        cacheManager.invalidatePattern("file_content_")
        cacheManager.invalidatePattern("directory_")
    }

    public func preloadProjectFiles(projectDirectory: String) {
        let request = FileSearchRequest(
            projectDirectory: projectDirectory,
            excludePatterns: ["node_modules/**", ".git/**", "target/**"],
            maxResults: 500
        )

        searchFiles(request: request)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] response in
                    self?.files = response.files
                }
            )
            .store(in: &cancellables)
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

public struct FileInfo: Codable, Identifiable {
    init?(from dict: [String: Any]) {
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

public struct FilePermissions: Codable {
    public let readable: Bool
    public let writable: Bool
    public let executable: Bool
}

public struct MatchInfo: Codable {
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

public struct LineMatch: Codable {
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
