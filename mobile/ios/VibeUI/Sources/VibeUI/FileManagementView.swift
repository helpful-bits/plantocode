import SwiftUI
import Core

public struct FileManagementView: View {
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var searchResults: [FileSearchResult] = []
    @State private var errorMessage: String?
    @State private var isLoading = false

    public init() {}

    public var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("File Management")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(Color("CardForeground"))

                    Text("Find and manage project files")
                        .font(.body)
                        .foregroundColor(Color("MutedForeground"))
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Action Buttons
                HStack(spacing: 16) {
                    ActionButton(
                        title: "Find Relevant Files",
                        subtitle: "Discover files related to your task",
                        icon: "doc.magnifyingglass",
                        color: Color("Primary")
                    ) {
                        startFileFinderWorkflow()
                    }

                    ActionButton(
                        title: "Deep Research",
                        subtitle: "Search web for related information",
                        icon: "globe",
                        color: Color("Secondary")
                    ) {
                        startWebSearchWorkflow()
                    }
                }

                // Search Bar
                VStack(spacing: 16) {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(Color("MutedForeground"))

                        TextField("Search files...", text: $searchText)
                            .textFieldStyle(PlainTextFieldStyle())
                            .onSubmit {
                                performSearch()
                            }

                        if !searchText.isEmpty {
                            Button("Clear") {
                                searchText = ""
                                searchResults = []
                            }
                            .foregroundColor(Color("MutedForeground"))
                            .font(.caption)
                        }
                    }
                    .padding(12)
                    .background(Color("Card"))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color("Border"), lineWidth: 1)
                    )

                    HStack {
                        Button("Search") {
                            performSearch()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)

                        Spacer()

                        if isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Color("Primary")))
                                .scaleEffect(0.8)
                        }
                    }
                }

                // Error Message
                if let errorMessage = errorMessage {
                    StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                }

                // Search Results
                if !searchResults.isEmpty {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("Search Results")
                                .font(.headline)
                                .foregroundColor(Color("CardForeground"))

                            Spacer()

                            Text("\(searchResults.count) files found")
                                .font(.caption)
                                .foregroundColor(Color("MutedForeground"))
                        }

                        LazyVStack(spacing: 8) {
                            ForEach(searchResults, id: \.path) { result in
                                FileResultRow(result: result)
                            }
                        }
                    }
                }

                if searchResults.isEmpty && !searchText.isEmpty && !isLoading {
                    VStack(spacing: 16) {
                        Image(systemName: "doc.questionmark")
                            .font(.system(size: 48))
                            .foregroundColor(Color("MutedForeground"))

                        VStack(spacing: 8) {
                            Text("No Files Found")
                                .font(.headline)
                                .foregroundColor(Color("CardForeground"))

                            Text("Try different search terms or use the workflow buttons above to find relevant files.")
                                .font(.body)
                                .foregroundColor(Color("MutedForeground"))
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(.vertical)
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Files")
    }

    private func startFileFinderWorkflow() {
        Task {
            await executeWorkflow("file_finder")
        }
    }

    private func startWebSearchWorkflow() {
        Task {
            await executeWorkflow("web_search")
        }
    }

    private func executeWorkflow(_ workflowType: String) async {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            await MainActor.run {
                errorMessage = "No active device connection"
            }
            return
        }

        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        let method = workflowType == "file_finder" ? "workflows.startFileFinder" : "workflows.startWebSearch"
        let request = RpcRequest(
            method: method,
            params: [
                "sessionId": AnyCodable("mobile-session"), // TODO: Get actual session ID
                "taskDescription": AnyCodable("Find relevant files for mobile app"),
                "projectDirectory": AnyCodable("/path/to/project"), // TODO: Get actual project directory
                "excludedPaths": AnyCodable(["node_modules", ".git", "target", "build"]),
                "timeoutMs": AnyCodable(60000)
            ]
        )

        do {
            var workflowResult: [String: Any]?

            for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                if let error = response.error {
                    await MainActor.run {
                        errorMessage = "Workflow error: \(error.message)"
                        isLoading = false
                    }
                    return
                }

                if let result = response.result?.value as? [String: Any] {
                    workflowResult = result
                    if response.isFinal {
                        break
                    }
                }
            }

            await MainActor.run {
                isLoading = false
                if let result = workflowResult {
                    // Handle workflow completion
                    if let jobId = result["jobId"] as? String {
                        // Could navigate to job status view or show success message
                        errorMessage = nil
                    }
                }
            }

        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                isLoading = false
            }
        }
    }

    private func performSearch() {
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }

        Task {
            await searchFiles(query: searchText)
        }
    }

    private func searchFiles(query: String) async {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            await MainActor.run {
                errorMessage = "No active device connection"
            }
            return
        }

        await MainActor.run {
            isLoading = true
            errorMessage = nil
            searchResults = []
        }

        let request = RpcRequest(
            method: "files.search",
            params: [
                "projectDirectory": AnyCodable("/path/to/project"), // TODO: Get actual project directory
                "query": AnyCodable(query),
                "includeContent": AnyCodable(true),
                "maxResults": AnyCodable(50)
            ]
        )

        do {
            var searchData: [String: Any]?

            for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
                if let error = response.error {
                    await MainActor.run {
                        errorMessage = "Search error: \(error.message)"
                        isLoading = false
                    }
                    return
                }

                if let result = response.result?.value as? [String: Any] {
                    searchData = result
                    if response.isFinal {
                        break
                    }
                }
            }

            await MainActor.run {
                isLoading = false
                if let data = searchData,
                   let files = data["files"] as? [[String: Any]] {
                    searchResults = files.compactMap { fileData in
                        FileSearchResult.from(dictionary: fileData)
                    }
                }
            }

        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                isLoading = false
            }
        }
    }
}

private struct ActionButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 32))
                    .foregroundColor(color)

                VStack(spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundColor(Color("CardForeground"))
                        .multilineTextAlignment(.center)

                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(Color("MutedForeground"))
                        .multilineTextAlignment(.center)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(Color("Card"))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.3), lineWidth: 1)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

private struct FileResultRow: View {
    let result: FileSearchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: fileIcon)
                    .font(.title3)
                    .foregroundColor(fileIconColor)

                VStack(alignment: .leading, spacing: 2) {
                    Text(result.name)
                        .font(.headline)
                        .foregroundColor(Color("CardForeground"))

                    Text(result.path)
                        .font(.caption)
                        .foregroundColor(Color("MutedForeground"))
                        .lineLimit(1)
                }

                Spacer()

                if let size = result.size {
                    Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                        .font(.caption2)
                        .foregroundColor(Color("MutedForeground"))
                }
            }

            if let snippet = result.contentSnippet, !snippet.isEmpty {
                Text(snippet)
                    .font(.caption)
                    .foregroundColor(Color("MutedForeground"))
                    .lineLimit(2)
                    .padding(.leading, 28)
            }
        }
        .padding(12)
        .background(Color("Card"))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color("Border"), lineWidth: 1)
        )
    }

    private var fileIcon: String {
        let ext = (result.name as NSString).pathExtension.lowercased()
        switch ext {
        case "swift", "js", "ts", "py", "java", "cpp", "c", "h":
            return "doc.text"
        case "json", "xml", "yml", "yaml":
            return "doc.plaintext"
        case "md", "txt":
            return "doc.text"
        case "png", "jpg", "jpeg", "gif":
            return "photo"
        case "pdf":
            return "doc.pdf"
        default:
            return "doc"
        }
    }

    private var fileIconColor: Color {
        let ext = (result.name as NSString).pathExtension.lowercased()
        switch ext {
        case "swift":
            return .orange
        case "js", "ts":
            return .yellow
        case "py":
            return .blue
        case "json":
            return .green
        default:
            return Color("MutedForeground")
        }
    }
}

private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Color("Primary"))
            .foregroundColor(.white)
            .cornerRadius(8)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// Supporting Types
public struct FileSearchResult {
    public let path: String
    public let name: String
    public let size: UInt64?
    public let modifiedAt: Date?
    public let contentSnippet: String?
    public let relevanceScore: Double?

    public static func from(dictionary: [String: Any]) -> FileSearchResult? {
        guard let path = dictionary["path"] as? String else {
            return nil
        }

        let name = (path as NSString).lastPathComponent
        let size = dictionary["size"] as? UInt64
        let modifiedAt = (dictionary["modifiedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
        let contentSnippet = dictionary["contentSnippet"] as? String
        let relevanceScore = dictionary["relevanceScore"] as? Double

        return FileSearchResult(
            path: path,
            name: name,
            size: size,
            modifiedAt: modifiedAt,
            contentSnippet: contentSnippet,
            relevanceScore: relevanceScore
        )
    }
}

#Preview {
    FileManagementView()
}