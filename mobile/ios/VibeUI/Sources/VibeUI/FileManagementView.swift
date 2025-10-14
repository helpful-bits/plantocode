import SwiftUI
import Core

public struct FileManagementView: View {
    @EnvironmentObject private var container: AppContainer
    @ObservedObject private var filesService: FilesDataService
    @StateObject private var multiConnectionManager = MultiConnectionManager.shared
    @State private var searchText = ""
    @State private var files: [FileInfo] = []
    @State private var includedFilesNotInList: [String] = [] // Files that are included but not in current file list
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var localSearchTerm: String = ""
    @State private var searchDebounceTimer: Timer?
    @State private var refreshTrigger = UUID()
    @State private var findFilesError: String? = nil
    @State private var runningWorkflowCount: Int = 0
    @State private var hasLoadedFiles: Bool = false
    @State private var lastLoadedProjectDir: String? = nil

    public init(filesService: FilesDataService) {
        self.filesService = filesService
    }

    private var sessionService: SessionDataService {
        container.sessionService
    }

    public var body: some View {
        let _ = refreshTrigger // Force view dependency
        let includedSet = Set(container.sessionService.currentSession?.includedFiles ?? [])
        let excludedSet = Set(container.sessionService.currentSession?.forceExcludedFiles ?? [])

        let displayedFiles = files
            .filter { file in
                let matchesSearch = localSearchTerm.isEmpty || file.path.lowercased().contains(localSearchTerm.lowercased())
                let matchesFilter = filesService.currentFilterMode == "all" ||
                                   (filesService.currentFilterMode == "selected" && includedSet.contains(file.path) && !excludedSet.contains(file.path))
                return matchesSearch && matchesFilter
            }
            .sorted { lhs, rhs in
                switch filesService.currentSortBy {
                case "size":
                    return filesService.currentSortOrder == "asc" ? lhs.size < rhs.size : lhs.size > rhs.size
                case "modified":
                    return filesService.currentSortOrder == "asc" ? lhs.modifiedAt < rhs.modifiedAt : lhs.modifiedAt > rhs.modifiedAt
                default: // "name"
                    return filesService.currentSortOrder == "asc" ?
                           lhs.path.localizedCompare(rhs.path) == .orderedAscending :
                           lhs.path.localizedCompare(rhs.path) == .orderedDescending
                }
            }

        return VStack(spacing: 0) {
            connectedView
        }
        .onAppear {
            // Only load files once per project directory
            let currentProjectDir = container.sessionService.currentSession?.projectDirectory
                ?? container.currentProject?.directory

            if !hasLoadedFiles || lastLoadedProjectDir != currentProjectDir {
                if isConnected {
                    loadFiles()
                }
                lastLoadedProjectDir = currentProjectDir
            }
            updateIncludedFilesNotInList()
            updateRunningWorkflowCount()
        }
        .onReceive(filesService.$currentSearchTerm) { newValue in
            if newValue != localSearchTerm {
                localSearchTerm = newValue
            }
        }
        .onChange(of: files) { _ in
            updateIncludedFilesNotInList()
        }
        .onChange(of: container.sessionService.currentSession?.includedFiles) { _ in
            updateIncludedFilesNotInList()
        }
        .onReceive(container.sessionService.$currentSession) { session in
            // Only reload files if project directory changed
            let newProjectDir = session?.projectDirectory
            if lastLoadedProjectDir != newProjectDir && newProjectDir != nil {
                lastLoadedProjectDir = newProjectDir
                loadFiles()
            }
            updateRunningWorkflowCount()
        }
        .onReceive(container.jobsService.$jobs) { _ in
            // Update workflow count whenever jobs change (real-time updates)
            updateRunningWorkflowCount()
        }
    }

    @ViewBuilder
    private var connectedView: some View {
        VStack(spacing: 0) {
            searchAndFilterSection

            Divider()

            fileListContent
        }

        // Error Message Overlay
        if let errorMessage = errorMessage {
            VStack {
                StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                    .padding()
                Spacer()
            }
        }

        if let findFilesError = findFilesError {
            VStack {
                StatusAlertView(variant: .destructive, title: "Error", message: findFilesError)
                    .padding()
                Spacer()
            }
        }
    }

    @ViewBuilder
    private var searchAndFilterSection: some View {
        VStack(spacing: Theme.Spacing.md) {
            searchBarWithSort
            actionButtons
        }
        .padding(.horizontal)
        .padding(.top, Theme.Spacing.sm)
        .padding(.bottom, Theme.Spacing.md)
        .background(Color.muted)
    }

    private var searchBarWithSort: some View {
        HStack(spacing: Theme.Spacing.sm) {
            // Search input
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.mutedForeground)
                    .frame(width: 20)

                TextField("Filter files...", text: $localSearchTerm)
                    .textFieldStyle(PlainTextFieldStyle())
                    .onChange(of: localSearchTerm) { newValue in
                        searchDebounceTimer?.invalidate()
                        searchDebounceTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in
                            filesService.currentSearchTerm = newValue
                        }
                    }

                if !localSearchTerm.isEmpty {
                    Button(action: {
                        localSearchTerm = ""
                        filesService.currentSearchTerm = ""
                    }) {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .buttonStyle(CompactIconButtonStyle())
                }
            }
            .padding(Theme.Spacing.cardPadding)
            .background(Color.input)
            .cornerRadius(10)

            // Sort controls inline
            sortControls
        }
    }

    private var sortControls: some View {
        HStack(spacing: Theme.Spacing.xs) {
            Menu {
                Button("Name") { filesService.currentSortBy = "name" }
                Button("Size") { filesService.currentSortBy = "size" }
                Button("Modified") { filesService.currentSortBy = "modified" }
            } label: {
                HStack(spacing: 4) {
                    Text(filesService.currentSortBy.capitalized)
                        .font(.system(size: 13))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9))
                }
                .foregroundColor(Color.foreground)
                .padding(.horizontal, Theme.Spacing.sm)
                .padding(.vertical, Theme.Spacing.itemSpacing)
                .background(Color.card)
                .cornerRadius(8)
            }

            Button(action: {
                filesService.currentSortOrder = filesService.currentSortOrder == "asc" ? "desc" : "asc"
            }) {
                Image(systemName: filesService.currentSortOrder == "asc" ? "arrow.up" : "arrow.down")
                    .font(.system(size: 13))
            }
            .buttonStyle(IconButtonStyle())
        }
    }

    private var actionButtons: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.sm) {
                ActionButton(title: "Select All", systemImage: "checkmark.circle") {
                    selectAllFiltered()
                }

                ActionButton(title: "Deselect All", systemImage: "circle") {
                    deselectAllFiltered()
                }

                ActionButton(title: "Exclude All", systemImage: "minus.circle") {
                    excludeAllFiltered()
                }

                ActionButton(title: "Clear Excludes", systemImage: "arrow.uturn.left.circle") {
                    unexcludeAllFiltered()
                }
            }
        }
    }

    @ViewBuilder
    private var fileListContent: some View {
        if isLoading {
            loadingView
        } else if !files.isEmpty || !includedFilesNotInList.isEmpty {
            filesList
        } else {
            emptyStateView
        }
    }

    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .accentColor))
                .scaleEffect(0.8)
            Text("Loading files...")
                .small()
                .foregroundColor(.secondary)
                .padding(.top, Theme.Spacing.sm)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var filesList: some View {
        ScrollView {
            LazyVStack(spacing: Theme.Spacing.xs) {
                fileCountHeader
                selectedFilesSection
                searchResultsSection
            }
            .padding(.vertical, Theme.Spacing.sm)
        }
        .background(Color.background)
        .scrollDismissesKeyboard(.interactively)
    }

    private var fileCountHeader: some View {
        let includedSet = Set(container.sessionService.currentSession?.includedFiles ?? [])
        let excludedSet = Set(container.sessionService.currentSession?.forceExcludedFiles ?? [])

        let allFilesCount = files.count + includedFilesNotInList.count
        let selectedFilesCount = includedSet.count

        return HStack(spacing: Theme.Spacing.sm) {
            // All/Selected Filter Picker with counts
            Picker("Filter", selection: $filesService.currentFilterMode) {
                Text("All (\(allFilesCount))").tag("all")
                Text("Selected (\(selectedFilesCount))").tag("selected")
            }
            .pickerStyle(SegmentedPickerStyle())

            // Find Files Button
            Button(action: {
                if !isConnected {
                    findFilesError = "No active device connection"
                    return
                }
                guard let session = container.sessionService.currentSession else {
                    findFilesError = "No active session"
                    return
                }
                guard !session.projectDirectory.isEmpty else {
                    findFilesError = "Missing project directory"
                    return
                }

                // Launch workflow directly
                Task {
                    do {
                        // Fetch latest session data from server
                        guard let refreshedSession = try await container.sessionService.getSession(id: session.id) else {
                            await MainActor.run {
                                findFilesError = "Session not found"
                            }
                            return
                        }

                        guard let taskDesc = refreshedSession.taskDescription,
                              !taskDesc.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                              taskDesc.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10 else {
                            await MainActor.run {
                                findFilesError = "Task description must be at least 10 characters. Please add a task description first."
                            }
                            return
                        }

                        await MainActor.run {
                            findFilesError = nil
                        }

                        let stream = container.filesService.startFindFiles(
                            sessionId: refreshedSession.id,
                            taskDescription: taskDesc,
                            projectDirectory: refreshedSession.projectDirectory,
                            excludedPaths: refreshedSession.forceExcludedFiles ?? []
                        )

                        // Update count after launching
                        await MainActor.run {
                            updateRunningWorkflowCount()
                        }

                        var suggestionPaths: [String] = []
                        for try await event in stream {
                            switch event {
                            case .suggestions(let list):
                                suggestionPaths.append(contentsOf: list.map { $0.path })
                            case .completed:
                                // Auto-apply suggestions to session
                                if !suggestionPaths.isEmpty {
                                    try? await container.sessionService.updateSessionFiles(
                                        sessionId: refreshedSession.id,
                                        addIncluded: suggestionPaths,
                                        removeIncluded: nil,
                                        addExcluded: nil,
                                        removeExcluded: suggestionPaths
                                    )
                                }
                                // Update count when complete
                                await MainActor.run {
                                    updateRunningWorkflowCount()
                                }
                            case .error(let msg):
                                await MainActor.run {
                                    findFilesError = msg
                                    updateRunningWorkflowCount()
                                }
                            default:
                                break
                            }
                        }
                    } catch {
                        await MainActor.run {
                            findFilesError = "Failed to run workflow: \(error.localizedDescription)"
                            updateRunningWorkflowCount()
                        }
                    }
                }
            }) {
                HStack {
                    Image(systemName: "sparkles")
                    if runningWorkflowCount == 0 {
                        Text("Find Files")
                            .lineLimit(1)
                    } else {
                        Text("Find Files (\(runningWorkflowCount))")
                            .lineLimit(1)
                    }
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!isConnected || container.sessionService.currentSession == nil)
        }
        .padding(.horizontal)
        .padding(.vertical, Theme.Spacing.sm)
    }

    @ViewBuilder
    private var selectedFilesSection: some View {
        if !includedFilesNotInList.isEmpty {
            let excludedSet = Set(container.sessionService.currentSession?.forceExcludedFiles ?? [])

            Section {
                ForEach(includedFilesNotInList, id: \.self) { filePath in
                    if let file = FileInfo(from: [
                        "path": filePath,
                        "name": URL(fileURLWithPath: filePath).lastPathComponent,
                        "relativePath": URL(fileURLWithPath: filePath).deletingLastPathComponent().path,
                        "fileExtension": URL(fileURLWithPath: filePath).pathExtension,
                        "size": UInt64(0),
                        "modifiedAt": Int64(0),
                        "isBinary": false
                    ]) {
                        FileManagementRowView(
                            file: file,
                            isIncluded: true,
                            isExcluded: excludedSet.contains(filePath),
                            onIncludeToggle: { toggleInclude(filePath) },
                            onExcludeToggle: { toggleExclude(filePath) }
                        )
                        .padding(.horizontal)
                    }
                }
            } header: {
                HStack {
                    Text("Selected Files")
                        .small()
                        .foregroundColor(.secondary)
                        .fontWeight(.medium)
                    Spacer()
                }
                .padding(.horizontal)
                .padding(.vertical, Theme.Spacing.xs)
            }
        }
    }

    private var searchResultsSection: some View {
        let includedSet = Set(container.sessionService.currentSession?.includedFiles ?? [])
        let excludedSet = Set(container.sessionService.currentSession?.forceExcludedFiles ?? [])

        let displayedFiles = files
            .filter { file in
                let matchesSearch = localSearchTerm.isEmpty || file.path.lowercased().contains(localSearchTerm.lowercased())
                let matchesFilter = filesService.currentFilterMode == "all" ||
                                   (filesService.currentFilterMode == "selected" && includedSet.contains(file.path) && !excludedSet.contains(file.path))
                return matchesSearch && matchesFilter
            }
            .sorted { lhs, rhs in
                switch filesService.currentSortBy {
                case "size":
                    return filesService.currentSortOrder == "asc" ? lhs.size < rhs.size : lhs.size > rhs.size
                case "modified":
                    return filesService.currentSortOrder == "asc" ? lhs.modifiedAt < rhs.modifiedAt : lhs.modifiedAt > rhs.modifiedAt
                default: // "name"
                    return filesService.currentSortOrder == "asc" ?
                           lhs.path.localizedCompare(rhs.path) == .orderedAscending :
                           lhs.path.localizedCompare(rhs.path) == .orderedDescending
                }
            }

        return ForEach(displayedFiles, id: \.path) { file in
            FileManagementRowView(
                file: file,
                isIncluded: includedSet.contains(file.path),
                isExcluded: excludedSet.contains(file.path),
                onIncludeToggle: { toggleInclude(file.path) },
                onExcludeToggle: { toggleExclude(file.path) }
            )
            .padding(.horizontal)
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()

            VStack(spacing: Theme.Spacing.md) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.system(size: 48))
                    .foregroundColor(.secondary)

                Text("No Files")
                    .h3()
                    .foregroundColor(.primary)

                Text(localSearchTerm.isEmpty ? "Files will appear here when loaded." : "No files match your search.")
                    .paragraph()
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var isConnected: Bool {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let state = multiConnectionManager.connectionStates[deviceId] else {
            return false
        }
        return state.isConnected
    }

    private func updateIncludedFilesNotInList() {
        guard let session = container.sessionService.currentSession else {
            includedFilesNotInList = []
            return
        }

        let includedSet = Set(session.includedFiles ?? [])
        let filesInListSet = Set(files.map(\.path))

        // Find included files that aren't in the current file list
        includedFilesNotInList = Array(includedSet.subtracting(filesInListSet)).sorted()
    }

    private func loadFiles() {
        // Prevent concurrent loads
        guard !isLoading else { return }

        // Use session's projectDirectory, then currentProject, then selectedProjectDirectory from AppState
        let projectDirectory = container.sessionService.currentSession?.projectDirectory
            ?? container.currentProject?.directory
            ?? Core.AppState.shared.selectedProjectDirectory

        guard let projectDir = projectDirectory else {
            errorMessage = "No project directory configured. Please select a session or project."
            hasLoadedFiles = false
            return
        }

        Task {
            await MainActor.run {
                isLoading = true
                errorMessage = nil
            }

            do {
                // Load all project files, not just search results
                let results = try await container.filesService.searchFiles(
                    query: "",
                    maxResults: 10000, // Increased to get more files
                    includeContent: false,
                    projectDirectory: projectDir
                )

                await MainActor.run {
                    files = results
                    isLoading = false
                    hasLoadedFiles = true
                    updateIncludedFilesNotInList()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                    hasLoadedFiles = false
                }
            }
        }
    }

    private func performSearch() {
        // Use session's projectDirectory, then currentProject, then selectedProjectDirectory from AppState
        let projectDirectory = container.sessionService.currentSession?.projectDirectory
            ?? container.currentProject?.directory
            ?? Core.AppState.shared.selectedProjectDirectory

        guard let projectDir = projectDirectory else {
            return
        }

        Task {
            await MainActor.run {
                isLoading = true
                errorMessage = nil
            }

            do {
                let results = try await container.filesService.searchFiles(
                    query: searchText,
                    maxResults: 1000,
                    includeContent: false,
                    projectDirectory: projectDir
                )

                await MainActor.run {
                    files = results
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

    private func toggleInclude(_ path: String) {
        guard let session = container.sessionService.currentSession else {
            errorMessage = "No active session"
            return
        }

        let includedSet = Set(session.includedFiles ?? [])
        let isIncluded = includedSet.contains(path)

        Task {
            try? await container.sessionService.updateSessionFiles(
                sessionId: session.id,
                addIncluded: isIncluded ? nil : [path],
                removeIncluded: isIncluded ? [path] : nil,
                addExcluded: nil,
                removeExcluded: isIncluded ? nil : [path] // remove exclusion when including
            )
        }
    }

    private func toggleExclude(_ path: String) {
        guard let session = container.sessionService.currentSession else {
            errorMessage = "No active session"
            return
        }

        let excludedSet = Set(session.forceExcludedFiles ?? [])
        let isExcluded = excludedSet.contains(path)

        Task {
            try? await container.sessionService.updateSessionFiles(
                sessionId: session.id,
                addIncluded: nil,
                removeIncluded: isExcluded ? nil : [path], // remove included when excluding
                addExcluded: isExcluded ? nil : [path],
                removeExcluded: isExcluded ? [path] : nil
            )
        }
    }

    private func selectAllFiltered() {
        guard let session = container.sessionService.currentSession else { return }
        let includedSet = Set(session.includedFiles ?? [])
        let excludedSet = Set(session.forceExcludedFiles ?? [])

        let displayedFiles = files
            .filter { file in
                let matchesSearch = localSearchTerm.isEmpty || file.path.lowercased().contains(localSearchTerm.lowercased())
                let matchesFilter = filesService.currentFilterMode == "all" ||
                                   (filesService.currentFilterMode == "selected" && includedSet.contains(file.path) && !excludedSet.contains(file.path))
                return matchesSearch && matchesFilter
            }

        let paths = displayedFiles.map(\.path).filter { !includedSet.contains($0) }
        if !paths.isEmpty {
            Task {
                try? await container.sessionService.updateSessionFiles(
                    sessionId: session.id,
                    addIncluded: paths,
                    removeIncluded: nil,
                    addExcluded: nil,
                    removeExcluded: paths
                )
            }
        }
    }

    private func deselectAllFiltered() {
        guard let session = container.sessionService.currentSession else { return }
        let includedSet = Set(session.includedFiles ?? [])
        let excludedSet = Set(session.forceExcludedFiles ?? [])

        let displayedFiles = files
            .filter { file in
                let matchesSearch = localSearchTerm.isEmpty || file.path.lowercased().contains(localSearchTerm.lowercased())
                let matchesFilter = filesService.currentFilterMode == "all" ||
                                   (filesService.currentFilterMode == "selected" && includedSet.contains(file.path) && !excludedSet.contains(file.path))
                return matchesSearch && matchesFilter
            }

        let paths = displayedFiles.map(\.path).filter { includedSet.contains($0) }
        if !paths.isEmpty {
            Task {
                try? await container.sessionService.updateSessionFiles(
                    sessionId: session.id,
                    addIncluded: nil,
                    removeIncluded: paths,
                    addExcluded: nil,
                    removeExcluded: nil
                )
            }
        }
    }

    private func excludeAllFiltered() {
        guard let session = container.sessionService.currentSession else { return }
        let includedSet = Set(session.includedFiles ?? [])
        let excludedSet = Set(session.forceExcludedFiles ?? [])

        let displayedFiles = files
            .filter { file in
                let matchesSearch = localSearchTerm.isEmpty || file.path.lowercased().contains(localSearchTerm.lowercased())
                let matchesFilter = filesService.currentFilterMode == "all" ||
                                   (filesService.currentFilterMode == "selected" && includedSet.contains(file.path) && !excludedSet.contains(file.path))
                return matchesSearch && matchesFilter
            }

        let paths = displayedFiles.map(\.path).filter { !excludedSet.contains($0) }
        if !paths.isEmpty {
            Task {
                try? await container.sessionService.updateSessionFiles(
                    sessionId: session.id,
                    addIncluded: nil,
                    removeIncluded: paths,
                    addExcluded: paths,
                    removeExcluded: nil
                )
            }
        }
    }

    private func unexcludeAllFiltered() {
        guard let session = container.sessionService.currentSession else { return }
        let includedSet = Set(session.includedFiles ?? [])
        let excludedSet = Set(session.forceExcludedFiles ?? [])

        let displayedFiles = files
            .filter { file in
                let matchesSearch = localSearchTerm.isEmpty || file.path.lowercased().contains(localSearchTerm.lowercased())
                let matchesFilter = filesService.currentFilterMode == "all" ||
                                   (filesService.currentFilterMode == "selected" && includedSet.contains(file.path) && !excludedSet.contains(file.path))
                return matchesSearch && matchesFilter
            }

        let paths = displayedFiles.map(\.path).filter { excludedSet.contains($0) }
        if !paths.isEmpty {
            Task {
                try? await container.sessionService.updateSessionFiles(
                    sessionId: session.id,
                    addIncluded: nil,
                    removeIncluded: nil,
                    addExcluded: nil,
                    removeExcluded: paths
                )
            }
        }
    }

    private func updateRunningWorkflowCount() {
        guard let session = container.sessionService.currentSession else {
            runningWorkflowCount = 0
            return
        }

        // Use in-memory jobs from JobsDataService for instant updates
        let activeStatuses: Set<String> = ["created", "queued", "acknowledgedByWorker", "preparing", "preparingInput", "generatingStream", "processingStream", "running"]

        let count = container.jobsService.jobs.filter { job in
            // Check session ID matches
            guard job.sessionId == session.id else {
                return false
            }

            // Check status is active
            guard activeStatuses.contains(job.status) else {
                return false
            }

            // Check it's a file finder workflow - match actual task types used by the system
            let taskType = job.taskType ?? ""
            return taskType == "extended_path_finder" ||
                   taskType == "file_relevance_assessment" ||
                   taskType == "path_correction" ||
                   taskType == "regex_file_filter"
        }.count

        runningWorkflowCount = count
    }
}

private struct FileManagementRowView: View {
    let file: FileInfo
    let isIncluded: Bool
    let isExcluded: Bool
    let onIncludeToggle: () -> Void
    let onExcludeToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            // First line: File path ONLY with highlighted filename
            formattedPath
                .small().fontWeight(.semibold)

            // Second line: Metadata inline + toggles
            HStack(spacing: Theme.Spacing.md) {
                // Modified time
                Text(formattedDate)
                    .small()
                    .foregroundColor(.mutedForeground)

                Text("•")
                    .small()
                    .foregroundColor(.mutedForeground)

                // Size
                Text(ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file))
                    .small()
                    .foregroundColor(.mutedForeground)

                Spacer()

                // Include toggle
                Toggle("", isOn: Binding(
                    get: { isIncluded },
                    set: { _ in onIncludeToggle() }
                ))
                .labelsHidden()
                .toggleStyle(SwitchToggleStyle(tint: Color.success))
                .frame(width: 50)
                .disabled(isExcluded)
                .accessibilityLabel(isIncluded ? "Exclude file from task context" : "Include file in task context")
                .accessibilityHint("Toggles whether this file is included in the current task")
                .accessibilityValue(isIncluded ? "On" : "Off")

                // Exclude toggle
                Toggle("", isOn: Binding(
                    get: { isExcluded },
                    set: { _ in onExcludeToggle() }
                ))
                .labelsHidden()
                .toggleStyle(SwitchToggleStyle(tint: Color.destructive))
                .frame(width: 50)
                .accessibilityLabel(isExcluded ? "Un-exclude file" : "Exclude file")
                .accessibilityHint("Toggles whether this file is forcibly excluded from tasks")
                .accessibilityValue(isExcluded ? "On" : "Off")
            }
        }
        .padding(Theme.Spacing.md)
        .background(isIncluded && !isExcluded ? Color.accent : Color.card)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(isIncluded && !isExcluded ? Color.primary.opacity(0.5) : Color.border, lineWidth: 1)
        )
        .opacity(isExcluded ? 0.5 : 1.0)
    }

    private var fileIcon: String {
        let ext = (file.fileExtension ?? "").lowercased()
        switch ext {
        case "swift":
            return "swift"
        case "js", "ts", "tsx", "jsx":
            return "doc.text"
        case "py":
            return "doc.text"
        case "java", "cpp", "c", "h":
            return "doc.text"
        case "json", "xml", "yml", "yaml":
            return "doc.plaintext"
        case "md", "txt":
            return "doc.richtext"
        case "png", "jpg", "jpeg", "gif":
            return "photo"
        case "pdf":
            return "doc.pdf"
        default:
            return "doc"
        }
    }

    private var fileIconColor: Color {
        let ext = (file.fileExtension ?? "").lowercased()
        switch ext {
        case "swift":
            return .orange
        case "js", "ts", "tsx", "jsx":
            return .yellow
        case "py":
            return .blue
        case "json":
            return .green
        default:
            return .secondary
        }
    }

    private var formattedPath: Text {
        let pathComponents = file.path.split(separator: "/")
        if pathComponents.isEmpty {
            return Text(file.path).foregroundColor(.foreground)
        }

        let filename = String(pathComponents.last ?? "")
        let directory = pathComponents.dropLast().joined(separator: "/")

        if directory.isEmpty {
            return Text(filename).foregroundColor(.primary)
        } else {
            return Text(directory + "/").foregroundColor(.foreground) +
                   Text(filename).foregroundColor(.primary)
        }
    }

    private var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(file.modifiedAt) / 1000.0)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Action Button Component
private struct ActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.itemSpacing) {
                Image(systemName: systemImage)
                    .font(.system(size: 14))
                Text(title)
            }
        }
        .buttonStyle(ToolbarButtonStyle())
    }
}

#Preview {
    let serverURL = URL(string: "https://localhost:3000")!
    let deviceId = UUID().uuidString
    let relayClient = ServerRelayClient(serverURL: serverURL, deviceId: deviceId)
    FileManagementView(filesService: FilesDataService(serverRelayClient: relayClient))
        .environmentObject(AppContainer(baseURL: serverURL, deviceId: deviceId))
}