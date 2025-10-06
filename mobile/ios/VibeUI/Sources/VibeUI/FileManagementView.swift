import SwiftUI
import Core

public struct FileManagementView: View {
    @EnvironmentObject private var container: AppContainer
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var searchResults: [FileSearchResult] = []
    @State private var errorMessage: String?
    @State private var isLoading = false

    public init() {}

    public var body: some View {
        VStack(spacing: 20) {
            // Header
            AppHeaderBar(
                title: "Files",
                subtitle: "Find and manage project files"
            )

                // Action Buttons
                HStack(spacing: 16) {
                    ActionButton(
                        title: "Find Relevant Files",
                        subtitle: "Discover files related to your task",
                        icon: "doc.text.magnifyingglass",
                        color: Color.primary
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
                            .foregroundColor(Color.mutedForeground)

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
                            .foregroundColor(Color.mutedForeground)
                            .font(.caption)
                        }
                    }
                    .padding(12)
                    .background(Color.card)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.border, lineWidth: 1)
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
                                .progressViewStyle(CircularProgressViewStyle(tint: Color.primary))
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
                                .h4()
                                .foregroundColor(Color.cardForeground)

                            Spacer()

                            Text("\(searchResults.count) files found")
                                .small()
                                .foregroundColor(Color.mutedForeground)
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
                            .foregroundColor(Color.mutedForeground)

                        VStack(spacing: 8) {
                            Text("No Files Found")
                                .h4()
                                .foregroundColor(Color.cardForeground)

                            Text("Try different search terms or use the workflow buttons above to find relevant files.")
                                .paragraph()
                                .foregroundColor(Color.mutedForeground)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(.vertical)
                }

                Spacer()
            }
            .padding()
    }

    private func startFileFinderWorkflow() {
        Task {
            await executeFileFinderWorkflow()
        }
    }

    private func startWebSearchWorkflow() {
        Task {
            await executeWebSearchWorkflow()
        }
    }

    private func executeFileFinderWorkflow() async {
        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        do {
            let sessionId = container.sessionService.currentSessionId ?? "mobile-session"

            for try await result in container.filesService.startFileFinderWorkflow(sessionId: sessionId) {
                await MainActor.run {
                    if let resultDict = result as? [String: Any],
                       let jobId = resultDict["jobId"] as? String {
                        errorMessage = nil
                    }
                }
            }

            await MainActor.run {
                isLoading = false
            }

        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
                isLoading = false
            }
        }
    }

    private func executeWebSearchWorkflow() async {
        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        do {
            let sessionId = container.sessionService.currentSessionId ?? "mobile-session"

            for try await result in container.filesService.startWebSearchWorkflow(sessionId: sessionId, query: "Find relevant files for mobile app") {
                await MainActor.run {
                    if let resultDict = result as? [String: Any],
                       let jobId = resultDict["jobId"] as? String {
                        errorMessage = nil
                    }
                }
            }

            await MainActor.run {
                isLoading = false
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
        await MainActor.run {
            isLoading = true
            errorMessage = nil
            searchResults = []
        }

        do {
            let projectDirectory = "/path/to/project"
            let results = try await container.filesService.searchFiles(
                query: query,
                maxResults: 50,
                includeContent: true,
                projectDirectory: projectDirectory
            )

            await MainActor.run {
                searchResults = results.compactMap { fileInfo in
                    var dict: [String: Any] = [
                        "path": fileInfo.path,
                        "name": fileInfo.name,
                        "size": fileInfo.size,
                        "modifiedAt": Double(fileInfo.modifiedAt)
                    ]
                    if let preview = fileInfo.contentPreview {
                        dict["contentSnippet"] = preview
                    }
                    return FileSearchResult.from(dictionary: dict)
                }
                isLoading = false
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
                        .h4()
                        .foregroundColor(Color.cardForeground)
                        .multilineTextAlignment(.center)

                    Text(subtitle)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(Color.card)
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
                    HStack {
                        Text(result.name)
                            .h4()
                            .foregroundColor(Color.cardForeground)

                        Spacer()

                        if let relevanceScore = result.relevanceScore {
                            Text(String(format: "%.2f", relevanceScore))
                                .small()
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.primary.opacity(0.1))
                                .foregroundColor(Color.primary)
                                .cornerRadius(4)
                        }
                    }

                    Text(result.path)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .lineLimit(1)
                }

                if let size = result.size {
                    Text(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file))
                        .small()
                        .foregroundColor(Color.mutedForeground)
                }
            }

            if let snippet = result.contentSnippet, !snippet.isEmpty {
                Text(snippet)
                    .small()
                    .foregroundColor(Color.mutedForeground)
                    .lineLimit(3)
                    .padding(.leading, 28)
                    .padding(.top, 4)
            }
        }
        .padding(12)
        .background(Color.card)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.border, lineWidth: 1)
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
            return Color.warning
        case "js", "ts":
            return Color.warning
        case "py":
            return Color.primary
        case "json":
            return Color.success
        default:
            return Color.mutedForeground
        }
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