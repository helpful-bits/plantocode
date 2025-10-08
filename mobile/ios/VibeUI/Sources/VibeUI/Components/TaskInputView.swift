import SwiftUI
import UIKit
import Core

// MARK: - UITextView Wrapper with Selection Support

private class KeyCommandTextView: UITextView {
    var onUpArrow: (() -> Void)?
    var onDownArrow: (() -> Void)?

    override var keyCommands: [UIKeyCommand]? {
        var commands: [UIKeyCommand] = []

        if onUpArrow != nil {
            commands.append(UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(handleUpArrow)))
        }

        if onDownArrow != nil {
            commands.append(UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(handleDownArrow)))
        }

        return commands.isEmpty ? nil : commands
    }

    @objc private func handleUpArrow() {
        onUpArrow?()
    }

    @objc private func handleDownArrow() {
        onDownArrow?()
    }
}

struct SelectableTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var selectedRange: NSRange

    let placeholder: String
    let onInteraction: () -> Void
    let singleLine: Bool
    let onSubmit: (() -> Void)?
    let onUpArrow: (() -> Void)?
    let onDownArrow: (() -> Void)?

    init(
        text: Binding<String>,
        selectedRange: Binding<NSRange>,
        placeholder: String,
        onInteraction: @escaping () -> Void,
        singleLine: Bool = false,
        onSubmit: (() -> Void)? = nil,
        onUpArrow: (() -> Void)? = nil,
        onDownArrow: (() -> Void)? = nil
    ) {
        self._text = text
        self._selectedRange = selectedRange
        self.placeholder = placeholder
        self.onInteraction = onInteraction
        self.singleLine = singleLine
        self.onSubmit = onSubmit
        self.onUpArrow = onUpArrow
        self.onDownArrow = onDownArrow
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = KeyCommandTextView()
        textView.font = UIFont.systemFont(ofSize: 14)
        textView.textColor = UIColor.label
        textView.backgroundColor = UIColor.secondarySystemBackground
        textView.layer.cornerRadius = 12
        textView.layer.borderWidth = 1
        textView.layer.borderColor = UIColor.separator.cgColor
        textView.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
        textView.delegate = context.coordinator
        textView.isScrollEnabled = true
        textView.autocapitalizationType = .sentences
        textView.autocorrectionType = .yes
        textView.spellCheckingType = .yes
        textView.keyboardType = .default
        textView.textAlignment = .left

        if singleLine {
            textView.returnKeyType = .send
            textView.textContainer.maximumNumberOfLines = 1
            textView.textContainer.lineBreakMode = .byTruncatingTail
        } else {
            textView.returnKeyType = .default
        }

        textView.onUpArrow = onUpArrow
        textView.onDownArrow = onDownArrow

        context.coordinator.textView = textView

        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        // Store reference to textView in coordinator
        context.coordinator.textView = uiView

        if singleLine {
            let sanitizedText = text.replacingOccurrences(of: "\n", with: " ")
            if uiView.text != sanitizedText {
                uiView.text = sanitizedText
            }
        } else {
            if uiView.text != text {
                uiView.text = text
            }
        }

        // Update selection if it changed programmatically
        if uiView.selectedRange.location != selectedRange.location || uiView.selectedRange.length != selectedRange.length {
            // Validate range before setting
            let textLength = (uiView.text as NSString).length
            if selectedRange.location != NSNotFound && selectedRange.location <= textLength {
                let validLength = min(selectedRange.length, textLength - selectedRange.location)
                uiView.selectedRange = NSRange(location: selectedRange.location, length: validLength)

                // Scroll to make cursor visible
                DispatchQueue.main.async {
                    if let selectedTextRange = uiView.selectedTextRange {
                        let rect = uiView.caretRect(for: selectedTextRange.start)
                        uiView.scrollRectToVisible(rect, animated: true)
                    }
                }
            }
        }

        // Update placeholder visibility
        if text.isEmpty {
            if uiView.subviews.first(where: { $0.tag == 999 }) == nil {
                let placeholderLabel = UILabel()
                placeholderLabel.text = placeholder
                placeholderLabel.font = UIFont.systemFont(ofSize: 14)
                placeholderLabel.textColor = UIColor.tertiaryLabel
                placeholderLabel.tag = 999
                placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
                uiView.addSubview(placeholderLabel)

                NSLayoutConstraint.activate([
                    placeholderLabel.topAnchor.constraint(equalTo: uiView.topAnchor, constant: 16),
                    placeholderLabel.leadingAnchor.constraint(equalTo: uiView.leadingAnchor, constant: 16)
                ])
            }
        } else {
            uiView.subviews.first(where: { $0.tag == 999 })?.removeFromSuperview()
        }
    }

    class Coordinator: NSObject, UITextViewDelegate {
        var parent: SelectableTextView
        weak var textView: UITextView?
        var keyboardHeight: CGFloat = 0

        init(_ parent: SelectableTextView) {
            self.parent = parent
            super.init()
            setupKeyboardObservers()
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        private func setupKeyboardObservers() {
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(keyboardWillShow),
                name: UIResponder.keyboardWillShowNotification,
                object: nil
            )
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(keyboardWillHide),
                name: UIResponder.keyboardWillHideNotification,
                object: nil
            )
        }

        @objc private func keyboardWillShow(_ notification: Notification) {
            guard let textView = textView,
                  let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                  let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double else {
                return
            }

            keyboardHeight = keyboardFrame.height

            UIView.animate(withDuration: duration) {
                // Calculate bottom inset accounting for tab bar
                let window = UIApplication.shared.windows.first { $0.isKeyWindow }
                let bottomSafeArea = window?.safeAreaInsets.bottom ?? 0
                let tabBarHeight: CGFloat = 83 // Tab bar height
                let adjustedHeight = keyboardFrame.height - bottomSafeArea - tabBarHeight

                textView.contentInset.bottom = adjustedHeight
                textView.scrollIndicatorInsets.bottom = adjustedHeight

                // Scroll to cursor position with padding
                if let selectedRange = textView.selectedTextRange {
                    let rect = textView.caretRect(for: selectedRange.start)
                    var visibleRect = rect
                    visibleRect.origin.y -= 20 // Add some padding above cursor
                    visibleRect.size.height += 40
                    textView.scrollRectToVisible(visibleRect, animated: false)
                }
            }
        }

        @objc private func keyboardWillHide(_ notification: Notification) {
            guard let textView = textView,
                  let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double else {
                return
            }

            keyboardHeight = 0

            UIView.animate(withDuration: duration) {
                textView.contentInset.bottom = 0
                textView.scrollIndicatorInsets.bottom = 0
            }
        }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            if parent.singleLine {
                if text == "\n" {
                    parent.onSubmit?()
                    return false
                }

                if text.contains("\n") {
                    let sanitized = text.replacingOccurrences(of: "\n", with: " ")
                    let currentText = textView.text as NSString
                    let newText = currentText.replacingCharacters(in: range, with: sanitized)

                    DispatchQueue.main.async { [weak self] in
                        self?.parent.text = newText
                    }
                    return false
                }
            }

            return true
        }

        func textViewDidChange(_ textView: UITextView) {
            self.textView = textView
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.parent.text = textView.text
                self.parent.onInteraction()

                // Ensure cursor remains visible
                if let selectedRange = textView.selectedTextRange {
                    let rect = textView.caretRect(for: selectedRange.start)
                    textView.scrollRectToVisible(rect, animated: true)
                }
            }
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            self.textView = textView
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.parent.selectedRange = textView.selectedRange
            }
        }

        @objc func dismissKeyboard() {
            textView?.resignFirstResponder()
        }
    }
}

// MARK: - Task Input View with Sparkles

public struct TaskInputView: View {
    @Binding var taskDescription: String

    @StateObject private var voiceService = VoiceDictationService.shared
    @StateObject private var enhancementService = TextEnhancementService.shared
    @StateObject private var settingsService = SettingsDataService()

    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var showingLanguagePicker = false
    @State private var selectedLanguage = "en-US"
    @State private var recordingDuration: TimeInterval = 0
    @State private var timer: Timer?
    @State private var showDeepResearch = false
    @State private var selectionRect: CGRect = .zero
    @State private var isEnhancingSelection = false
    @State private var transcriptionModel: String?
    @State private var transcriptionPrompt: String?
    @State private var transcriptionTemperature: Double?

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
        VStack(spacing: 20) {
            // Text Editor with Selection Support
            ZStack(alignment: .topTrailing) {
                SelectableTextView(
                    text: $taskDescription,
                    selectedRange: $selectedRange,
                    placeholder: placeholder,
                    onInteraction: onInteraction
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .frame(minHeight: 250)
                .gesture(
                    DragGesture()
                        .onEnded { value in
                            if value.translation.height > 50 {
                                // Swipe down to dismiss keyboard
                                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                            }
                        }
                )

                // Sparkles button - shown when text is selected
                if selectedRange.length > 0 {
                    Button(action: enhanceSelectedText) {
                        if isEnhancingSelection {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "sparkles")
                                .fontWeight(.semibold)
                        }
                    }
                    .buttonStyle(FloatingActionButtonStyle(color: .purple))
                    .disabled(isEnhancingSelection)
                    .accessibilityLabel("Enhance selected text")
                    .accessibilityHint("Improve the quality and clarity of the selected text")
                    .padding(12)
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: selectedRange.length > 0)

            // Action Buttons Row
            HStack(spacing: 12) {
                // Voice Recording Button
                Button(action: toggleRecording) {
                    HStack(spacing: 6) {
                        Image(systemName: voiceService.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                            .font(.system(size: 18))

                        if voiceService.isRecording {
                            Text(formatDuration(recordingDuration))
                                .font(.system(.caption, design: .monospaced))

                            // Simple audio level visualization
                            HStack(spacing: 2) {
                                ForEach(0..<5, id: \.self) { _ in
                                    Capsule()
                                        .fill(voiceService.isRecording ? Color.white : Color.red)
                                        .frame(width: 2, height: CGFloat.random(in: 4...12))
                                }
                            }
                        } else {
                            Text("Voice")
                        }
                    }
                }
                .buttonStyle(RecordingButtonStyle(isRecording: voiceService.isRecording))

                // Deep Research Button
                Button(action: { showDeepResearch = true }) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkle.magnifyingglass")
                            .font(.system(size: 18))
                        Text("Deep Research")
                    }
                }
                .buttonStyle(UtilityButtonStyle())
                .disabled(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if !voiceService.isRecording {
                    // Language Picker
                    Button(action: { showingLanguagePicker = true }) {
                        HStack(spacing: 4) {
                            Image(systemName: "globe")
                                .font(.system(size: 16))
                            Text(languageCode(selectedLanguage))
                                .font(.system(size: 12))
                        }
                    }
                    .buttonStyle(UtilityButtonStyle())
                }

                Spacer()
            }
        }
        .sheet(isPresented: $showingLanguagePicker) {
            LanguagePickerSheet(selectedLanguage: $selectedLanguage)
        }
        .alert("Deep Research", isPresented: $showDeepResearch) {
            Button("Cancel", role: .cancel) {}
            Button("Start Research") {
                // Deep research implementation would go here
            }
        } message: {
            Text("This will search the web for relevant information to enhance your task description. This can be expensive in terms of API usage.")
        }
        .task {
            // Fetch voice transcription settings when view appears
            if let projectDir = projectDirectory {
                do {
                    try await settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDir)
                    if let settings = settingsService.projectTaskSettings["voiceTranscription"] {
                        transcriptionModel = settings.model
                        transcriptionTemperature = settings.temperature
                        // Note: prompt is not in TaskModelSettings, but could be added if needed
                    }
                } catch {
                    print("Failed to fetch transcription settings: \(error)")
                }
            }
        }
    }

    // MARK: - Helper Methods

    private func enhanceSelectedText() {
        guard selectedRange.length > 0 else { return }

        let selectedText = (taskDescription as NSString).substring(with: selectedRange)
        guard !selectedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        isEnhancingSelection = true

        Task {
            do {
                let enhanced = try await enhancementService.enhance(
                    text: selectedText,
                    context: "task_description",
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                )

                await MainActor.run {
                    let nsString = taskDescription as NSString
                    let beforeSelection = nsString.substring(to: selectedRange.location)
                    let afterSelection = nsString.substring(from: selectedRange.location + selectedRange.length)

                    taskDescription = beforeSelection + enhanced + afterSelection

                    let newCursorPosition = (beforeSelection as NSString).length + (enhanced as NSString).length
                    selectedRange = NSRange(location: newCursorPosition, length: 0)
                    isEnhancingSelection = false
                }
            } catch {
                await MainActor.run {
                    isEnhancingSelection = false
                    print("Enhancement error: \(error)")
                }
            }
        }
    }

    private func toggleRecording() {
        Task {
            do {
                if voiceService.isRecording {
                    // Stop recording
                    voiceService.stopRecording()
                    timer?.invalidate()
                    timer = nil
                    recordingDuration = 0

                    // Wait a bit for file writes to complete
                    try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds

                    // Transcribe the recording
                    // Convert "en-US" to "en" for Whisper API
                    let languageCode = String(selectedLanguage.prefix(2))

                    for try await text in voiceService.transcribe(
                        model: transcriptionModel,
                        language: languageCode,
                        prompt: transcriptionPrompt,
                        temperature: transcriptionTemperature
                    ) {
                        await MainActor.run {
                            let nsString = taskDescription as NSString

                            let validRange: NSRange
                            if selectedRange.location == NSNotFound || selectedRange.location > nsString.length {
                                validRange = NSRange(location: nsString.length, length: 0)
                            } else if selectedRange.location + selectedRange.length > nsString.length {
                                validRange = NSRange(location: selectedRange.location, length: nsString.length - selectedRange.location)
                            } else {
                                validRange = selectedRange
                            }

                            let beforeCursor = nsString.substring(to: validRange.location)
                            let afterCursor = nsString.substring(from: validRange.location + validRange.length)

                            let prefix = beforeCursor.isEmpty ? "" : (beforeCursor.hasSuffix(" ") || beforeCursor.hasSuffix("\n") ? "" : " ")
                            let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)

                            taskDescription = beforeCursor + prefix + trimmedText + afterCursor

                            let newCursorPosition = (beforeCursor as NSString).length + (prefix as NSString).length + (trimmedText as NSString).length
                            selectedRange = NSRange(location: newCursorPosition, length: 0)
                        }
                    }
                } else {
                    try await voiceService.startRecording()

                    // Start timer for duration display
                    await MainActor.run {
                        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                            recordingDuration += 0.1
                        }
                    }
                }
            } catch VoiceDictationError.permissionDenied {
                print("Voice dictation error: Microphone permission denied")
                await MainActor.run {
                    // Could show an alert here
                }
            } catch VoiceDictationError.recordingInProgress {
                print("Voice dictation error: Recording already in progress")
            } catch {
                print("Voice dictation error: \(error.localizedDescription)")
            }
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
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

// MARK: - Language Picker Sheet

private struct LanguagePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedLanguage: String

    let languages = [
        ("en-US", "English"),
        ("es-ES", "Spanish"),
        ("fr-FR", "French"),
        ("de-DE", "German"),
        ("it-IT", "Italian"),
        ("pt-PT", "Portuguese"),
        ("ja-JP", "Japanese"),
        ("zh-CN", "Chinese (Simplified)"),
    ]

    var body: some View {
        NavigationStack {
            List(languages, id: \.0) { code, name in
                Button(action: {
                    selectedLanguage = code
                    dismiss()
                }) {
                    HStack {
                        Text(name)
                        Spacer()
                        if selectedLanguage == code {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
            }
            .navigationTitle("Select Language")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
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
