import SwiftUI
import UIKit
import Core

/// Reusable task editor component that combines text editing with voice input, enhancement, and undo/redo
/// Extracted from TaskInputView to support reuse in TerminalComposeView and other contexts
public struct TaskEditorView: View {
    // MARK: - Bindings
    @Binding var text: String
    @Binding var selectedRange: NSRange
    @Binding var isEditing: Bool
    @Binding var forceSelectionApply: Bool

    // MARK: - Parameters
    let autoStartRecording: Bool
    let placeholder: String
    let sessionId: String
    let projectDirectory: String?
    let onInteraction: () -> Void
    let onTextChanged: () -> Void
    let onImmediateSync: () -> Void
    let showLanguagePicker: Bool
    let showEnhanceButtons: Bool
    let showUndoRedo: Bool
    let trailingToolbarContent: AnyView?

    // MARK: - Environment
    @EnvironmentObject private var container: AppContainer

    // MARK: - State Objects
    @StateObject private var voiceService = VoiceDictationService.shared
    @StateObject private var enhancementService = TextEnhancementService.shared

    // MARK: - Observed Objects (passed from parent)
    @ObservedObject var undoRedoManager: UndoRedoManager

    // MARK: - Internal State
    @State private var selectedLanguage = "en-US"
    @State private var transcriptionModel: String?
    @State private var transcriptionPrompt: String?
    @State private var transcriptionTemperature: Double?
    @State private var didLoadVoiceSettings = false
    @State private var voiceError: String?

    // MARK: - Initializer
    public init(
        text: Binding<String>,
        selectedRange: Binding<NSRange>,
        isEditing: Binding<Bool>,
        forceSelectionApply: Binding<Bool>,
        undoRedoManager: UndoRedoManager,
        autoStartRecording: Bool = false,
        placeholder: String = "Describe your task...",
        sessionId: String,
        projectDirectory: String?,
        onInteraction: @escaping () -> Void = {},
        onTextChanged: @escaping () -> Void = {},
        onImmediateSync: @escaping () -> Void = {},
        showLanguagePicker: Bool = false,
        showEnhanceButtons: Bool = true,
        showUndoRedo: Bool = true,
        trailingToolbarContent: AnyView? = nil
    ) {
        self._text = text
        self._selectedRange = selectedRange
        self._isEditing = isEditing
        self._forceSelectionApply = forceSelectionApply
        self.undoRedoManager = undoRedoManager
        self.autoStartRecording = autoStartRecording
        self.placeholder = placeholder
        self.sessionId = sessionId
        self.projectDirectory = projectDirectory
        self.onInteraction = onInteraction
        self.onTextChanged = onTextChanged
        self.onImmediateSync = onImmediateSync
        self.showLanguagePicker = showLanguagePicker
        self.showEnhanceButtons = showEnhanceButtons
        self.showUndoRedo = showUndoRedo
        self.trailingToolbarContent = trailingToolbarContent
    }

    // MARK: - Body
    public var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            // Voice error banner
            if let error = voiceError {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(AppColors.destructive)
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundColor(AppColors.destructive)
                    Spacer()
                    Button(action: { voiceError = nil }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(AppColors.mutedForeground)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(AppColors.destructive.opacity(0.1))
                .cornerRadius(8)
            }

            // Text Editor
            SelectableTextView(
                text: $text,
                selectedRange: $selectedRange,
                forceApplySelection: $forceSelectionApply,
                isEditing: $isEditing,
                placeholder: placeholder,
                onInteraction: {
                    onInteraction()
                    onTextChanged()
                }
            )
            .frame(maxWidth: .infinity)
            .frame(minHeight: 250)

            // Action Buttons Row
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    // Voice Recording Button
                    VoiceRecordingButton(
                        text: $text,
                        selectedRange: $selectedRange,
                        selectedLanguage: $selectedLanguage,
                        voiceService: voiceService,
                        transcriptionModel: transcriptionModel,
                        transcriptionPrompt: transcriptionPrompt,
                        transcriptionTemperature: transcriptionTemperature,
                        autoStartRecording: autoStartRecording,
                        onError: { error in
                            voiceError = error
                        },
                        onTranscriptionComplete: {
                            // Force-apply the selection set by voice transcription
                            forceSelectionApply = true
                            undoRedoManager.saveState(text)
                            onTextChanged()
                            onImmediateSync()
                        }
                    )

                    if !voiceService.isRecording && !voiceService.isTranscribing {
                        // Language Picker (optional)
                        if showLanguagePicker {
                            Button(action: cycleLanguage) {
                                Text(languageCode(selectedLanguage))
                                    .font(.system(size: 14, weight: .medium))
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .accessibilityLabel("Change language")
                            .accessibilityHint("Currently \(selectedLanguage)")
                        }

                        // Enhancement Buttons (optional)
                        if showEnhanceButtons {
                            // Sparkles - Enhance selected text or all
                            Button(action: { enhanceSelectedOrAll() }) {
                                HStack(spacing: 4) {
                                    if enhancementService.isEnhancing {
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
                            .disabled(text.isEmpty || enhancementService.isEnhancing)
                            .accessibilityLabel("Enhance text")
                            .accessibilityHint("Enhance selected text or full description")

                            // Wand - Refine selected text or all
                            Button(action: { refineSelectedOrAll() }) {
                                HStack(spacing: 4) {
                                    if enhancementService.isEnhancing {
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
                            .disabled(text.isEmpty || enhancementService.isEnhancing)
                            .accessibilityLabel("Refine text")
                            .accessibilityHint("Refine selected text or full description")
                        }

                        // Undo/Redo Buttons (optional)
                        if showUndoRedo {
                            // Undo Button
                            Button(action: performUndo) {
                                Image(systemName: "arrow.uturn.backward")
                                    .font(.system(size: 16))
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .disabled(!undoRedoManager.canUndo)
                            .opacity(undoRedoManager.canUndo ? 1.0 : 0.4)
                            .accessibilityLabel("Undo")

                            // Redo Button
                            Button(action: performRedo) {
                                Image(systemName: "arrow.uturn.forward")
                                    .font(.system(size: 16))
                            }
                            .buttonStyle(UtilityButtonStyle())
                            .disabled(!undoRedoManager.canRedo)
                            .opacity(undoRedoManager.canRedo ? 1.0 : 0.4)
                            .accessibilityLabel("Redo")
                        }

                        // Trailing toolbar content (e.g., three-dots menu)
                        if let trailingContent = trailingToolbarContent {
                            trailingContent
                        }
                    }
                }
            }
        }
        .task(id: projectDirectory) {
            await loadVoiceSettingsTask()
        }
    }

    // MARK: - Voice Settings Loading

    private func loadVoiceSettingsTask() async {
        guard !didLoadVoiceSettings, let projectDir = projectDirectory else { return }
        didLoadVoiceSettings = true
        try? await container.settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDir)

        if let settings = container.settingsService.projectTaskSettings["voiceTranscription"] {
            transcriptionModel = settings.model
            transcriptionTemperature = settings.temperature
            transcriptionPrompt = settings.prompt
            // Backend stores short codes (e.g., "en"), but UI uses full locale codes (e.g., "en-US")
            if let shortCode = settings.languageCode {
                selectedLanguage = mapShortCodeToLocale(shortCode)
            }
        }
    }

    // MARK: - Enhancement/Refinement Helpers

    private func enhanceSelectedOrAll() {
        let ns = text as NSString
        let length = ns.length
        let range = NSIntersectionRange(selectedRange, NSRange(location: 0, length: length))
        let targetText = range.length > 0 ? ns.substring(with: range) : text

        guard !targetText.isEmpty else { return }

        Task {
            do {
                let improved = try await enhancementService.enhance(
                    text: targetText,
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                )

                await MainActor.run {
                    applyReplacement(
                        range: range.length > 0 ? range : NSRange(location: 0, length: length),
                        with: improved
                    )
                }
            } catch {
                // Error handling could be added here
            }
        }
    }

    private func refineSelectedOrAll() {
        let ns = text as NSString
        let length = ns.length
        let range = NSIntersectionRange(selectedRange, NSRange(location: 0, length: length))
        let targetText = range.length > 0 ? ns.substring(with: range) : text

        guard !targetText.isEmpty else { return }

        Task {
            do {
                let refined = try await enhancementService.refine(
                    text: targetText,
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                )

                await MainActor.run {
                    applyReplacement(
                        range: range.length > 0 ? range : NSRange(location: 0, length: length),
                        with: refined
                    )
                }
            } catch {
                // Error handling could be added here
            }
        }
    }

    private func applyReplacement(range: NSRange, with newText: String) {
        let ns = text as NSString
        let before = ns.substring(to: range.location)
        let after = ns.substring(from: range.location + range.length)
        let newAll = before + newText + after
        text = newAll
        let cursorPos = before.count + newText.count
        selectedRange = NSRange(location: cursorPos, length: 0)
        undoRedoManager.saveState(newAll)
        onInteraction()
        onTextChanged()
    }

    // MARK: - Undo/Redo Helpers

    private func performUndo() {
        guard let previousText = undoRedoManager.undo() else { return }
        text = previousText
        onTextChanged()
    }

    private func performRedo() {
        guard let nextText = undoRedoManager.redo() else { return }
        text = nextText
        onTextChanged()
    }

    // MARK: - Language Helpers

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
        case "zh-CN": return "ZH"
        default: return "EN"
        }
    }

    private func cycleLanguage() {
        let languages = ["en-US", "es-ES", "fr-FR", "de-DE", "zh-CN"]
        if let currentIndex = languages.firstIndex(of: selectedLanguage) {
            let nextIndex = (currentIndex + 1) % languages.count
            selectedLanguage = languages[nextIndex]
        } else {
            selectedLanguage = "en-US"
        }
    }

}

#Preview {
    @State var text = ""
    @State var selectedRange = NSRange(location: 0, length: 0)
    @State var isEditing = false
    @State var forceApply = false
    @StateObject var undoRedoManager = UndoRedoManager()

    return TaskEditorView(
        text: $text,
        selectedRange: $selectedRange,
        isEditing: $isEditing,
        forceSelectionApply: $forceApply,
        undoRedoManager: undoRedoManager,
        autoStartRecording: false,
        sessionId: "preview-session",
        projectDirectory: "/path/to/project"
    )
    .padding()
}
