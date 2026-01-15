import SwiftUI
import UIKit
import Core

// MARK: - Task Input View with Sparkles

public struct TaskInputView: View {
    @Binding var taskDescription: String

    @EnvironmentObject private var container: AppContainer
    @ObservedObject private var multiConnectionManager = MultiConnectionManager.shared

    @StateObject private var undoRedoManager = UndoRedoManager()

    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var terminalJobId: TerminalJobIdentifier? = nil
    @State private var showDeepResearch = false
    @State private var initializedForSessionId: String?
    @State private var debounceTask: Task<Void, Never>?
    @State private var historySaveTask: Task<Void, Never>?
    @State private var isEditing: Bool = false
    @State private var pendingHistoryState: HistoryState?
    @State private var forceSelectionApply: Bool = false
    @State private var prevRemoteVersion: Int64?
    @State private var prevRemoteChecksum: String?
    @State private var isApplyingRemoteMerge: Bool = false
    @State private var lastCommittedValue: String? = nil
    @State private var syncInFlight: Bool = false
    @State private var pendingSync: Bool = false

    let placeholder: String
    let onInteraction: () -> Void
    let sessionId: String
    let projectDirectory: String?

    public init(
        taskDescription: Binding<String>,
        placeholder: String = "Describe your task...",
        onInteraction: @escaping () -> Void = {},
        sessionId: String,
        projectDirectory: String?
    ) {
        self._taskDescription = taskDescription
        self.placeholder = placeholder
        self.onInteraction = onInteraction
        self.sessionId = sessionId
        self.projectDirectory = projectDirectory
    }

    public var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            // Task Editor - delegates all editor UI to TaskEditorView
            TaskEditorView(
                text: $taskDescription,
                selectedRange: $selectedRange,
                isEditing: $isEditing,
                forceSelectionApply: $forceSelectionApply,
                undoRedoManager: undoRedoManager,
                placeholder: placeholder,
                sessionId: sessionId,
                projectDirectory: projectDirectory,
                onInteraction: {
                    onInteraction()
                    debouncedSync()
                },
                onTextChanged: {
                    // TaskInputView already syncs via debouncedSync; no extra persistence needed
                },
                onImmediateSync: {
                    immediateSync()
                },
                showLanguagePicker: false,
                showEnhanceButtons: true,
                showUndoRedo: true,
                trailingToolbarContent: AnyView(trailingToolbarButtons)
            )
            .frame(maxWidth: .infinity)
            .frame(minHeight: 250)
            .padding(.bottom, Theme.Spacing.md)
        }
        .sheet(item: $terminalJobId) { item in
            NavigationStack {
                RemoteTerminalView(jobId: item.id, contextType: .taskDescription)
                    .environmentObject(container)
            }
        }
        .alert("Deep Research", isPresented: $showDeepResearch) {
            Button("Cancel", role: .cancel) {}
            Button("Start Research") {
                // Deep research implementation would go here
            }
        } message: {
            Text("This will search the web for relevant information to enhance your task description. This can be expensive in terms of API usage.")
        }
        .onAppear(perform: handleInitialLoad)
        .onChange(of: sessionId, perform: handleSessionChange)
        .onChange(of: multiConnectionManager.activeDeviceId) { _ in
            updateUndoRedoDeviceId()
        }
        .onChange(of: isEditing) { editing in
            guard !editing, let pending = pendingHistoryState else { return }
            applyHistoryState(pending)
            prevRemoteVersion = pending.version
            prevRemoteChecksum = pending.checksum
            pendingHistoryState = nil
        }
        .onDisappear {
            debounceTask?.cancel()
            historySaveTask?.cancel()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("apply-history-state"))) { notification in
            guard let userInfo = notification.userInfo,
                  let notifSessionId = userInfo["sessionId"] as? String,
                  let kind = userInfo["kind"] as? String,
                  notifSessionId == sessionId,
                  kind == "task",
                  let remoteState = userInfo["state"] as? HistoryState else {
                return
            }

            if let prev = prevRemoteVersion, remoteState.version < prev {
                return
            }
            if let prev = prevRemoteChecksum, remoteState.checksum == prev {
                return
            }

            if isEditing {
                pendingHistoryState = remoteState
                prevRemoteVersion = remoteState.version
                prevRemoteChecksum = remoteState.checksum
                return
            }

            let exportState = undoRedoManager.exportState()
            let base = lastCommittedValue ?? currentHistoryValue(exportState) ?? ""
            let local = taskDescription
            let remoteValue = currentHistoryValue(remoteState)
            let hasLocalEdits = local != base

            if remoteValue == nil {
                prevRemoteVersion = remoteState.version
                prevRemoteChecksum = remoteState.checksum

                if !hasLocalEdits {
                    taskDescription = ""
                    selectedRange = NSRange(location: 0, length: 0)
                    forceSelectionApply = true
                    undoRedoManager.applyRemoteHistoryState(remoteState, suppressRecording: true)
                    lastCommittedValue = ""
                }
                return
            }

            let remote = remoteValue ?? ""

            if remote == local {
                prevRemoteVersion = remoteState.version
                prevRemoteChecksum = remoteState.checksum

                undoRedoManager.applyRemoteHistoryState(remoteState, suppressRecording: true)
                lastCommittedValue = remote
                return
            }

            if !hasLocalEdits {
                let cursorPos = selectedRange.location
                let mergeResult = TextMerger.merge(
                    base: base,
                    local: local,
                    remote: remote,
                    cursorOffset: cursorPos
                )

                if mergeResult.mergedText != taskDescription {
                    taskDescription = mergeResult.mergedText
                    selectedRange = NSRange(location: mergeResult.newCursorOffset, length: 0)
                    forceSelectionApply = true
                }

                prevRemoteVersion = remoteState.version
                prevRemoteChecksum = remoteState.checksum

                undoRedoManager.applyRemoteHistoryState(remoteState, suppressRecording: true)
                lastCommittedValue = mergeResult.mergedText
                return
            }

            isApplyingRemoteMerge = true

            let cursorPos = selectedRange.location
            let mergeResult = TextMerger.merge(
                base: base,
                local: local,
                remote: remote,
                cursorOffset: cursorPos
            )

            if mergeResult.mergedText == taskDescription {
                prevRemoteVersion = remoteState.version
                prevRemoteChecksum = remoteState.checksum
                isApplyingRemoteMerge = false
                return
            }

            taskDescription = mergeResult.mergedText
            selectedRange = NSRange(location: mergeResult.newCursorOffset, length: 0)
            forceSelectionApply = true
            undoRedoManager.saveState(mergeResult.mergedText)

            prevRemoteVersion = remoteState.version
            prevRemoteChecksum = remoteState.checksum

            isApplyingRemoteMerge = false
        }
    }

    // MARK: - Views

    private var trailingToolbarButtons: some View {
        HStack(spacing: 12) {
            Button {
                terminalJobId = TerminalJobIdentifier(id: "terminal:task:\(sessionId)")
            } label: {
                Image(systemName: "terminal")
                    .font(.system(size: 16))
            }
            .buttonStyle(UtilityButtonStyle())
            .accessibilityLabel("Terminal")

            // Deep Research button
            Button {
                showDeepResearch = true
            } label: {
                Image(systemName: "sparkle.magnifyingglass")
                    .font(.system(size: 16))
            }
            .buttonStyle(UtilityButtonStyle())
            .disabled(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1.0)
            .accessibilityLabel("Deep Research")
        }
    }

    // MARK: - Helper Methods

    private func handleInitialLoad() {
        Task {
            updateUndoRedoDeviceId()
            guard initializedForSessionId != sessionId else { return }
            await applyAuthoritativeTaskDescription(for: sessionId)
        }
    }

    private func handleSessionChange(_ newSessionId: String) {
        initializedForSessionId = nil
        debounceTask?.cancel()
        prevRemoteVersion = nil
        prevRemoteChecksum = nil
        lastCommittedValue = nil
        pendingHistoryState = nil
        isApplyingRemoteMerge = false
        syncInFlight = false
        pendingSync = false
        updateUndoRedoDeviceId()
        Task {
            await applyAuthoritativeTaskDescription(for: newSessionId)
        }
    }

    private func applyAuthoritativeTaskDescription(for sessionId: String) async {
        do {
            let state = try await container.sessionService.getHistoryState(
                sessionId: sessionId,
                kind: "task",
                summaryOnly: false
            )
            await MainActor.run {
                initializedForSessionId = sessionId
                applyHistoryState(state)
            }
        } catch {
            await MainActor.run {
                initializedForSessionId = sessionId
                applyFallbackSessionDescription()
            }
        }
    }

    private func applyHistoryState(_ state: HistoryState) {
        undoRedoManager.applyRemoteHistoryState(state, suppressRecording: true)
        if let value = currentHistoryValue(state) {
            applyTaskTextIfNeeded(value, resetHistory: false, allowEmpty: true)
            lastCommittedValue = value
        } else {
            applyFallbackSessionDescription(resetHistory: true)
        }
        prevRemoteVersion = state.version
        prevRemoteChecksum = state.checksum
    }

    private func updateUndoRedoDeviceId() {
        let deviceId = multiConnectionManager.activeDeviceId?.uuidString.lowercased()
        undoRedoManager.setDeviceId(deviceId)
    }

    private func currentHistoryValue(_ state: HistoryState) -> String? {
        guard !state.entries.isEmpty else { return nil }
        let clamped = min(max(0, Int(state.currentIndex)), state.entries.count - 1)
        return state.entries[clamped].value
    }

    private func applyFallbackSessionDescription(resetHistory: Bool = false) {
        guard let desc = container.sessionService.currentSession?.taskDescription?.trimmingCharacters(in: .whitespacesAndNewlines),
              !desc.isEmpty else {
            return
        }

        applyTaskTextIfNeeded(desc, resetHistory: resetHistory, allowEmpty: false)
    }

    private func applyTaskTextIfNeeded(_ text: String, resetHistory: Bool, allowEmpty: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !allowEmpty && trimmed.isEmpty {
            return
        }

        let currentTrimmed = taskDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        if allowEmpty {
            guard taskDescription != text else { return }
        } else {
            guard currentTrimmed != trimmed else { return }
        }

        if resetHistory {
            undoRedoManager.reset(with: allowEmpty ? text : trimmed)
        }
        taskDescription = allowEmpty ? text : trimmed
        lastCommittedValue = allowEmpty ? text : trimmed

        // Reset caret/selection state after text replacement on session change
        let newCount = (allowEmpty ? text : trimmed).count
        selectedRange = NSRange(location: newCount, length: 0)
        if !isEditing {
            forceSelectionApply = true
        }
    }

    private func immediateSync() {
        if isApplyingRemoteMerge {
            return
        }
        historySaveTask?.cancel()
        undoRedoManager.saveState(taskDescription)
        debounceTask?.cancel()
        debounceTask = Task {
            await performSync()
        }
    }

    private func debouncedSync() {
        if isApplyingRemoteMerge {
            return
        }
        scheduleHistorySnapshot()
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled else { return }
            await performSync()
        }
    }

    private func scheduleHistorySnapshot() {
        historySaveTask?.cancel()
        historySaveTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            undoRedoManager.saveState(taskDescription)
        }
    }

    private func performSync() async {
        guard !Task.isCancelled else { return }
        let shouldStart = await MainActor.run {
            if syncInFlight {
                pendingSync = true
                return false
            }
            syncInFlight = true
            return true
        }
        guard shouldStart else { return }
        defer {
            Task { @MainActor in
                syncInFlight = false
                if pendingSync {
                    pendingSync = false
                    Task { await performSync() }
                }
            }
        }

        func buildStateSnapshot() async -> HistoryState {
            let snapshot = await MainActor.run { undoRedoManager.exportStateSnapshot() }
            let checksum = await Task.detached(priority: .utility) {
                UndoRedoManager.calculateChecksum(
                    entries: snapshot.entries,
                    currentIndex: snapshot.currentIndex,
                    version: snapshot.version
                )
            }.value
            return HistoryState(
                entries: snapshot.entries,
                currentIndex: snapshot.currentIndex,
                version: snapshot.version,
                checksum: checksum
            )
        }

        let state = await buildStateSnapshot()

        do {
            let newState = try await container.sessionService.syncHistoryState(
                sessionId: sessionId,
                kind: "task",
                state: state,
                expectedVersion: state.version
            )
            await MainActor.run {
                undoRedoManager.applyRemoteHistoryState(newState, suppressRecording: true)
                isEditing = false
                lastCommittedValue = currentHistoryValue(newState)
                if let pending = pendingHistoryState {
                    applyHistoryState(pending)
                    pendingHistoryState = nil
                }
            }
        } catch {
            print("[TaskInputView] Failed to sync task description to desktop: \(error.localizedDescription)")

            await MainActor.run {
                isEditing = false
            }

            if let dataError = error as? DataServiceError, case .offline = dataError {
                return
            }

            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }

            let currentState = await buildStateSnapshot()
            if currentState.checksum == state.checksum {
                do {
                    let retryState = try await container.sessionService.syncHistoryState(
                        sessionId: sessionId,
                        kind: "task",
                        state: currentState,
                        expectedVersion: currentState.version
                    )
                    await MainActor.run {
                        undoRedoManager.applyRemoteHistoryState(retryState, suppressRecording: true)
                        lastCommittedValue = currentHistoryValue(retryState)
                    }
                    print("[TaskInputView] Retry sync succeeded")
                } catch {
                    print("[TaskInputView] Retry sync also failed: \(error.localizedDescription)")
                }
            }
        }
    }

}

struct TerminalJobIdentifier: Identifiable {
    let id: String
}

#Preview {
    @State var task = ""
    return TaskInputView(
        taskDescription: $task,
        sessionId: "preview-session",
        projectDirectory: "/path/to/project"
    )
    .padding()
}
