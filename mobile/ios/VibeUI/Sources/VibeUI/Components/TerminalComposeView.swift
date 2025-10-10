import SwiftUI
import Core
import Combine

public struct TerminalComposeView: View {
    let jobId: String

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer

    @State private var composedText = ""
    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var errorMessage: String?
    @State private var isSending = false

    @StateObject private var voiceDictationService = VoiceDictationService.shared
    @StateObject private var textEnhancementService = TextEnhancementService.shared
    @StateObject private var settingsService = SettingsDataService()
    @StateObject private var undoRedoManager = UndoRedoManager()

    @State private var lastSavedText: String = ""
    @State private var saveHistoryTimer: Timer?

    @State private var showingLanguagePicker = false
    @State private var selectedLanguage = "en-US"

    @State private var transcriptionModel: String?
    @State private var transcriptionTemperature: Double?

    public init(jobId: String) {
        self.jobId = jobId
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Text Editor
                SelectableTextView(
                    text: $composedText,
                    selectedRange: $selectedRange,
                    placeholder: "Compose text to send to terminal...",
                    onInteraction: { saveToUndoHistory() }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                Divider()

                // Bottom accessory bar
                VStack(spacing: 8) {
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
                        .padding(.top, 8)
                    }

                    HStack(spacing: 12) {
                        // Mic button
                        Button(action: toggleRecording) {
                            HStack(spacing: 6) {
                                Image(systemName: voiceDictationService.isRecording ? "mic.fill" : "mic")
                                Text(voiceDictationService.isRecording ? "Stop" : "Mic")
                            }
                        }
                        .buttonStyle(RecordingButtonStyle(isRecording: voiceDictationService.isRecording))

                        // Language picker button
                        Button(action: { showingLanguagePicker = true }) {
                            Image(systemName: "globe")
                        }
                        .buttonStyle(UtilityButtonStyle())
                        .accessibilityLabel("Language")
                        .accessibilityHint("Select transcription language")

                        // Sparkles button for AI enhancement
                        Button(action: enhanceText) {
                            HStack(spacing: 6) {
                                Image(systemName: "sparkles")
                                Text("Enhance")
                            }
                        }
                        .buttonStyle(CompactSuccessButtonStyle())
                        .disabled(textToEnhance.isEmpty || textEnhancementService.isEnhancing)

                        if textEnhancementService.isEnhancing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: Color.foreground))
                                .scaleEffect(0.7)
                        }

                        // Undo button
                        Button(action: { performUndo() }) {
                            Image(systemName: "arrow.uturn.backward")
                        }
                        .buttonStyle(UtilityButtonStyle())
                        .opacity(undoRedoManager.canUndo ? 1.0 : 0.4)
                        .disabled(!undoRedoManager.canUndo)
                        .accessibilityLabel("Undo")

                        // Redo button
                        Button(action: { performRedo() }) {
                            Image(systemName: "arrow.uturn.forward")
                        }
                        .buttonStyle(UtilityButtonStyle())
                        .opacity(undoRedoManager.canRedo ? 1.0 : 0.4)
                        .disabled(!undoRedoManager.canRedo)
                        .accessibilityLabel("Redo")

                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                }
                .background(Color.background.opacity(0.9))
            }
            .background(Color.codeBackground)
            .navigationTitle("Compose")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Text("Cancel")
                            .foregroundColor(Color.foreground)
                    }
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
                if composedText != lastSavedText {
                    undoRedoManager.reset(with: composedText)
                    lastSavedText = composedText
                }
            }
            .task {
                // Fetch voice transcription settings when view appears
                do {
                    if let projectDir = container.sessionService.currentSession?.projectDirectory {
                        try await settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDir)
                        if let settings = settingsService.projectTaskSettings["voiceTranscription"] {
                            transcriptionModel = settings.model
                            transcriptionTemperature = settings.temperature
                        }
                    }
                } catch {
                    print("Failed to fetch transcription settings: \(error)")
                }
            }
            .sheet(isPresented: $showingLanguagePicker) {
                LanguagePickerSheet(selectedLanguage: $selectedLanguage)
            }
        }
    }

    private var textToEnhance: String {
        let nsString = composedText as NSString
        let textLength = nsString.length

        if selectedRange.length > 0 && selectedRange.location != NSNotFound && selectedRange.location < textLength {
            let validLength = min(selectedRange.length, textLength - selectedRange.location)
            let validRange = NSRange(location: selectedRange.location, length: validLength)
            return nsString.substring(with: validRange).trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            return composedText.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private func saveToUndoHistory() {
        saveHistoryTimer?.invalidate()
        saveHistoryTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { _ in
            undoRedoManager.saveState(composedText)
            lastSavedText = composedText
        }
    }

    private func performUndo() {
        guard let text = undoRedoManager.undo() else { return }
        composedText = text
    }

    private func performRedo() {
        guard let text = undoRedoManager.redo() else { return }
        composedText = text
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

    private func toggleRecording() {
        if voiceDictationService.isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        Task {
            do {
                try await voiceDictationService.startRecording()
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func stopRecording() {
        voiceDictationService.stopRecording()

        Task {
            do {
                // Wait for file writes to complete
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds

                // Transcribe the recording
                // Convert BCP-47 to 2-letter code for Whisper API
                for try await transcribedText in voiceDictationService.transcribe(
                    model: transcriptionModel,
                    language: String(selectedLanguage.prefix(2)),
                    prompt: nil,
                    temperature: transcriptionTemperature
                ) {
                    await MainActor.run {
                        applyInsertionOrReplacement(transcribedText)
                        undoRedoManager.saveState(composedText)
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Transcription failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func applyInsertionOrReplacement(_ text: String) {
        let nsString = composedText as NSString
        let textLength = nsString.length

        let validRange: NSRange
        if selectedRange.location == NSNotFound || selectedRange.location > textLength {
            validRange = NSRange(location: textLength, length: 0)
        } else if selectedRange.location + selectedRange.length > textLength {
            validRange = NSRange(location: selectedRange.location, length: textLength - selectedRange.location)
        } else {
            validRange = selectedRange
        }

        let beforeRange = nsString.substring(to: validRange.location)
        let afterRange = nsString.substring(from: validRange.location + validRange.length)

        let needsSpaceBefore = !beforeRange.isEmpty && !beforeRange.hasSuffix(" ") && !beforeRange.hasSuffix("\n")
        let needsSpaceAfter = !afterRange.isEmpty && !afterRange.hasPrefix(" ") && !afterRange.hasPrefix("\n")

        let prefix = needsSpaceBefore ? " " : ""
        let suffix = needsSpaceAfter ? " " : ""

        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let insertionText = prefix + trimmedText + suffix

        composedText = beforeRange + insertionText + afterRange

        let newLocation = (beforeRange as NSString).length + (insertionText as NSString).length
        selectedRange = NSRange(location: newLocation, length: 0)
    }

    private func enhanceText() {
        let nsString = composedText as NSString
        let textLength = nsString.length

        let textToEnhance: String
        let isPartialEnhancement: Bool

        if selectedRange.length > 0 && selectedRange.location != NSNotFound && selectedRange.location < textLength {
            let validLength = min(selectedRange.length, textLength - selectedRange.location)
            let validRange = NSRange(location: selectedRange.location, length: validLength)
            textToEnhance = nsString.substring(with: validRange)
            isPartialEnhancement = true
        } else {
            textToEnhance = composedText.trimmingCharacters(in: .whitespacesAndNewlines)
            isPartialEnhancement = false
        }

        guard !textToEnhance.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        Task {
            do {
                let sessionId = container.sessionService.currentSession?.id ?? "unknown"
                let projectDirectory = container.sessionService.currentSession?.projectDirectory

                let enhancedText = try await textEnhancementService.enhance(
                    text: textToEnhance,
                    context: "terminal_command",
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                )

                await MainActor.run {
                    if isPartialEnhancement {
                        let beforeSelection = nsString.substring(to: selectedRange.location)
                        let afterSelection = nsString.substring(from: selectedRange.location + selectedRange.length)

                        composedText = beforeSelection + enhancedText + afterSelection

                        let newLocation = (beforeSelection as NSString).length + (enhancedText as NSString).length
                        selectedRange = NSRange(location: newLocation, length: 0)
                    } else {
                        composedText = enhancedText
                        selectedRange = NSRange(location: (enhancedText as NSString).length, length: 0)
                    }
                    undoRedoManager.saveState(composedText)
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Text enhancement failed: \(error.localizedDescription)"
                }
            }
        }
    }
}

#Preview {
    TerminalComposeView(jobId: "sample-job-id")
        .environmentObject(AppContainer(
            baseURL: URL(string: "http://localhost:3000")!,
            deviceId: "preview-device"
        ))
}
