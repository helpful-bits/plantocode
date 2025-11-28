import SwiftUI
import UIKit
import Core

// MARK: - Task Input View with Sparkles

public struct TaskInputView: View {
    @Binding var taskDescription: String

    @EnvironmentObject private var container: AppContainer

    @StateObject private var undoRedoManager = UndoRedoManager()

    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var terminalJobId: TerminalJobIdentifier? = nil
    @State private var showDeepResearch = false
    @State private var initializedForSessionId: String?
    @State private var debounceTask: Task<Void, Never>?
    @State private var isEditing: Bool = false
    @State private var pendingHistoryState: HistoryState?
    @State private var forceSelectionApply: Bool = false
    @State private var prevRemoteVersion: Int64?
    @State private var prevRemoteChecksum: String?

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
        .onDisappear {
            debounceTask?.cancel()
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

            let base = undoRedoManager.exportState().entries.last?.value ?? ""
            let local = taskDescription
            guard let remoteValue = container.sessionService.lastNonEmptyHistoryValue(remoteState) else {
                return
            }
            let remote = remoteValue

            let cursorPos = selectedRange.location
            let mergeResult = TextMerger.merge(base: base, local: local, remote: remote, cursorOffset: cursorPos)
            taskDescription = mergeResult.mergedText
            selectedRange = NSRange(location: mergeResult.newCursorOffset, length: 0)
            forceSelectionApply = true

            prevRemoteVersion = remoteState.version
            prevRemoteChecksum = remoteState.checksum

            Task {
                do {
                    let localState = undoRedoManager.exportState()
                    let merged = try await container.sessionService.mergeHistoryState(
                        sessionId: sessionId,
                        kind: kind,
                        remoteState: remoteState
                    )
                    await MainActor.run {
                        undoRedoManager.applyRemoteHistoryState(merged, suppressRecording: true)
                    }
                } catch {
                }
            }
        }
    }

    // MARK: - Views

    private var trailingToolbarButtons: some View {
        HStack(spacing: 12) {
            // Terminal button
            Button {
                terminalJobId = TerminalJobIdentifier(id: "task-terminal-\(sessionId)")
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
            guard initializedForSessionId != sessionId else { return }
            await applyAuthoritativeTaskDescription(for: sessionId)
        }
    }

    private func handleSessionChange(_ newSessionId: String) {
        initializedForSessionId = nil
        debounceTask?.cancel()
        Task {
            await applyAuthoritativeTaskDescription(for: newSessionId)
        }
    }

    private func applyAuthoritativeTaskDescription(for sessionId: String) async {
        do {
            let state = try await container.sessionService.getHistoryState(sessionId: sessionId, kind: "task")
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
        if let value = container.sessionService.lastNonEmptyHistoryValue(state) {
            applyTaskTextIfNeeded(value, resetHistory: false)
        } else {
            applyFallbackSessionDescription(resetHistory: true)
        }
    }

    private func applyFallbackSessionDescription(resetHistory: Bool = false) {
        guard let desc = container.sessionService.currentSession?.taskDescription?.trimmingCharacters(in: .whitespacesAndNewlines),
              !desc.isEmpty else {
            return
        }

        applyTaskTextIfNeeded(desc, resetHistory: resetHistory)
    }

    private func applyTaskTextIfNeeded(_ text: String, resetHistory: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard taskDescription.trimmingCharacters(in: .whitespacesAndNewlines) != trimmed else { return }

        if resetHistory {
            undoRedoManager.reset(with: trimmed)
        }
        taskDescription = trimmed

        // Reset caret/selection state after text replacement on session change
        let newCount = trimmed.count
        selectedRange = NSRange(location: newCount, length: 0)
        forceSelectionApply = true
    }

    private func debouncedSync() {
        undoRedoManager.saveState(taskDescription)
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }

            do {
                let state = undoRedoManager.exportState()
                let newState = try await container.sessionService.syncHistoryState(
                    sessionId: sessionId,
                    kind: "task",
                    state: state,
                    expectedVersion: state.version
                )
                await MainActor.run {
                    undoRedoManager.applyRemoteHistoryState(newState, suppressRecording: true)
                    isEditing = false
                    if let pending = pendingHistoryState {
                        applyHistoryState(pending)
                        pendingHistoryState = nil
                    }
                }
            } catch {
                await MainActor.run {
                    isEditing = false
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
