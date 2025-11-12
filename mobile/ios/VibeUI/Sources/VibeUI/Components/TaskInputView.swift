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
    @Binding var forceApplySelection: Bool

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
        forceApplySelection: Binding<Bool>,
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
        self._forceApplySelection = forceApplySelection
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

        textView.addDismissKeyboardAccessory()

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

        // Handle force-apply selection (for voice transcription)
        if forceApplySelection {
            // Clamp the range to valid bounds
            let textLength = uiView.text.count
            let clampedLocation = min(max(0, selectedRange.location), textLength)
            let maxLength = textLength - clampedLocation
            let clampedLength = min(max(0, selectedRange.length), maxLength)
            let clampedRange = NSRange(location: clampedLocation, length: clampedLength)

            uiView.selectedRange = clampedRange

            // Scroll to show the cursor
            DispatchQueue.main.async {
                if let selectedTextRange = uiView.selectedTextRange {
                    let rect = uiView.caretRect(for: selectedTextRange.start)
                    uiView.scrollRectToVisible(rect, animated: false)
                }
            }

            // Reset the flag
            DispatchQueue.main.async {
                self.forceApplySelection = false
            }
        } else {
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

                    // Only scroll for programmatic changes (like undo/redo) when keyboard is NOT visible
                    // Scrolling during keyboard animations causes jumpiness
                    if coordinator.keyboardHeight == 0 {
                        DispatchQueue.main.async {
                            if let selectedTextRange = uiView.selectedTextRange {
                                let rect = uiView.caretRect(for: selectedTextRange.start)
                                uiView.scrollRectToVisible(rect, animated: false)
                            }
                        }
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

        // Ensure keyboard dismiss accessory remains attached
        if uiView.inputAccessoryView == nil {
            uiView.addDismissKeyboardAccessory()
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

            // Calculate bottom inset accounting for tab bar
            let window = UIApplication.shared.windows.first { $0.isKeyWindow }
            let bottomSafeArea = window?.safeAreaInsets.bottom ?? 0

            // Get actual tab bar height from view hierarchy instead of hardcoding
            var tabBarHeight: CGFloat = 0
            if let tabBarController = window?.rootViewController as? UITabBarController {
                tabBarHeight = tabBarController.tabBar.frame.height
            } else if let tabBarController = textView.window?.rootViewController as? UITabBarController {
                tabBarHeight = tabBarController.tabBar.frame.height
            } else {
                // Fallback for SwiftUI TabView: use safe area + typical tab bar height
                tabBarHeight = bottomSafeArea + 49
            }

            let adjustedHeight = keyboardFrame.height - bottomSafeArea - tabBarHeight

            UIView.animate(withDuration: duration) {
                textView.contentInset.bottom = adjustedHeight
                textView.scrollIndicatorInsets.bottom = adjustedHeight
                // Remove manual scroll - UITextView automatically keeps cursor visible
                // when contentInset changes. Manual scrolling here causes jumpiness.
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

    @EnvironmentObject private var container: AppContainer

    @StateObject private var voiceService = VoiceDictationService.shared
    @StateObject private var enhancementService = TextEnhancementService.shared
    @StateObject private var settingsService = SettingsDataService()
    @StateObject private var undoRedoManager = UndoRedoManager()

    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var showingLanguagePicker = false
    @State private var selectedLanguage = "en-US"
    @State private var selectionRect: CGRect = .zero
    @State private var transcriptionModel: String?
    @State private var transcriptionPrompt: String?
    @State private var transcriptionTemperature: Double?
    @State private var showTerminal = false
    @State private var terminalJobId: String? = nil
    @State private var showDeepResearch = false
    @State private var initializedForSessionId: String?
    @State private var debounceTask: Task<Void, Never>?
    @State private var isEditing: Bool = false
    @State private var pendingHistoryState: HistoryState?
    @State private var forceSelectionApply: Bool = false

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
                forceApplySelection: $forceSelectionApply,
                placeholder: placeholder,
                onInteraction: {
                    isEditing = true
                    onInteraction()
                    debouncedSync()
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
                // 1. Voice Recording Button (using reusable component)
                VoiceRecordingButton(
                    text: $taskDescription,
                    selectedRange: $selectedRange,
                    selectedLanguage: $selectedLanguage,
                    voiceService: voiceService,
                    transcriptionModel: transcriptionModel,
                    transcriptionPrompt: transcriptionPrompt,
                    transcriptionTemperature: transcriptionTemperature,
                    onError: { error in
                    },
                    onTranscriptionComplete: {
                        // Force-apply the selection set by voice transcription
                        forceSelectionApply = true
                        undoRedoManager.saveState(taskDescription)
                        debouncedSync()
                        onInteraction()
                    }
                )

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

                    // 3. Sparkles - Enhance selected text or all
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
                    .disabled(taskDescription.isEmpty || enhancementService.isEnhancing)
                    .accessibilityLabel("Enhance text")
                    .accessibilityHint("Enhance selected text or full task description")

                    // 3b. Wand - Refine selected text or all
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
                    .disabled(taskDescription.isEmpty || enhancementService.isEnhancing)
                    .accessibilityLabel("Refine text")
                    .accessibilityHint("Refine selected text or full task description")

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
                        transcriptionPrompt = settings.prompt
                        // Set language code from settings if available
                        // Backend stores short codes (e.g., "en"), but UI uses full locale codes (e.g., "en-US")
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
                } catch {
                }
            }
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

            if isEditing {
                pendingHistoryState = remoteState
                return
            }
            applyHistoryState(remoteState)
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
        await MainActor.run {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }

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
    }

    private func enhanceSelectedOrAll() {
        let ns = taskDescription as NSString
        let length = ns.length
        let range = NSIntersectionRange(selectedRange, NSRange(location: 0, length: length))
        let targetText = range.length > 0 ? ns.substring(with: range) : taskDescription

        guard !targetText.isEmpty else { return }

        Task {
            do {
                guard let session = container.sessionService.currentSession else { return }

                let improved = try await enhancementService.enhance(
                    text: targetText,
                    sessionId: session.id,
                    projectDirectory: session.projectDirectory
                )

                await MainActor.run {
                    applyReplacement(
                        range: range.length > 0 ? range : NSRange(location: 0, length: length),
                        with: improved
                    )
                }
            } catch {
            }
        }
    }

    private func refineSelectedOrAll() {
        let ns = taskDescription as NSString
        let length = ns.length
        let range = NSIntersectionRange(selectedRange, NSRange(location: 0, length: length))
        let targetText = range.length > 0 ? ns.substring(with: range) : taskDescription

        guard !targetText.isEmpty else { return }

        Task {
            do {
                guard let session = container.sessionService.currentSession else { return }

                let refined = try await enhancementService.refine(
                    text: targetText,
                    sessionId: session.id,
                    projectDirectory: session.projectDirectory
                )

                await MainActor.run {
                    applyReplacement(
                        range: range.length > 0 ? range : NSRange(location: 0, length: length),
                        with: refined
                    )
                }
            } catch {
            }
        }
    }

    private func applyReplacement(range: NSRange, with newText: String) {
        let ns = taskDescription as NSString
        let before = ns.substring(to: range.location)
        let after = ns.substring(from: range.location + range.length)
        let newAll = before + newText + after
        taskDescription = newAll
        let cursorPos = before.count + newText.count
        selectedRange = NSRange(location: cursorPos, length: 0)
        undoRedoManager.saveState(newAll)
        onInteraction()
    }

    private func debouncedSync() {
        undoRedoManager.saveState(taskDescription)
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }

            do {
                try await container.sessionService.updateTaskDescription(
                    sessionId: sessionId,
                    content: taskDescription
                )
                await MainActor.run {
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

    private func performUndo() {
        guard let previousText = undoRedoManager.undo() else { return }
        taskDescription = previousText
        debouncedSync()
    }

    private func performRedo() {
        guard let nextText = undoRedoManager.redo() else { return }
        taskDescription = nextText
        debouncedSync()
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
    @State var task = ""
    return TaskInputView(
        taskDescription: $task,
        sessionId: "preview-session",
        projectDirectory: "/path/to/project"
    )
    .padding()
}
