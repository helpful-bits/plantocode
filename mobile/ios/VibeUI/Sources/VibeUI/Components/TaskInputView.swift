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
    let textColor: UIColor?
    let backgroundColor: UIColor?
    let font: UIFont?

    init(
        text: Binding<String>,
        selectedRange: Binding<NSRange>,
        placeholder: String,
        onInteraction: @escaping () -> Void,
        singleLine: Bool = false,
        onSubmit: (() -> Void)? = nil,
        onUpArrow: (() -> Void)? = nil,
        onDownArrow: (() -> Void)? = nil,
        textColor: UIColor? = nil,
        backgroundColor: UIColor? = nil,
        font: UIFont? = nil
    ) {
        self._text = text
        self._selectedRange = selectedRange
        self.placeholder = placeholder
        self.onInteraction = onInteraction
        self.singleLine = singleLine
        self.onSubmit = onSubmit
        self.onUpArrow = onUpArrow
        self.onDownArrow = onDownArrow
        self.textColor = textColor
        self.backgroundColor = backgroundColor
        self.font = font
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = KeyCommandTextView()
        textView.font = font ?? UIFont.preferredFont(forTextStyle: .body)
        textView.textColor = textColor ?? UIColor.label
        textView.backgroundColor = backgroundColor ?? UIColor.secondarySystemBackground

        // Only apply border styling if custom background is not provided
        if backgroundColor == nil {
            textView.layer.cornerRadius = 12
            textView.layer.borderWidth = 1
            textView.layer.borderColor = UIColor.separator.cgColor
        }

        textView.delegate = context.coordinator
        textView.autocapitalizationType = .sentences
        textView.autocorrectionType = .yes
        textView.spellCheckingType = .yes
        textView.keyboardType = .default
        textView.textAlignment = .left

        if singleLine {
            // Single-line mode: minimal insets and no scrolling
            textView.isScrollEnabled = false
            textView.textContainerInset = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
            textView.returnKeyType = .send
            textView.textContainer.maximumNumberOfLines = 1
            textView.textContainer.lineBreakMode = .byTruncatingTail
            textView.textContainer.lineFragmentPadding = 0
        } else {
            // Multi-line mode: normal insets and scrolling enabled
            textView.isScrollEnabled = true
            textView.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
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
            // Only update text if not actively editing to prevent cursor jumps
            if uiView.text != text && !context.coordinator.isUserEditing && !context.coordinator.isUserTyping {
                uiView.text = text
            }
        }

        // Update selection if it changed programmatically (not during user editing or typing)
        // This prevents cursor jumps when remote updates arrive during active typing
        let coordinator = context.coordinator
        let shouldPreserveSelection = coordinator.isUserEditing || coordinator.isUserTyping || coordinator.isFocused
        if !shouldPreserveSelection && (uiView.selectedRange.location != selectedRange.location || uiView.selectedRange.length != selectedRange.length) {
            // Validate range before setting
            let textLength = (uiView.text as NSString).length
            if selectedRange.location != NSNotFound && selectedRange.location <= textLength {
                let validLength = min(selectedRange.length, textLength - selectedRange.location)
                uiView.selectedRange = NSRange(location: selectedRange.location, length: validLength)

                // Only scroll for programmatic changes (like undo/redo)
                DispatchQueue.main.async {
                    if let selectedTextRange = uiView.selectedTextRange {
                        let rect = uiView.caretRect(for: selectedTextRange.start)
                        uiView.scrollRectToVisible(rect, animated: false)
                    }
                }
            }
        }

        // Update placeholder visibility
        if text.isEmpty {
            if uiView.subviews.first(where: { $0.tag == 999 }) == nil {
                let placeholderLabel = UILabel()
                placeholderLabel.text = placeholder
                placeholderLabel.font = font ?? UIFont.preferredFont(forTextStyle: .body)
                placeholderLabel.textColor = textColor?.withAlphaComponent(0.5) ?? UIColor.tertiaryLabel
                placeholderLabel.tag = 999
                placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
                uiView.addSubview(placeholderLabel)

                // Use appropriate positioning based on single-line vs multi-line
                let topConstant: CGFloat = singleLine ? 8 : 16
                let leadingConstant: CGFloat = singleLine ? 12 : 16

                NSLayoutConstraint.activate([
                    placeholderLabel.topAnchor.constraint(equalTo: uiView.topAnchor, constant: topConstant),
                    placeholderLabel.leadingAnchor.constraint(equalTo: uiView.leadingAnchor, constant: leadingConstant)
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
        var isUserEditing: Bool = false
        var isFocused: Bool = false
        var isUserTyping: Bool = false
        var typingIdleTimer: Timer?

        init(_ parent: SelectableTextView) {
            self.parent = parent
            super.init()
            setupKeyboardObservers()
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
            typingIdleTimer?.invalidate()
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
            isUserEditing = true
            isUserTyping = true

            // Reset typing flag after 200ms idle (matching desktop behavior)
            typingIdleTimer?.invalidate()
            typingIdleTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: false) { [weak self] _ in
                self?.isUserTyping = false
            }

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.parent.text = textView.text
                self.parent.onInteraction()

                // Reset editing flag after update
                DispatchQueue.main.async {
                    self.isUserEditing = false
                }
            }
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            self.textView = textView
            isUserEditing = true

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.parent.selectedRange = textView.selectedRange

                // Reset flag after update
                DispatchQueue.main.async {
                    self.isUserEditing = false
                }
            }
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            isFocused = true
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            isFocused = false
            isUserTyping = false
            typingIdleTimer?.invalidate()
            typingIdleTimer = nil
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
    @StateObject private var sessionDataService = SessionDataService()
    @StateObject private var undoRedoManager = UndoRedoManager()

    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var showingLanguagePicker = false
    @State private var selectedLanguage = "en-US"
    @State private var recordingDuration: TimeInterval = 0
    @State private var timer: Timer?
    @State private var selectionRect: CGRect = .zero
    @State private var isEnhancingSelection = false
    @State private var isEnhancingFullText = false
    @State private var transcriptionModel: String?
    @State private var transcriptionPrompt: String?
    @State private var transcriptionTemperature: Double?
    @State private var showTerminal = false
    @State private var terminalJobId: String? = nil
    @State private var showDeepResearch = false
    @State private var lastSavedText: String = ""
    @State private var saveHistoryTimer: Timer?
    @State private var historySyncTimer: Timer?
    @State private var initializedForSessionId: String?

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
            // Text Editor (no floating sparkles for selection anymore)
            SelectableTextView(
                text: $taskDescription,
                selectedRange: $selectedRange,
                placeholder: placeholder,
                onInteraction: {
                    onInteraction()
                    // Save to undo history with debouncing
                    saveToUndoHistory()
                }
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

            // Action Buttons Row - New Order: Voice, Language, Sparkles, Undo, Redo, Menu
            HStack(spacing: 12) {
                // 1. Voice Recording Button
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
                        }
                    }
                    .frame(maxWidth: voiceService.isRecording ? .infinity : nil)
                }
                .buttonStyle(RecordingButtonStyle(isRecording: voiceService.isRecording))

                if !voiceService.isRecording {
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

                    // 3. Sparkles - Enhance ENTIRE task description
                    Button(action: enhanceFullText) {
                        HStack(spacing: 4) {
                            if isEnhancingFullText {
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
                    .disabled(isEnhancingFullText || taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("Enhance task description")
                    .accessibilityHint("Improve the quality and clarity of the entire task description")

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

                    // 6. More Menu (Terminal + Deep Research)
                    Menu {
                        Button(action: {
                            terminalJobId = "task-terminal-\(sessionId)"
                            showTerminal = true
                        }) {
                            Label("Terminal", systemImage: "terminal")
                        }

                        Button(action: { showDeepResearch = true }) {
                            Label("Deep Research", systemImage: "sparkle.magnifyingglass")
                        }
                        .disabled(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 18))
                    }
                    .buttonStyle(UtilityButtonStyle())
                }

                Spacer()
            }
        }
        .sheet(isPresented: $showingLanguagePicker) {
            LanguagePickerSheet(selectedLanguage: $selectedLanguage)
        }
        .sheet(isPresented: $showTerminal, onDismiss: { terminalJobId = nil }) {
            if let jobId = terminalJobId {
                NavigationStack {
                    RemoteTerminalView(jobId: jobId)
                }
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
        .onAppear {
            // Initialize undo/redo history from backend
            initializeHistoryFromBackend()
        }
        .onChange(of: sessionId) { _ in
            // Stop current sync timer
            stopHistorySyncTimer()

            // Clear initialization flag to allow reloading for new session
            initializedForSessionId = nil

            // Load history for new session from backend
            initializeHistoryFromBackend()
        }
        .onDisappear {
            // Clean up timers when view disappears
            stopHistorySyncTimer()
            saveHistoryTimer?.invalidate()
        }
    }

    // MARK: - Helper Methods

    // Initialize undo/redo history from backend
    private func initializeHistoryFromBackend() {
        // Only initialize once per session
        guard initializedForSessionId != sessionId else { return }

        Task {
            do {
                let history = try await sessionDataService.getTaskDescriptionHistory(sessionId: sessionId)

                await MainActor.run {
                    if !history.isEmpty {
                        // If we have history, initialize with it
                        let currentIndex = history.count - 1
                        undoRedoManager.initializeHistory(entries: history, currentIndex: currentIndex)
                    } else if !taskDescription.isEmpty {
                        // If no history but we have a task description, start with it
                        undoRedoManager.reset(with: taskDescription)
                    }

                    initializedForSessionId = sessionId
                    lastSavedText = taskDescription

                    // Start periodic sync after initialization
                    startHistorySyncTimer()
                }
            } catch {
                // If fetch fails, initialize with current task description
                await MainActor.run {
                    undoRedoManager.reset(with: taskDescription)
                    initializedForSessionId = sessionId
                    lastSavedText = taskDescription
                    print("Failed to load task description history: \(error)")

                    // Still start sync timer even if initial load failed
                    startHistorySyncTimer()
                }
            }
        }
    }

    // Sync history to backend (similar to desktop's 2-second sync)
    private func syncHistoryToBackend() {
        let currentHistory = undoRedoManager.getHistory()

        // Only sync if we have a session and history
        guard !sessionId.isEmpty, !currentHistory.isEmpty else { return }

        Task {
            do {
                try await sessionDataService.syncTaskDescriptionHistory(sessionId: sessionId, history: currentHistory)
            } catch {
                // Silent fail for sync - will retry on next timer tick
                print("Failed to sync task description history: \(error)")
            }
        }
    }

    // Start periodic history sync timer (similar to desktop)
    private func startHistorySyncTimer() {
        // Invalidate existing timer if any
        historySyncTimer?.invalidate()

        // Create new timer that syncs every 2 seconds
        historySyncTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak sessionDataService, weak undoRedoManager] _ in
            guard let undoRedoManager = undoRedoManager else { return }

            let currentHistory = undoRedoManager.getHistory()
            guard !currentHistory.isEmpty else { return }

            Task {
                do {
                    try await sessionDataService?.syncTaskDescriptionHistory(sessionId: sessionId, history: currentHistory)
                } catch {
                    print("Failed to sync task description history: \(error)")
                }
            }
        }
    }

    // Stop history sync timer
    private func stopHistorySyncTimer() {
        historySyncTimer?.invalidate()
        historySyncTimer = nil
    }

    // Enhance the entire task description (not just selection)
    private func enhanceFullText() {
        let textToEnhance = taskDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !textToEnhance.isEmpty else { return }

        isEnhancingFullText = true

        Task {
            do {
                // Save current state to history before enhancement
                await MainActor.run {
                    undoRedoManager.saveState(taskDescription)
                }

                let enhanced = try await enhancementService.enhance(
                    text: textToEnhance,
                    context: "task_description",
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                )

                await MainActor.run {
                    taskDescription = enhanced
                    undoRedoManager.saveState(enhanced)
                    isEnhancingFullText = false
                    onInteraction()
                }
            } catch {
                await MainActor.run {
                    isEnhancingFullText = false
                    print("Enhancement error: \(error)")
                }
            }
        }
    }

    // Undo/Redo handlers
    private func performUndo() {
        guard let previousText = undoRedoManager.undo() else { return }
        taskDescription = previousText
        onInteraction()
    }

    private func performRedo() {
        guard let nextText = undoRedoManager.redo() else { return }
        taskDescription = nextText
        onInteraction()
    }

    // Debounced history saving
    private func saveToUndoHistory() {
        saveHistoryTimer?.invalidate()
        let newTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { [undoRedoManager, taskDescription] _ in
            Task { @MainActor in
                undoRedoManager.saveState(taskDescription)
            }
        }
        Task { @MainActor in
            self.saveHistoryTimer = newTimer
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

#Preview {
    @State var task = ""
    return TaskInputView(
        taskDescription: $task,
        sessionId: "preview-session",
        projectDirectory: "/path/to/project"
    )
    .padding()
}
