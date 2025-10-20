import SwiftUI
import Core

private struct ProjectFolderItem: Identifiable {
    let id = UUID()
    let name: String
    let path: String
}

public struct ProjectFolderSelectionView: View {
    @EnvironmentObject var container: AppContainer
    @ObservedObject var appState = AppState.shared
    @StateObject var multi = MultiConnectionManager.shared

    @State private var currentPath: String = ""
    @State private var parentPath: String? = nil
    @State private var folders: [ProjectFolderItem] = []
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var errorCode: String? = nil
    @State private var isApplyingSelection: Bool = false
    @State private var connectionLost: Bool = false

    public init() {}

    public var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [
                    Color.background,
                    Color.background.opacity(0.95)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack {
                Spacer()

                VStack(spacing: 24) {
                    headerSection

                    if multi.activeDeviceId == nil {
                        connectionGateSection
                    } else {
                        folderBrowserSection
                        footerActionsSection
                    }
                }
                .padding(24)
                .background(Color.card.opacity(0.95))
                .cornerRadius(16)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.border, lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.1), radius: 10, x: 0, y: 4)
                .padding(.horizontal, 32)

                Spacer()
            }
        }
        .onAppear {
            if multi.activeDeviceId != nil {
                loadHomeDirectory()
            }
        }
        .onChange(of: multi.activeDeviceId) { newDeviceId in
            // If activeDeviceId becomes nil while we're viewing this screen, mark connection as lost
            if newDeviceId == nil && !currentPath.isEmpty {
                connectionLost = true
                errorMessage = "Desktop connection lost"
                errorCode = "connection_lost"
            }
        }
        .onChange(of: multi.connectionStates) { states in
            // Monitor connection state changes for the active device
            guard let deviceId = multi.activeDeviceId else { return }

            if let state = states[deviceId] {
                switch state {
                case .failed(let error):
                    connectionLost = true
                    if let relayError = error as? ServerRelayError {
                        let info = extractErrorInfo(from: relayError)
                        errorCode = info.code
                        errorMessage = info.message
                    } else {
                        errorCode = "connection_failed"
                        errorMessage = error.localizedDescription
                    }
                case .disconnected:
                    if !currentPath.isEmpty {
                        connectionLost = true
                        errorCode = "disconnected"
                        errorMessage = "Desktop disconnected"
                    }
                case .connected:
                    if connectionLost && errorMessage != nil {
                        // Connection restored - clear error and retry
                        connectionLost = false
                        errorMessage = nil
                        errorCode = nil
                        if !currentPath.isEmpty {
                            loadFolders(at: currentPath)
                        } else {
                            loadHomeDirectory()
                        }
                    }
                default:
                    break
                }
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: 12) {
            Text("Select Project Folder")
                .h1()
                .foregroundColor(Color.cardForeground)

            Text("Choose the project folder where your code lives. This helps PlanToCode understand your workspace.")
                .paragraph()
                .foregroundColor(Color.mutedForeground)
                .multilineTextAlignment(.center)
        }
    }

    private var connectionGateSection: some View {
        VStack(spacing: 16) {
            StatusAlertView(
                variant: .warning,
                title: "Device Connection Required",
                message: "Please select a device before choosing a project folder"
            )

            Button("Select Device") {
                appState.navigateToDeviceSelection()
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    private var folderBrowserSection: some View {
        VStack(spacing: 16) {
            currentPathBar

            Divider()
                .background(Color.border)

            if let error = errorMessage {
                errorStateSection(error: error)
            } else if isLoading {
                loadingStateSection
            } else {
                folderListSection
            }
        }
    }

    private var currentPathBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "folder.fill")
                .foregroundColor(Color.primary)

            ScrollView(.horizontal, showsIndicators: false) {
                Text(currentPath.isEmpty ? "No folder selected" : currentPath)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(Color.cardForeground)
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

    private var folderListSection: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                if let parent = parentPath {
                    parentNavigationButton(parent)
                }

                ForEach(folders) { folder in
                    folderRow(folder)
                }
            }
        }
        .frame(maxHeight: 300)
    }

    private func parentNavigationButton(_ parent: String) -> some View {
        Button {
            loadFolders(at: parent)
        } label: {
            HStack {
                Image(systemName: "arrow.up")
                    .foregroundColor(Color.mutedForeground)
                Text("..")
                    .foregroundColor(Color.mutedForeground)
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(Color.mutedForeground)
            }
            .padding(12)
            .background(Color.card.opacity(0.5))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.border, lineWidth: 1)
            )
        }
    }

    private func folderRow(_ folder: ProjectFolderItem) -> some View {
        Button {
            loadFolders(at: folder.path)
        } label: {
            HStack {
                Image(systemName: "folder")
                    .foregroundColor(Color.primary)
                Text(folder.name)
                    .foregroundColor(Color.cardForeground)
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundColor(Color.mutedForeground)
            }
            .padding(12)
            .background(Color.card)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.border, lineWidth: 1)
            )
        }
    }

    private var loadingStateSection: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading folders...")
                .small()
                .foregroundColor(Color.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .padding(32)
    }

    private func errorStateSection(error: String) -> some View {
        VStack(spacing: 16) {
            // Translate error code to user-friendly message
            let friendlyMessage = errorCode.map { code in
                ConnectivityDiagnostics.userFriendlyMessage(forErrorCode: code, message: error)
            } ?? error

            // Determine title based on error type
            let title = connectionLost ? "Connection Lost" : "Error Loading Folders"

            StatusAlertView(
                variant: .destructive,
                title: title,
                message: friendlyMessage
            )

            // Show suggested actions based on error code
            if let code = errorCode {
                let suggestion = getSuggestedAction(for: code)
                if !suggestion.isEmpty {
                    Text(suggestion)
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)
                }
            }

            HStack(spacing: 12) {
                if connectionLost {
                    Button("Reconnect") {
                        reconnectToDesktop()
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button("Select Different Device") {
                        appState.navigateToDeviceSelection()
                    }
                    .buttonStyle(SecondaryButtonStyle())
                } else {
                    Button("Try Again") {
                        if !currentPath.isEmpty {
                            loadFolders(at: currentPath)
                        } else {
                            loadHomeDirectory()
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
        }
    }

    private var footerActionsSection: some View {
        VStack(spacing: 12) {
            Button(isApplyingSelection ? "Applying Selection..." : "Select This Folder") {
                selectCurrentFolder()
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(currentPath.isEmpty || isApplyingSelection)
        }
    }

    private func loadHomeDirectory() {
        isLoading = true
        errorMessage = nil
        errorCode = nil
        connectionLost = false

        Task {
            do {
                for try await response in CommandRouter.appGetUserHomeDirectory() {
                    if let result = response.result?.value as? [String: Any],
                       let homeDir = result["homeDirectory"] as? String {
                        await MainActor.run {
                            loadFolders(at: homeDir)
                        }
                        return
                    }

                    if let error = response.error {
                        await MainActor.run {
                            errorMessage = error.message
                            errorCode = extractErrorCode(from: error.message)
                            checkConnectionLost(errorCode: errorCode)
                            isLoading = false
                        }
                        return
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    if let relayError = error as? ServerRelayError {
                        let info = extractErrorInfo(from: relayError)
                        errorCode = info.code
                        errorMessage = info.message
                    } else {
                        errorCode = "unknown_error"
                    }
                    checkConnectionLost(errorCode: errorCode)
                    isLoading = false
                }
            }
        }
    }

    private func loadFolders(at path: String) {
        isLoading = true
        errorMessage = nil
        errorCode = nil
        connectionLost = false

        Task {
            do {
                for try await response in CommandRouter.appListFolders(path) {
                    if let result = response.result?.value as? [String: Any] {
                        let currentPath = result["currentPath"] as? String ?? path
                        let parentPath = result["parentPath"] as? String
                        let foldersData = result["folders"] as? [[String: Any]] ?? []

                        let folders = foldersData.compactMap { dict -> ProjectFolderItem? in
                            guard let name = dict["name"] as? String,
                                  let path = dict["path"] as? String else {
                                return nil
                            }
                            return ProjectFolderItem(name: name, path: path)
                        }

                        await MainActor.run {
                            self.currentPath = currentPath
                            self.parentPath = parentPath
                            self.folders = folders
                            self.isLoading = false
                        }
                        return
                    }

                    if let error = response.error {
                        await MainActor.run {
                            errorMessage = error.message
                            errorCode = extractErrorCode(from: error.message)
                            checkConnectionLost(errorCode: errorCode)
                            isLoading = false
                        }
                        return
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    if let relayError = error as? ServerRelayError {
                        let info = extractErrorInfo(from: relayError)
                        errorCode = info.code
                        errorMessage = info.message
                    } else {
                        errorCode = "unknown_error"
                    }
                    checkConnectionLost(errorCode: errorCode)
                    isLoading = false
                }
            }
        }
    }

    private func selectCurrentFolder() {
        guard !currentPath.isEmpty else { return }
        isApplyingSelection = true

        Task {
            await MainActor.run {
                appState.setSelectedProjectDirectory(currentPath)

                let projectName = URL(fileURLWithPath: currentPath).lastPathComponent
                let projectHash = String(currentPath.hashValue)
                let projectInfo = ProjectInfo(
                    name: projectName,
                    directory: currentPath,
                    hash: projectHash
                )
                container.setCurrentProject(projectInfo)
            }

            Task {
                do {
                    for try await _ in CommandRouter.appSetProjectDirectory(currentPath) {
                        break
                    }
                } catch {
                    print("[ProjectFolderSelection] Warning: Failed to set project directory on device: \(error)")
                }
            }

            Task {
                do {
                    try await container.sessionService.fetchSessions(projectDirectory: currentPath)
                } catch {
                    print("[ProjectFolderSelection] Warning: Failed to fetch sessions: \(error)")
                }
            }

            await MainActor.run {
                isApplyingSelection = false
            }
        }
    }

    // MARK: - Error Handling Helpers

    /// Extract error information from ServerRelayError
    private func extractErrorInfo(from error: ServerRelayError) -> (code: String, message: String) {
        switch error {
        case .serverError(let code, let message):
            return (code, message)
        case .timeout:
            return ("timeout", "Connection timed out")
        case .notConnected:
            return ("not_connected", "Not connected to relay")
        case .networkError(let underlyingError):
            return ("network_error", underlyingError.localizedDescription)
        case .invalidURL:
            return ("invalid_url", "Invalid relay URL")
        case .invalidState(let message):
            return ("invalid_state", message)
        case .encodingError(let underlyingError):
            return ("encoding_error", underlyingError.localizedDescription)
        case .disconnected:
            return ("disconnected", "Disconnected from relay")
        }
    }

    /// Extract error code from error message string (if it looks like a code)
    private func extractErrorCode(from message: String) -> String? {
        let commonErrorCodes = ["relay_failed", "timeout", "not_connected", "disconnected", "network_error", "auth_required"]
        for code in commonErrorCodes {
            if message.lowercased().contains(code) {
                return code
            }
        }
        return nil
    }

    /// Check if error code indicates connection loss
    private func checkConnectionLost(errorCode: String?) {
        let connectionLostCodes = ["relay_failed", "disconnected", "not_connected", "connection_lost", "network_error"]
        if let code = errorCode, connectionLostCodes.contains(code) {
            connectionLost = true
        }
    }

    /// Get suggested action for error code
    private func getSuggestedAction(for errorCode: String) -> String {
        switch errorCode {
        case "relay_failed", "not_connected", "disconnected":
            return "Ensure the desktop app is running and 'Allow Remote Access' is enabled in Settings."

        case "timeout":
            return "Check your network connection and ensure the desktop is online and accessible."

        case "network_error":
            return "Check your internet connection and try again."

        case "auth_required":
            return "Please sign in to continue."

        case "connection_lost":
            return "The desktop became unavailable. Check if the app is still running."

        default:
            return "If the problem persists, try selecting a different device or restarting the desktop app."
        }
    }

    /// Reconnect to desktop when connection is lost
    private func reconnectToDesktop() {
        guard let deviceId = multi.activeDeviceId else {
            appState.navigateToDeviceSelection()
            return
        }

        isLoading = true
        errorMessage = nil
        errorCode = nil
        connectionLost = false

        Task {
            let result = await multi.addConnection(for: deviceId)
            await MainActor.run {
                switch result {
                case .success:
                    // Connection restored - retry loading
                    if !currentPath.isEmpty {
                        loadFolders(at: currentPath)
                    } else {
                        loadHomeDirectory()
                    }
                case .failure(let error):
                    errorMessage = error.localizedDescription
                    if let relayError = error as? ServerRelayError {
                        let info = extractErrorInfo(from: relayError)
                        errorCode = info.code
                        errorMessage = info.message
                    } else {
                        errorCode = "reconnection_failed"
                    }
                    connectionLost = true
                    isLoading = false
                }
            }
        }
    }
}
