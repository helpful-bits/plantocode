import SwiftUI
import Core

public struct TerminalComposeView: View {
    let jobId: String
    let autoStartRecording: Bool

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer

    @State private var composedText = ""
    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var isEditing: Bool = false
    @State private var forceSelectionApply: Bool = false
    @StateObject private var undoRedoManager = UndoRedoManager(maxHistorySize: 10)

    @State private var errorMessage: String?
    @State private var isSending = false

    public init(jobId: String, autoStartRecording: Bool = false) {
        self.jobId = jobId
        self.autoStartRecording = autoStartRecording
    }

    // Persistent storage key for composed text
    private var storageKey: String {
        "terminal_compose_\(jobId)"
    }

    private func loadComposedText() {
        let saved = UserDefaults.standard.string(forKey: storageKey)
        if let saved = saved, !saved.isEmpty {
            composedText = saved
            undoRedoManager.reset(with: saved)
        } else {
            composedText = ""
            undoRedoManager.reset(with: "")
        }
    }

    private func saveComposedText() {
        UserDefaults.standard.set(composedText, forKey: storageKey)
    }

    private func clearComposedText() {
        composedText = ""
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Error message banner
                if let error = errorMessage {
                    HStack {
                        Text("Error: \(error)")
                            .small()
                            .foregroundColor(Color.destructive)
                        Spacer()
                        Button(action: { errorMessage = nil }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(Color.muted)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.background.opacity(0.9))
                }

                // Task Editor with integrated voice, enhance, and undo/redo
                TaskEditorView(
                    text: $composedText,
                    selectedRange: $selectedRange,
                    isEditing: $isEditing,
                    forceSelectionApply: $forceSelectionApply,
                    undoRedoManager: undoRedoManager,
                    autoStartRecording: autoStartRecording,
                    placeholder: "Compose text to send to terminal...",
                    sessionId: container.sessionService.currentSession?.id ?? "unknown",
                    projectDirectory: container.sessionService.currentSession?.projectDirectory,
                    onInteraction: {
                        undoRedoManager.saveState(composedText)
                        saveComposedText()
                    },
                    onTextChanged: {
                        saveComposedText()
                    },
                    showLanguagePicker: true,
                    showEnhanceButtons: true,
                    showUndoRedo: true
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.codeBackground)
            .navigationTitle("Compose")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(Color.foreground)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Send") {
                        sendToTerminal()
                    }
                    .buttonStyle(CompactPrimaryButtonStyle())
                    .disabled(composedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
                    .accessibilityLabel("Send to Terminal")
                    .accessibilityHint("Transfers and runs the command")
                }
            }
            .onAppear {
                loadComposedText()
            }
        }
    }

    private func sendToTerminal() {
        let text = composedText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }

        isSending = true
        errorMessage = nil

        Task {
            do {
                try await container.terminalService.sendLargeText(
                    jobId: jobId,
                    text: text,
                    appendCarriageReturn: true
                )

                await MainActor.run {
                    isSending = false
                    clearComposedText() // Clear saved text after successful send
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    isSending = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

}

#Preview {
    TerminalComposeView(jobId: "sample-job-id", autoStartRecording: false)
        .environmentObject(AppContainer(
            baseURL: URL(string: "http://localhost:3000")!,
            deviceId: "preview-device"
        ))
}
