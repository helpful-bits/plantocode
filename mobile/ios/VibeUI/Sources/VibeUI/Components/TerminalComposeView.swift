import SwiftUI
import Core
import Combine

public struct TerminalComposeView: View {
    let jobId: String
    let autoStartRecording: Bool

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
    @State private var transcriptionPrompt: String?
    @State private var transcriptionTemperature: Double?

    @State private var hasAutoStarted = false
    @State private var forceSelectionApply: Bool = false

    public init(jobId: String, autoStartRecording: Bool = false) {
        self.jobId = jobId
        self.autoStartRecording = autoStartRecording
    }

    // Persistent storage key for composed text
    private var storageKey: String {
        "terminal_compose_\(jobId)"
    }

    private func loadComposedText() {
        if let saved = UserDefaults.standard.string(forKey: storageKey), !saved.isEmpty {
            composedText = saved
            undoRedoManager.reset(with: saved)
            lastSavedText = saved
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
                // Text Editor
                SelectableTextView(
                    text: $composedText,
                    selectedRange: $selectedRange,
                    forceApplySelection: $forceSelectionApply,
                    placeholder: "Compose text to send to terminal...",
                    onInteraction: {
                        saveToUndoHistory()
                        saveComposedText()
                    },
                    textColor: UIColor { traitCollection in
                        traitCollection.userInterfaceStyle == .dark
                            ? UIColor(Color(red: 0.90, green: 0.90, blue: 0.90))
                            : UIColor(Color(red: 0.95, green: 0.95, blue: 0.95))
                    },
                    backgroundColor: UIColor { traitCollection in
                        traitCollection.userInterfaceStyle == .dark
                            ? UIColor(Color(red: 0.001, green: 0.029, blue: 0.035))
                            : UIColor(Color(red: 0.06, green: 0.09, blue: 0.16))
                    },
                    font: UIFont.monospacedSystemFont(ofSize: 15, weight: .regular)
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
                        // 1. Voice Recording Button (using reusable component)
                        VoiceRecordingButton(
                            text: $composedText,
                            selectedRange: $selectedRange,
                            selectedLanguage: $selectedLanguage,
                            voiceService: voiceDictationService,
                            transcriptionModel: transcriptionModel,
                            transcriptionPrompt: transcriptionPrompt,
                            transcriptionTemperature: transcriptionTemperature,
                            onError: { error in
                                errorMessage = error
                            },
                            onTranscriptionComplete: {
                                forceSelectionApply = true
                                undoRedoManager.saveState(composedText)
                            }
                        )

                        if !voiceDictationService.isRecording {
                            // 2. Language Picker
                            Button(action: { showingLanguagePicker = true }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "globe")
                                        .font(.system(size: 16))
                                    Text(languageCode(selectedLanguage))
                                        .font(.system(size: 12))
                                }
                            }
                            .buttonStyle(UtilityButtonStyle())

                            // 3. Sparkles - Enhance text
                            Button(action: enhanceText) {
                                HStack(spacing: 4) {
                                    if textEnhancementService.isEnhancing {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle())
                                            .scaleEffect(0.7)
                                    } else {
                                        Image(systemName: "sparkles")
                                            .font(.system(size: 16))
                                    }
                                }
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .disabled(textEnhancementService.isEnhancing || composedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityLabel("Enhance text")
                            .accessibilityHint("Improve the quality and clarity of the text")

                            // 3b. Wand - Refine text
                            Button(action: refineText) {
                                HStack(spacing: 4) {
                                    if textEnhancementService.isEnhancing {
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle())
                                            .scaleEffect(0.7)
                                    } else {
                                        Image(systemName: "wand.and.stars")
                                            .font(.system(size: 16))
                                    }
                                }
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .disabled(textEnhancementService.isEnhancing || composedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            .accessibilityLabel("Refine text")
                            .accessibilityHint("Refine and improve the selected text or full content")

                            // 4. Undo Button
                            Button(action: performUndo) {
                                Image(systemName: "arrow.uturn.backward")
                                    .font(.system(size: 16))
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .disabled(!undoRedoManager.canUndo)
                            .opacity(undoRedoManager.canUndo ? 1.0 : 0.4)
                            .accessibilityLabel("Undo")

                            // 5. Redo Button
                            Button(action: performRedo) {
                                Image(systemName: "arrow.uturn.forward")
                                    .font(.system(size: 16))
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .disabled(!undoRedoManager.canRedo)
                            .opacity(undoRedoManager.canRedo ? 1.0 : 0.4)
                            .accessibilityLabel("Redo")
                        }

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
                if composedText != lastSavedText {
                    undoRedoManager.reset(with: composedText)
                    lastSavedText = composedText
                }

                // Auto-start recording if requested
                if autoStartRecording && !hasAutoStarted && !voiceDictationService.isRecording {
                    hasAutoStarted = true
                    Task {
                        // Small delay to ensure view is fully loaded
                        try? await Task.sleep(nanoseconds: 300_000_000) // 0.3s
                        await startRecording()
                    }
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
                            transcriptionPrompt = settings.prompt
                            // Set language code from settings if available
                            if let shortCode = settings.languageCode {
                                selectedLanguage = mapShortCodeToLocale(shortCode)
                            }
                        } else {
                            // Project doesn't have voice transcription settings configured yet
                            // Fetch server defaults as fallback
                            let serverDefaults = try await settingsService.fetchServerDefaults()
                            if let defaultSettings = serverDefaults["voiceTranscription"] {
                                transcriptionModel = defaultSettings.model
                                transcriptionTemperature = defaultSettings.temperature
                                transcriptionPrompt = defaultSettings.prompt
                                if let shortCode = defaultSettings.languageCode {
                                    selectedLanguage = mapShortCodeToLocale(shortCode)
                                }
                            }
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
        saveComposedText()
    }

    private func performRedo() {
        guard let text = undoRedoManager.redo() else { return }
        composedText = text
        saveComposedText()
    }

    private func startRecording() async {
        guard !voiceDictationService.isRecording else { return }

        do {
            try await voiceDictationService.startRecording()
        } catch {
            await MainActor.run {
                errorMessage = "Failed to start recording: \(error.localizedDescription)"
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
                    saveComposedText()
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Text enhancement failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func refineText() {
        let nsString = composedText as NSString
        let textLength = nsString.length

        let textToRefine: String
        let isPartialRefinement: Bool

        if selectedRange.length > 0 && selectedRange.location != NSNotFound && selectedRange.location < textLength {
            let validLength = min(selectedRange.length, textLength - selectedRange.location)
            let validRange = NSRange(location: selectedRange.location, length: validLength)
            textToRefine = nsString.substring(with: validRange)
            isPartialRefinement = true
        } else {
            textToRefine = composedText.trimmingCharacters(in: .whitespacesAndNewlines)
            isPartialRefinement = false
        }

        guard !textToRefine.isEmpty else { return }

        Task {
            do {
                guard let session = container.sessionService.currentSession else {
                    await MainActor.run {
                        errorMessage = "No active session"
                    }
                    return
                }

                let refinedText = try await textEnhancementService.refine(
                    text: textToRefine,
                    sessionId: session.id,
                    projectDirectory: session.projectDirectory
                )

                await MainActor.run {
                    if isPartialRefinement {
                        let validLength = min(selectedRange.length, textLength - selectedRange.location)
                        let validRange = NSRange(location: selectedRange.location, length: validLength)
                        let before = nsString.substring(to: validRange.location)
                        let after = nsString.substring(from: validRange.location + validRange.length)
                        composedText = before + refinedText + after
                        let newCursorPos = before.count + refinedText.count
                        selectedRange = NSRange(location: newCursorPos, length: 0)
                    } else {
                        composedText = refinedText
                        selectedRange = NSRange(location: refinedText.count, length: 0)
                    }
                    undoRedoManager.saveState(composedText)
                    saveComposedText()
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Refinement failed: \(error.localizedDescription)"
                }
            }
        }
    }

    // Map short language code from backend (e.g., "en") to full locale code for UI (e.g., "en-US")
    private func mapShortCodeToLocale(_ shortCode: String) -> String {
        switch shortCode.lowercased() {
        case "en": return "en-US"
        case "es": return "es-ES"
        case "fr": return "fr-FR"
        case "de": return "de-DE"
        case "zh": return "zh-CN"
        default: return "en-US" // Default to English if unknown
        }
    }

    private func languageCode(_ code: String) -> String {
        switch code {
        case "en-US": return "EN"
        case "es-ES": return "ES"
        case "fr-FR": return "FR"
        case "de-DE": return "DE"
        default: return "EN"
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
