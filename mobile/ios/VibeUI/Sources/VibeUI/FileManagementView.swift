import SwiftUI
import Core

public struct FileManagementView: View {
    @EnvironmentObject private var container: AppContainer
    @ObservedObject private var filesService: FilesDataService
    @ObservedObject private var sessionService: SessionDataService
    @ObservedObject private var jobsService: JobsDataService
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared
    @State private var searchText = ""
    @State private var files: [FileInfo] = []
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var localSearchTerm: String = ""
    @State private var searchDebounceTimer: Timer?
    @State private var refreshTrigger = UUID()
    @State private var findFilesError: String? = nil
    @State private var hasLoadedFiles: Bool = false
    @State private var lastLoadedProjectDir: String? = nil
    @State private var canUndoFiles = false
    @State private var canRedoFiles = false
    @State private var isSyncingHistory = false
    @State private var fileHistoryState: HistoryState?
    @State private var allFilesCount: Int = 0
    @State private var selectedFilesCount: Int = 0

    public init(filesService: FilesDataService, sessionService: SessionDataService, jobsService: JobsDataService) {
        self.filesService = filesService
        self.sessionService = sessionService
        self.jobsService = jobsService
    }

    private var includedFilesNotInList: [String] {
        guard let session = sessionService.currentSession else {
            return []
        }
        let includedSet = Set(session.includedFiles ?? [])
        let filesInListSet = Set(files.map(\.path))
        return Array(includedSet.subtracting(filesInListSet)).sorted()
    }

    public var body: some View {
        let _ = refreshTrigger
        let includedSet = Set(sessionService.currentSession?.includedFiles ?? [])
        let excludedSet = Set(sessionService.currentSession?.forceExcludedFiles ?? [])

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
        .onChange(of: sessionService.currentSession?.id) { _ in
            Task {
                await refreshUndoRedoState()
            }
        }
        .onReceive(container.filesService.$files) { newFiles in
            files = newFiles
            updateFileCounts()
        }
        .onReceive(sessionService.currentSessionPublisher) { session in
            updateFileCounts()
            guard let session else { return }
            if jobsService.activeSessionId != session.id {
                jobsService.setActiveSession(sessionId: session.id, projectDirectory: session.projectDirectory)
            }
        }
        .task(id: sessionService.currentSession?.projectDirectory) {
            let currentProjectDir = sessionService.currentSession?.projectDirectory
                ?? container.currentProject?.directory

            if let session = sessionService.currentSession {
                if jobsService.activeSessionId != session.id {
                    jobsService.setActiveSession(sessionId: session.id, projectDirectory: session.projectDirectory)
                }
            }

            if currentProjectDir != nil && (!hasLoadedFiles || lastLoadedProjectDir != currentProjectDir) {
                lastLoadedProjectDir = currentProjectDir
                if isConnected {
                    loadFiles()
                }
            }
            updateFileCounts()
            await refreshUndoRedoState()
        }
        .onReceive(filesService.$currentSearchTerm) { newValue in
            if newValue != localSearchTerm {
                localSearchTerm = newValue
            }
        }
        .onReceive(sessionService.currentSessionPublisher) { session in
            let newProjectDir = session?.projectDirectory
            if lastLoadedProjectDir != newProjectDir && newProjectDir != nil {
                lastLoadedProjectDir = newProjectDir
                loadFiles()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("workflow-completed"))) { notification in
            // When a file_finder_workflow completes, refresh the session to get updated includedFiles
            guard let sessionId = notification.userInfo?["sessionId"] as? String,
                  sessionId == sessionService.currentSession?.id else { return }
            Task {
                // getSession automatically updates currentSession which triggers currentSessionPublisher
                _ = try? await sessionService.getSession(id: sessionId)
            }
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
        if let errorMessage = errorMessage, shouldShowErrorMessage(errorMessage) {
            VStack {
                StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
                    .padding()
                Spacer()
            }
        }

        if let findFilesError = findFilesError, shouldShowErrorMessage(findFilesError) {
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
        .background(Color.surfaceSecondary)
    }

    private var searchBarWithSort: some View {
        HStack(spacing: Theme.Spacing.sm) {
            // Search input
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(Color.primary.opacity(0.6))
                    .frame(width: 20)

                DismissableTextField("Filter files...", text: $localSearchTerm)
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
            .frame(height: 44)
            .padding(.horizontal, Theme.Spacing.cardPadding)
            .background(Color.inputBackground)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.primary.opacity(0.15), lineWidth: 1)
            )
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
                        .font(.system(size: 15, weight: .medium))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10))
                }
                .foregroundColor(Color.primary)
                .frame(height: 44)
                .padding(.horizontal, Theme.Spacing.sm)
                .background(Color.primary.opacity(0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.primary.opacity(0.15), lineWidth: 1)
                )
                .cornerRadius(8)
            }

            Button(action: {
                filesService.currentSortOrder = filesService.currentSortOrder == "asc" ? "desc" : "asc"
            }) {
                Image(systemName: filesService.currentSortOrder == "asc" ? "arrow.up" : "arrow.down")
                    .font(.system(size: 13))
            }
            .buttonStyle(IconButtonStyle(size: 44))
        }
    }

    private var actionButtons: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Theme.Spacing.sm) {
                Button {
                    Task {
                        isSyncingHistory = true
                        defer { isSyncingHistory = false }
                        guard let session = sessionService.currentSession else { return }
                        try? await container.filesService.undoFileSelection(sessionId: session.id)
                        await refreshUndoRedoState()
                    }
                } label: {
                    Image(systemName: "arrow.uturn.backward")
                }
                .buttonStyle(IconButtonStyle())
                .disabled(!canUndoFiles || isSyncingHistory)

                Button {
                    Task {
                        isSyncingHistory = true
                        defer { isSyncingHistory = false }
                        guard let session = sessionService.currentSession else { return }
                        try? await container.filesService.redoFileSelection(sessionId: session.id)
                        await refreshUndoRedoState()
                    }
                } label: {
                    Image(systemName: "arrow.uturn.forward")
                }
                .buttonStyle(IconButtonStyle())
                .disabled(!canRedoFiles || isSyncingHistory)

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
        .background(Color.backgroundPrimary)
    }

    private var filesList: some View {
        VStack(spacing: 0) {
            fileCountHeader

            ScrollView {
                LazyVStack(spacing: 0) {
                    selectedFilesSection
                    searchResultsSection
                }
                .background(Color.backgroundPrimary)
                .padding(.vertical, Theme.Spacing.sm)
            }
            .background(Color.backgroundPrimary)
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var fileCountHeader: some View {
        HStack(spacing: Theme.Spacing.sm) {
            // All/Selected Filter Toggle with counts
            FilterModeToggle(
                allCount: allFilesCount,
                selectedCount: selectedFilesCount,
                currentMode: filesService.currentFilterMode,
                onSelect: { mode in
                    filesService.currentFilterMode = mode
                }
            )

            Spacer()

            // Find Files Button
            Button(action: {
                guard isConnected else {
                    findFilesError = "No active device connection"
                    return
                }
                guard let session = sessionService.currentSession else {
                    findFilesError = "No active session"
                    return
                }
                guard !session.projectDirectory.isEmpty else {
                    findFilesError = "Missing project directory"
                    return
                }

                Task {
                    do {
                        let refreshedSession = try await sessionService.getSession(id: session.id)
                        guard let refreshedSession = refreshedSession else {
                            await MainActor.run { findFilesError = "Session not found" }
                            return
                        }
                        let taskDesc = (refreshedSession.taskDescription ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                        guard taskDesc.count >= 10 else {
                            await MainActor.run { findFilesError = "Please describe your task in at least 10 characters before finding files." }
                            return
                        }

                        await MainActor.run { findFilesError = nil }

                        if jobsService.activeSessionId != refreshedSession.id {
                            jobsService.setActiveSession(sessionId: refreshedSession.id, projectDirectory: refreshedSession.projectDirectory)
                        }

                        _ = container.filesService.startFindFiles(
                            sessionId: refreshedSession.id,
                            taskDescription: taskDesc,
                            projectDirectory: refreshedSession.projectDirectory,
                            excludedPaths: refreshedSession.forceExcludedFiles ?? [],
                            timeoutMs: 120_000
                        )
                    } catch {
                        await MainActor.run { findFilesError = "Failed to start file finder: \(error.localizedDescription)" }
                    }
                }
            }) {
                HStack {
                    Image(systemName: "sparkles")
                    if jobsService.sessionActiveWorkflowJobs == 0 {
                        Text("Find Files")
                            .lineLimit(1)
                    } else {
                        Text("Find Files (\(jobsService.sessionActiveWorkflowJobs))")
                            .lineLimit(1)
                    }
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!isConnected || sessionService.currentSession == nil)
        }
        .padding(.horizontal)
        .padding(.vertical, Theme.Spacing.sm)
    }

    @ViewBuilder
    private var selectedFilesSection: some View {
        if !includedFilesNotInList.isEmpty {
            let excludedSet = Set(sessionService.currentSession?.forceExcludedFiles ?? [])

            Section {
                ForEach(Array(includedFilesNotInList.enumerated()), id: \.element) { index, filePath in
                    if let file = FileInfo(from: [
                        "path": filePath,
                        "name": URL(fileURLWithPath: filePath).lastPathComponent,
                        "relativePath": URL(fileURLWithPath: filePath).deletingLastPathComponent().path,
                        "fileExtension": URL(fileURLWithPath: filePath).pathExtension,
                        "size": UInt64(0),
                        "modifiedAt": Int64(0),
                        "isBinary": false
                    ]) {
                        VStack(spacing: 0) {
                            FileManagementRowView(
                                file: file,
                                isIncluded: true,
                                isExcluded: excludedSet.contains(filePath),
                                onIncludeToggle: { toggleInclude(filePath) },
                                onExcludeToggle: { toggleExclude(filePath) }
                            )

                            if index < includedFilesNotInList.count - 1 {
                                Divider()
                                    .padding(.leading, Theme.Spacing.cardPadding)
                            }
                        }
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
        let includedSet = Set(sessionService.currentSession?.includedFiles ?? [])
        let excludedSet = Set(sessionService.currentSession?.forceExcludedFiles ?? [])

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

        return ForEach(Array(displayedFiles.enumerated()), id: \.element.path) { index, file in
            VStack(spacing: 0) {
                FileManagementRowView(
                    file: file,
                    isIncluded: includedSet.contains(file.path),
                    isExcluded: excludedSet.contains(file.path),
                    onIncludeToggle: { toggleInclude(file.path) },
                    onExcludeToggle: { toggleExclude(file.path) }
                )

                if index < displayedFiles.count - 1 {
                    Divider()
                        .padding(.leading, Theme.Spacing.cardPadding)
                }
            }
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
        .background(Color.backgroundPrimary)
    }

    private var isConnected: Bool {
        guard let deviceId = multiConnectionManager.activeDeviceId,
              let state = multiConnectionManager.connectionStates[deviceId] else {
            return false
        }
        return state.isConnected
    }

    private var shouldSuppressConnectionAlerts: Bool {
        !multiConnectionManager.activeDeviceIsConnectedOrReconnecting
    }

    private func shouldShowErrorMessage(_ message: String) -> Bool {
        if !shouldSuppressConnectionAlerts {
            return true
        }
        return !isConnectionErrorMessage(message)
    }

    private func isConnectionErrorMessage(_ message: String) -> Bool {
        let normalized = message.lowercased()
        return normalized.contains("connection")
            || normalized.contains("not connected")
            || normalized.contains("offline")
            || normalized.contains("relay")
            || normalized.contains("network")
            || normalized.contains("timeout")
    }

    private func refreshUndoRedoState() async {
        guard let session = sessionService.currentSession else { return }
        do {
            let stateDict = try await container.filesService.getFileHistoryState(sessionId: session.id)
            let decoded = try FileHistoryStateCodec.decodeState(from: stateDict)
            guard !decoded.entries.isEmpty else {
                await MainActor.run {
                    canUndoFiles = false
                    canRedoFiles = false
                }
                return
            }

            let rawIndex = Int(decoded.currentIndex)
            let clampedIndex = max(0, min(rawIndex, decoded.entries.count - 1))
            let entry = decoded.entries[clampedIndex]
            let includedFiles = FileHistoryStateCodec.parseFileList(from: entry.includedFiles)
            let forceExcludedFiles = FileHistoryStateCodec.parseFileList(from: entry.forceExcludedFiles)

            await MainActor.run {
                canUndoFiles = clampedIndex > 0
                canRedoFiles = clampedIndex < max(0, decoded.entries.count - 1)
                sessionService.updateSessionFilesInMemory(
                    sessionId: session.id,
                    includedFiles: includedFiles,
                    forceExcludedFiles: forceExcludedFiles
                )
                updateFileCounts()
            }
        } catch {
        }
    }

    private func loadFiles() {
        // Prevent concurrent loads
        guard !isLoading else { return }

        // Use session's projectDirectory, then currentProject, then selectedProjectDirectory from AppState
        let projectDirectory = sessionService.currentSession?.projectDirectory
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
        let projectDirectory = sessionService.currentSession?.projectDirectory
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
        guard let session = sessionService.currentSession else {
            errorMessage = "No active session"
            return
        }

        var includedSet = Set(session.includedFiles ?? [])
        var excludedSet = Set(session.forceExcludedFiles ?? [])
        let isIncluded = includedSet.contains(path)

        if isIncluded {
            includedSet.remove(path)
        } else {
            includedSet.insert(path)
            excludedSet.remove(path)
        }

        let nextIncluded = Array(includedSet)
        let nextExcluded = Array(excludedSet)

        sessionService.updateSessionFilesInMemory(
            sessionId: session.id,
            includedFiles: nextIncluded,
            forceExcludedFiles: nextExcluded
        )

        Task {
            try? await sessionService.updateSessionFiles(
                sessionId: session.id,
                addIncluded: isIncluded ? nil : [path],
                removeIncluded: isIncluded ? [path] : nil,
                addExcluded: nil,
                removeExcluded: isIncluded ? nil : [path]
            )
            await refreshUndoRedoState()
        }
    }

    private func toggleExclude(_ path: String) {
        guard let session = sessionService.currentSession else {
            errorMessage = "No active session"
            return
        }

        var includedSet = Set(session.includedFiles ?? [])
        var excludedSet = Set(session.forceExcludedFiles ?? [])
        let isExcluded = excludedSet.contains(path)

        if isExcluded {
            excludedSet.remove(path)
        } else {
            excludedSet.insert(path)
            includedSet.remove(path)
        }

        let nextIncluded = Array(includedSet)
        let nextExcluded = Array(excludedSet)

        sessionService.updateSessionFilesInMemory(
            sessionId: session.id,
            includedFiles: nextIncluded,
            forceExcludedFiles: nextExcluded
        )

        Task {
            try? await sessionService.updateSessionFiles(
                sessionId: session.id,
                addIncluded: nil,
                removeIncluded: isExcluded ? nil : [path],
                addExcluded: isExcluded ? nil : [path],
                removeExcluded: isExcluded ? [path] : nil
            )
            await refreshUndoRedoState()
        }
    }

    private func selectAllFiltered() {
        guard let session = sessionService.currentSession else { return }
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
                try? await sessionService.updateSessionFiles(
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
        guard let session = sessionService.currentSession else { return }
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
                try? await sessionService.updateSessionFiles(
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
        guard let session = sessionService.currentSession else { return }
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
                try? await sessionService.updateSessionFiles(
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
        guard let session = sessionService.currentSession else { return }
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
                try? await sessionService.updateSessionFiles(
                    sessionId: session.id,
                    addIncluded: nil,
                    removeIncluded: nil,
                    addExcluded: nil,
                    removeExcluded: paths
                )
            }
        }
    }

    private func updateFileCounts() {
        let includedSet = Set(sessionService.currentSession?.includedFiles ?? [])
        allFilesCount = files.count + includedFilesNotInList.count
        selectedFilesCount = includedSet.count
    }

}

private struct FileManagementRowView: View {
    let file: FileInfo
    let isIncluded: Bool
    let isExcluded: Bool
    let onIncludeToggle: () -> Void
    let onExcludeToggle: () -> Void

    private var rowBackground: Color {
        if isExcluded {
            return Color.destructiveBackground
        } else if isIncluded {
            return Color.selectionBackground
        } else {
            return Color.backgroundPrimary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // SECTION 1: Header (path + actions)
            HStack(alignment: .top, spacing: Theme.Spacing.cardSpacing) {
                // Path with inline checkmark when selected
                VStack(alignment: .leading, spacing: 2) {
                    formattedPathWithCheckmark
                        .mediumText()
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                // Exclude Button
                Button {
                    onExcludeToggle()
                } label: {
                    Image(systemName: isExcluded ? "minus.circle.fill" : "minus.circle")
                        .font(.system(size: 24))
                        .foregroundColor(isExcluded ? .red : .mutedForeground)
                }
            }
            .padding(.horizontal, Theme.Spacing.cardPadding)
            .padding(.top, Theme.Spacing.sm)
            .padding(.bottom, Theme.Spacing.xs)

            // SECTION 2: Metadata Row
            HStack(spacing: Theme.Spacing.sm) {
                // Modified Time
                Text(formattedDate)
                    .small()
                    .foregroundColor(.mutedForeground)

                // Size
                Text(formattedSize)
                    .small()
                    .foregroundColor(.mutedForeground)

                // Extension Badge
                if let ext = file.fileExtension, !ext.isEmpty {
                    Text("•")
                        .small()
                        .foregroundColor(.mutedForeground)

                    Text(".\(ext)")
                        .small()
                        .fontWeight(.medium)
                        .foregroundColor(.mutedForeground)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.muted)
                        .cornerRadius(4)
                }

                Spacer()
            }
            .padding(.horizontal, Theme.Spacing.cardPadding)
            .padding(.bottom, Theme.Spacing.sm)
        }
        .background(rowBackground)
        .contentShape(Rectangle())
        .onTapGesture {
            if !isExcluded {
                onIncludeToggle()
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                onIncludeToggle()
            } label: {
                Label(isIncluded ? "Remove" : "Include", systemImage: isIncluded ? "xmark" : "checkmark")
            }
            .tint(isIncluded ? .orange : .green)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                onExcludeToggle()
            } label: {
                Label(isExcluded ? "Un-exclude" : "Exclude", systemImage: "minus.circle")
            }
        }
    }

    // MARK: - Computed Properties

    private var formattedSize: String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        formatter.allowedUnits = [.useKB, .useMB]
        return formatter.string(fromByteCount: Int64(file.size))
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

    private var formattedPathWithCheckmark: Text {
        let pathComponents = file.path.split(separator: "/")
        if pathComponents.isEmpty {
            if isIncluded && !isExcluded {
                return Text(Image(systemName: "checkmark.circle.fill"))
                    .foregroundColor(.green)
                    .font(.system(size: 16)) +
                    Text("  ") +
                    Text(file.path).foregroundColor(.foreground)
            }
            return Text(file.path).foregroundColor(.foreground)
        }

        let filename = String(pathComponents.last ?? "")
        let directory = pathComponents.dropLast().joined(separator: "/")

        if isIncluded && !isExcluded {
            let checkmark = Text(Image(systemName: "checkmark.circle.fill"))
                .foregroundColor(.green)
                .font(.system(size: 16)) +
                Text("  ")

            if directory.isEmpty {
                return checkmark + Text(filename).foregroundColor(.primary)
            } else {
                return checkmark +
                       Text(directory + "/").foregroundColor(.foreground) +
                       Text(filename).foregroundColor(.primary)
            }
        } else {
            if directory.isEmpty {
                return Text(filename).foregroundColor(.primary)
            } else {
                return Text(directory + "/").foregroundColor(.foreground) +
                       Text(filename).foregroundColor(.primary)
            }
        }
    }

    private var formattedDate: String {
        let date = Date(timeIntervalSince1970: TimeInterval(file.modifiedAt) / 1000.0)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Filter Mode Toggle Component
private struct FilterModeToggle: View {
    let allCount: Int
    let selectedCount: Int
    let currentMode: String
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            // All button
            Button(action: {
                onSelect("all")
            }) {
                Text("All (\(allCount))")
                    .font(.footnote)
                    .fontWeight(currentMode == "all" ? .semibold : .regular)
                    .foregroundColor(currentMode == "all" ? Color.primary : Color.mutedForeground)
                    .frame(height: 44)
                    .padding(.horizontal, Theme.Spacing.md)
                    .background(
                        currentMode == "all" ?
                        Color.primary.opacity(0.1) :
                        Color.clear
                    )
            }
            .buttonStyle(PlainButtonStyle())

            // Divider
            Rectangle()
                .fill(Color.primary.opacity(0.15))
                .frame(width: 1, height: 28)

            // Selected button
            Button(action: {
                onSelect("selected")
            }) {
                Text("Selected (\(selectedCount))")
                    .font(.footnote)
                    .fontWeight(currentMode == "selected" ? .semibold : .regular)
                    .foregroundColor(currentMode == "selected" ? Color.primary : Color.mutedForeground)
                    .frame(height: 44)
                    .padding(.horizontal, Theme.Spacing.md)
                    .background(
                        currentMode == "selected" ?
                        Color.primary.opacity(0.1) :
                        Color.clear
                    )
            }
            .buttonStyle(PlainButtonStyle())
        }
        .background(Color.surfacePrimary)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radii.base)
                .stroke(Color.primary.opacity(0.15), lineWidth: 1)
        )
        .cornerRadius(Theme.Radii.base)
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
    let container = AppContainer(baseURL: serverURL, deviceId: deviceId)
    FileManagementView(
        filesService: FilesDataService(serverRelayClient: relayClient),
        sessionService: container.sessionService,
        jobsService: container.jobsService
    )
    .environmentObject(container)
}
