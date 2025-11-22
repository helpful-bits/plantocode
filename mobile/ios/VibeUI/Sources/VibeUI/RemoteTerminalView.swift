import SwiftUI
import Core
import Combine
import SwiftTerm
import OSLog

public struct RemoteTerminalView: View {
    let jobId: String
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    @State private var terminalSession: TerminalSession?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSessionActive = false
    @State private var showCompose = false
    @State private var composeAutoStartRecording = false
    @StateObject private var settingsService = SettingsDataService()
    @StateObject private var terminalController = SwiftTermController()
    @StateObject private var pathObserver = NetworkPathObserver.shared

    @State private var shouldShowKeyboard = false
    @State private var isKeyboardVisible: Bool = false
    @State private var outputCancellable: AnyCancellable?
    @State private var hasInitialResize = false
    @State private var isTerminalReady = false
    @State private var sessionIdForReadiness: String?
    @State private var readinessCancellable: AnyCancellable?

    @State private var copyButtons: [CopyButton] = []
    @State private var planContentForJob: String = ""
    @State private var taskDescriptionContent: String = ""
    @State private var isActionsExpanded: Bool = false

    private let contextType: TerminalContextType

    public init(
        jobId: String,
        contextType: TerminalContextType = .implementationPlan
    ) {
        self.jobId = jobId
        self.contextType = contextType
    }

    private func loadCopyButtons() async {
        if let dir = container.sessionService.currentSession?.projectDirectory, !dir.isEmpty {
            try? await container.settingsService.fetchProjectTaskModelSettings(projectDirectory: dir)
            copyButtons = container.settingsService.projectTaskSettings["implementationPlan"]?.copyButtons ?? CopyButton.defaults
        } else {
            copyButtons = CopyButton.defaults
        }
    }

    private func loadPlanContent(jobId: String) async {
        if let job = try? await container.jobsService.getJobFast(jobId: jobId).async() {
            await MainActor.run { self.planContentForJob = job.response ?? "" }
        }
    }

    private func ensurePlanContent(jobId: String) async {
        if planContentForJob.isEmpty {
            await loadPlanContent(jobId: jobId)
        }
    }

    private func loadTaskDescription() async {
        if let taskDesc = container.sessionService.currentSession?.taskDescription, !taskDesc.isEmpty {
            await MainActor.run {
                taskDescriptionContent = taskDesc
            }
        }
    }

    private func paste(using button: CopyButton, jobId: String) async {
        let processed = button.processContent(
            planContent: planContentForJob,
            stepNumber: nil,
            taskDescription: container.sessionService.currentSession?.taskDescription
        )
        try? await container.terminalService.sendLargeText(
            jobId: jobId,
            text: processed,
            appendCarriageReturn: true
        )
    }

    private func pasteTaskDescription() async {
        guard !taskDescriptionContent.isEmpty else { return }
        try? await container.terminalService.sendLargeText(
            jobId: jobId,
            text: taskDescriptionContent,
            appendCarriageReturn: true
        )
    }

    private func reattachToExistingSessionIfNeeded() {
        guard let terminalSession = terminalSession, isSessionActive else { return }

        outputCancellable?.cancel()
        outputCancellable = nil

        let capturedJobId = jobId
        let terminalService = container.terminalService

        outputCancellable = terminalService
            .getHydratedRawOutputStream(for: capturedJobId)
            .receive(on: DispatchQueue.main)
            .sink { data in
                terminalController.feedBytes(data: data)
                DispatchQueue.main.async {
                }
            }

        Task {
            do {
                try await terminalService.attachLiveBinary(for: capturedJobId, includeSnapshot: true)
            } catch {
            }
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Error/Loading overlay
            if let error = errorMessage {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(Color.destructive)
                    Text("Terminal Error")
                        .font(.headline)
                        .foregroundColor(Color.textPrimary)
                    Text(error)
                        .font(.body)
                        .foregroundColor(Color.muted)
                        .multilineTextAlignment(.center)
                        .padding(EdgeInsets(top: 0, leading: 32, bottom: 0, trailing: 32))
                    Button("Retry") {
                        errorMessage = nil
                        Task {
                            await MainActor.run {
                                startTerminalSession()
                            }
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.background)
            } else if isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color.success))
                        .scaleEffect(1.5)
                    Text("Starting terminal...")
                        .font(.body)
                        .foregroundColor(Color.muted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.background)
            } else {
                // Compose + Copy buttons toolbar - only visible when Actions is expanded
                if isActionsExpanded {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button("Compose") {
                                openCompose()
                            }
                            .buttonStyle(PrimaryButtonStyle())

                            // Show "Task" button for task description context
                            if contextType == .taskDescription && !taskDescriptionContent.isEmpty {
                                Button("Task") {
                                    Task { await pasteTaskDescription() }
                                }
                                .buttonStyle(SecondaryButtonStyle())
                            }

                            // Show copy buttons for implementation plan context
                            if contextType == .implementationPlan && !copyButtons.isEmpty && !planContentForJob.isEmpty {
                                ForEach(copyButtons, id: \.id) { btn in
                                    Button(btn.label) {
                                        Task { await paste(using: btn, jobId: jobId) }
                                    }
                                    .buttonStyle(SecondaryButtonStyle())
                                    .disabled(planContentForJob.isEmpty)
                                }
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .background(Color.backgroundSecondary)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                // SwiftTerm terminal view - handles input, output, and keyboard accessories
                SwiftTerminalView(controller: terminalController, shouldShowKeyboard: $shouldShowKeyboard)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
            }
        }
        .background(Color.background)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showCompose, onDismiss: {
            composeAutoStartRecording = false
        }) {
            TerminalComposeView(jobId: jobId, autoStartRecording: composeAutoStartRecording)
                .environmentObject(container)
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 12) {
                    // Microphone button - quick access to voice compose
                    Button(action: {
                        openComposeWithVoice()
                    }) {
                        Image(systemName: "mic.circle.fill")
                            .font(.system(size: 20))
                    }
                    .buttonStyle(ToolbarButtonStyle())
                    .accessibilityLabel("Voice Compose")
                    .accessibilityHint("Opens compose view and starts voice recording")

                    if shouldShowKeyboard {
                        Button(action: {
                            shouldShowKeyboard = false
                        }) {
                            Image(systemName: "keyboard.chevron.compact.down")
                                .font(.system(size: 16))
                        }
                        .buttonStyle(ToolbarButtonStyle())
                        .accessibilityLabel("Hide Terminal Keyboard")
                        .accessibilityHint("Dismisses the on-screen keyboard")
                    } else {
                        Button(action: {
                            shouldShowKeyboard = true
                        }) {
                            Image(systemName: "keyboard")
                                .font(.system(size: 16))
                        }
                        .buttonStyle(ToolbarButtonStyle())
                        .accessibilityLabel("Show Terminal Keyboard")
                        .accessibilityHint("Shows the on-screen keyboard")
                    }

                    Button(action: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            isActionsExpanded.toggle()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Text("Actions")
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .medium))
                                .rotationEffect(.degrees(isActionsExpanded ? 180 : 0))
                        }
                    }
                    .buttonStyle(ToolbarButtonStyle())
                    .accessibilityLabel(isActionsExpanded ? "Hide Actions" : "Show Actions")
                    .accessibilityHint("Toggle terminal actions toolbar")

                    if isSessionActive {
                        Button("Stop") {
                            killSession()
                        }
                        .buttonStyle(CompactDestructiveButtonStyle())
                        .accessibilityLabel("Stop Process")
                        .accessibilityHint("Terminates the current process")
                    }

                    Button {
                        cleanupSession()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(ToolbarButtonStyle())
                    .accessibilityLabel("Close")
                    .accessibilityHint("Closes the terminal view")
                }
            }
        }
        .onAppear {
            readinessCancellable = container.terminalService.$readinessBySession
                .receive(on: DispatchQueue.main)
                .sink { readinessMap in
                    if let sid = self.sessionIdForReadiness {
                        self.isTerminalReady = readinessMap[sid] ?? false
                    }
                }

            Task {
                let connectionManager = MultiConnectionManager.shared
                if !connectionManager.isActiveDeviceConnected {
                    await MainActor.run {
                        connectionManager.triggerAggressiveReconnect(reason: .appForeground)
                    }
                }
                await MainActor.run {
                    startTerminalSession()
                }
            }
        }
        .onDisappear {
            cleanupSession()
        }
        .onChange(of: terminalSession?.id) { newSessionId in
            sessionIdForReadiness = newSessionId
            if let sid = newSessionId {
                isTerminalReady = container.terminalService.isSessionReady(sid)
            } else {
                isTerminalReady = false
            }
        }
        .onChange(of: isTerminalReady) { ready in
            if ready {
                shouldShowKeyboard = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            isKeyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            isKeyboardVisible = false
        }
        .onReceive(pathObserver.$currentPath.compactMap { $0 }) { path in
            if path.status == .satisfied {
                reattachToExistingSessionIfNeeded()
            }
        }
    }

    @ViewBuilder
    private func terminalHeader() -> some View {
        HStack {
            if isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color.success))
                        .scaleEffect(0.8)
                    Text("Starting session...")
                        .small()
                        .foregroundColor(Color.success)
                }
            } else if isSessionActive {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.success)
                        .frame(width: 8, height: 8)
                    Text("Session Active")
                        .small()
                        .foregroundColor(Color.success)
                }
            } else {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.destructive)
                        .frame(width: 8, height: 8)
                    Text("Session Inactive")
                        .small()
                        .foregroundColor(Color.destructive)
                }
            }

            Spacer()

            if let session = terminalSession {
                Text("Job: \(session.jobId)")
                    .small()
                    .foregroundColor(Color.muted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.background.opacity(0.8))
    }

    private func startTerminalSession() {
        // Validate jobId is not empty
        guard !jobId.isEmpty else {
            errorMessage = "Invalid terminal job ID"
            isLoading = false
            return
        }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                // Get working directory from current session
                let workingDirectory = container.sessionService.currentSession?.projectDirectory

                // Fetch preferred shell from settings
                let settingsService = SettingsDataService()
                var preferredShell: String?
                do {
                    try await settingsService.loadPreferredTerminal()
                    preferredShell = settingsService.preferredTerminal
                } catch {
                    // Failed to fetch shell preference
                }

                // Capture service and jobId before entering MainActor scope
                let terminalService = container.terminalService
                let capturedJobId = jobId

                // Build explicit context binding
                let appSid = container.sessionService.currentSession?.id ?? ""
                let contextBinding = TerminalContextBinding(
                    appSessionId: appSid,
                    contextType: self.contextType,
                    jobId: capturedJobId
                )

                let session = try await terminalService.startSession(
                    jobId: capturedJobId,
                    shell: preferredShell,
                    context: contextBinding
                )
                await MainActor.run {
                    terminalSession = session
                    sessionIdForReadiness = session.id
                    isTerminalReady = container.terminalService.isSessionReady(session.id)
                    isSessionActive = true
                    isLoading = false

                    terminalController.onSend = { bytes in
                        Task {
                            do {
                                try await terminalService.write(jobId: capturedJobId, bytes: bytes)
                            } catch {
                                // Failed to send bytes
                            }
                        }
                    }

                    // Propagate terminal size changes to remote PTY
                    terminalController.onResize = { cols, rows in
                        Task {
                            do {
                                try await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)

                                if !hasInitialResize {
                                    hasInitialResize = true
                                }
                            } catch {
                                // Failed to resize
                            }
                        }
                    }

                    // Start output stream immediately to receive live data
                    outputCancellable = terminalService
                        .getHydratedRawOutputStream(for: capturedJobId)
                        .receive(on: DispatchQueue.main)
                        .sink { data in
                            terminalController.feedBytes(data: data)
                            DispatchQueue.main.async {
                                // UI flush barrier after feedBytes
                            }
                        }

                    // CRITICAL: Manually trigger first resize immediately!
                    // sizeChanged may have already fired before onResize was set up
                    // This ensures we always send the correct terminal size to desktop
                    if let termView = terminalController.terminalView {
                        let terminal = termView.getTerminal()
                        let cols = terminal.cols
                        let rows = terminal.rows

                        // ONLY resize if we have valid dimensions (not 0x0)
                        if cols > 0 && rows > 0 {
                            Task {
                                do {
                                    try await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                                    hasInitialResize = true
                                } catch {
                                    // Failed manual resize
                                }
                            }
                        }
                    }
                }

                // Load content based on context type
                if self.contextType == .implementationPlan {
                    Task {
                        await loadCopyButtons()
                        await ensurePlanContent(jobId: jobId)
                    }
                } else if self.contextType == .taskDescription {
                    Task {
                        await loadTaskDescription()
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isSessionActive = false
                    isLoading = false
                }
            }
        }
    }

    private func openCompose() {
        // Resign first responder to avoid UIReparenting warnings
        terminalController.terminalView?.resignFirstResponder()

        // Clear the current terminal input line by sending Ctrl+U (clear line before cursor)
        // This ensures no duplicate text between terminal and compose view
        Task {
            do {
                try await container.terminalService.write(jobId: jobId, bytes: [0x15]) // Ctrl+U
                // Small delay to ensure the terminal processes the clear before showing compose
                try await Task.sleep(nanoseconds: 50_000_000) // 50ms
                await MainActor.run {
                    composeAutoStartRecording = false
                    showCompose = true
                }
            } catch {
                // If clearing fails, still show compose
                await MainActor.run {
                    composeAutoStartRecording = false
                    showCompose = true
                }
            }
        }
    }

    private func openComposeWithVoice() {
        // Resign first responder to avoid UIReparenting warnings
        terminalController.terminalView?.resignFirstResponder()

        // Clear the current terminal input line by sending Ctrl+U (clear line before cursor)
        // This ensures no duplicate text between terminal and compose view
        Task {
            do {
                try await container.terminalService.write(jobId: jobId, bytes: [0x15]) // Ctrl+U
                // Small delay to ensure the terminal processes the clear before showing compose
                try await Task.sleep(nanoseconds: 50_000_000) // 50ms
                await MainActor.run {
                    composeAutoStartRecording = true
                    showCompose = true
                }
            } catch {
                // If clearing fails, still show compose
                await MainActor.run {
                    composeAutoStartRecording = true
                    showCompose = true
                }
            }
        }
    }

    private func sendCtrlC() {
        Task {
            do {
                try await container.terminalService.write(jobId: jobId, bytes: [0x03])
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func killSession() {
        Task {
            do {
                try await container.terminalService.kill(jobId: jobId)
                await MainActor.run {
                    isSessionActive = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func cleanupSession() {
        outputCancellable?.cancel()
        outputCancellable = nil
        readinessCancellable?.cancel()
        readinessCancellable = nil
    }
}

// MARK: - SwiftTerm Controller

class SwiftTermController: ObservableObject {
    weak var terminalView: TerminalView? {
        didSet {
            // When terminal view becomes available, flush any buffered data
            if terminalView != nil && !pendingData.isEmpty {
                for buffered in pendingData {
                    let buffer = ArraySlice([UInt8](buffered))
                    terminalView?.feed(byteArray: buffer)
                }
                terminalView?.setNeedsDisplay()
                terminalView?.layoutIfNeeded()
                pendingData.removeAll()
                objectWillChange.send()
            }
        }
    }
    var onSend: (([UInt8]) -> Void)?
    var onResize: ((Int, Int) -> Void)?
    var isFirstResize = true
    private var pendingData: [Data] = []

    func feed(data: String) {
        guard let terminalView = terminalView else {
            return
        }

        let buffer = ArraySlice([UInt8](data.utf8))
        terminalView.feed(byteArray: buffer)

        // Force IMMEDIATE display update (we're already on main thread)
        terminalView.setNeedsDisplay()
        terminalView.layoutIfNeeded()

        // Notify SwiftUI that the view needs updating
        objectWillChange.send()
    }

    func feedBytes(data: Data) {
        guard !data.isEmpty else { return }

        // If terminal view not ready, buffer the data
        guard let terminalView = terminalView else {
            pendingData.append(data)

            // Prevent unbounded buffering
            if pendingData.count > 100 {
                pendingData.removeFirst(50)
            }
            return
        }

        // Feed any buffered data first
        if !pendingData.isEmpty {
            for buffered in pendingData {
                let buffer = ArraySlice([UInt8](buffered))
                terminalView.feed(byteArray: buffer)
            }
            pendingData.removeAll()
        }

        // Feed current data
        let buffer = ArraySlice([UInt8](data))
        terminalView.feed(byteArray: buffer)

        // Force IMMEDIATE display update (we're already on main thread from sink)
        // Note: SwiftTerm's feed() method automatically handles cursor visibility
        // and scrolling through its internal ensureCaretIsVisible() call
        terminalView.setNeedsDisplay()
        terminalView.layoutIfNeeded()

        // CRITICAL: Notify SwiftUI that the view needs updating
        // This triggers updateUIView() which refreshes the SwiftUI wrapper
        objectWillChange.send()
    }

    func send(data: [UInt8]) {
        onSend?(data)
    }
}

private var resizeDebouncerKey: UInt8 = 0

extension SwiftTermController: TerminalViewDelegate {
    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        send(data: Array(data))
    }

    private var resizeDebouncer: DispatchWorkItem? {
        get { objc_getAssociatedObject(self, &resizeDebouncerKey) as? DispatchWorkItem }
        set { objc_setAssociatedObject(self, &resizeDebouncerKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        // Skip invalid sizes (0x0 or unreasonably small)
        guard newCols > 10 && newRows > 5 else {
            return
        }

        // First resize must be immediate to set correct PTY size before output rendering
        // Subsequent resizes are debounced to handle keyboard show/hide and rotation smoothly
        if isFirstResize {
            isFirstResize = false
            onResize?(newCols, newRows)
        } else {
            // More aggressive debounce (400ms) to handle rapid keyboard show/hide cycles
            resizeDebouncer?.cancel()
            resizeDebouncer = DispatchWorkItem { [weak self] in
                self?.onResize?(newCols, newRows)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: resizeDebouncer!)
        }
    }

    func setTerminalTitle(source: TerminalView, title: String) {
        // Terminal title changed
    }

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
        // Current directory changed
    }

    func bell(source: TerminalView) {
        // Terminal bell - could trigger haptic feedback
    }

    func clipboardCopy(source: TerminalView, content: Data) {
        // Handle clipboard copy
        if let string = String(data: content, encoding: .utf8) {
            UIPasteboard.general.string = string
        }
    }

    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {
        // Range of text changed
    }

    func requestOpenLink(source: TerminalView, link: String, params: [String : String]) {
        // Handle hyperlink click - could open in Safari
        if let url = URL(string: link) {
            UIApplication.shared.open(url)
        }
    }

    func scrolled(source: TerminalView, position: Double) {
        // Handle scroll position changes
    }
}

// MARK: - SwiftTerm UIViewRepresentable

struct SwiftTerminalView: UIViewRepresentable {
    @ObservedObject var controller: SwiftTermController
    @Binding var shouldShowKeyboard: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(controller: controller, shouldShowKeyboard: $shouldShowKeyboard)
    }

    func makeUIView(context: Context) -> FirstResponderTerminalView {
        let terminalView = FirstResponderTerminalView(frame: .zero)
        terminalView.terminalDelegate = controller

        // Use Menlo font for better emoji and wide character support
        // Menlo has better rendering characteristics for Unicode/emoji than default monospace
        if let menloFont = UIFont(name: "Menlo-Regular", size: 14) {
            terminalView.font = menloFont
        } else {
            // Fallback to system monospace if Menlo is unavailable
            terminalView.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
        }

        // Set dark color scheme
        terminalView.nativeForegroundColor = UIColor.white
        terminalView.nativeBackgroundColor = UIColor.black

        // Configure ANSI color palette with dark theme to prevent light backgrounds
        // on Unicode characters. SwiftTerm's default palette includes light colors
        // that can appear as grey/white rectangles behind characters.
        let terminal = terminalView.getTerminal()
        let darkPalette: [SwiftTerm.Color] = [
            // Standard colors (0-7)
            SwiftTerm.Color(red: 0, green: 0, blue: 0),           // 0: Black
            SwiftTerm.Color(red: 52428, green: 0, blue: 0),        // 1: Red
            SwiftTerm.Color(red: 0, green: 52428, blue: 0),        // 2: Green
            SwiftTerm.Color(red: 52428, green: 52428, blue: 0),    // 3: Yellow
            SwiftTerm.Color(red: 0, green: 0, blue: 52428),        // 4: Blue
            SwiftTerm.Color(red: 52428, green: 0, blue: 52428),    // 5: Magenta
            SwiftTerm.Color(red: 0, green: 52428, blue: 52428),    // 6: Cyan
            SwiftTerm.Color(red: 52428, green: 52428, blue: 52428), // 7: White (dimmed to prevent bright backgrounds)
            // Bright colors (8-15)
            SwiftTerm.Color(red: 32768, green: 32768, blue: 32768), // 8: Bright Black (dark grey)
            SwiftTerm.Color(red: 65535, green: 16384, blue: 16384), // 9: Bright Red
            SwiftTerm.Color(red: 16384, green: 65535, blue: 16384), // 10: Bright Green
            SwiftTerm.Color(red: 65535, green: 65535, blue: 16384), // 11: Bright Yellow
            SwiftTerm.Color(red: 16384, green: 16384, blue: 65535), // 12: Bright Blue
            SwiftTerm.Color(red: 65535, green: 16384, blue: 65535), // 13: Bright Magenta
            SwiftTerm.Color(red: 16384, green: 65535, blue: 65535), // 14: Bright Cyan
            SwiftTerm.Color(red: 58982, green: 58982, blue: 58982)  // 15: Bright White (dimmed to 90%)
        ]
        terminal.installPalette(colors: darkPalette)

        // Configure keyboard behavior for desktop parity (if properties exist)
        // Configure Backspace to send DEL (0x7f) instead of ^H (0x08)
        if terminalView.responds(to: Selector(("setBackspaceSendsControlH:"))) {
            terminalView.setValue(false, forKey: "backspaceSendsControlH")
        }
        // Option-as-Meta enables Alt/Option key combos (ESC prefix for word navigation, etc.)
        if terminalView.responds(to: Selector(("setOptionAsMetaKey:"))) {
            terminalView.setValue(true, forKey: "optionAsMetaKey")
        }
        // Application cursor mode improves arrow/function key handling in TUIs
        if terminalView.responds(to: Selector(("setApplicationCursor:"))) {
            terminalView.setValue(true, forKey: "applicationCursor")
        }

        // Note: SwiftTerm handles cursor visibility through ensureCaretIsVisible()
        // which we call after each feed operation in feedBytes()

        // Enable keyboard input
        terminalView.isUserInteractionEnabled = true

        // Use SwiftTerm's default TerminalAccessory keyboard (includes ESC, Tab, Ctrl, arrows)
        // Do NOT override inputAccessoryView - SwiftTerm sets it up in setup()

        // Store reference to terminal view in controller
        controller.terminalView = terminalView

        let tapGesture = UITapGestureRecognizer()
        tapGesture.cancelsTouchesInView = false
        tapGesture.addTarget(context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        terminalView.addGestureRecognizer(tapGesture)

        // Keyboard is managed solely via updateUIView watching shouldShowKeyboard binding
        // No need for shouldFocusOnAttach mechanism

        return terminalView
    }

    func updateUIView(_ uiView: FirstResponderTerminalView, context: Context) {
        // Ensure controller has the live view reference if applicable
        if controller.terminalView !== uiView {
            controller.terminalView = uiView
        }

        if shouldShowKeyboard {
            // Defer to next run loop to avoid hierarchy timing issues
            DispatchQueue.main.async {
                // Enhanced defensive guards for stable keyboard display
                guard uiView.window != nil,          // View is attached to a window
                      uiView.superview != nil,       // View is in view hierarchy
                      !uiView.isFirstResponder else { // Not already first responder
                    return
                }
                _ = uiView.becomeFirstResponder()
            }
        } else {
            // Only resign if actually first responder
            if uiView.isFirstResponder {
                _ = uiView.resignFirstResponder()
            }
        }
    }

    class Coordinator {
        let controller: SwiftTermController
        var shouldShowKeyboard: Binding<Bool>

        init(controller: SwiftTermController, shouldShowKeyboard: Binding<Bool>) {
            self.controller = controller
            self.shouldShowKeyboard = shouldShowKeyboard
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let termView = controller.terminalView, !termView.isFirstResponder else { return }
            _ = termView.becomeFirstResponder()
        }
    }
}

// MARK: - FirstResponderTerminalView
/// Custom TerminalView subclass that properly handles first responder status for keyboard presentation
final class FirstResponderTerminalView: TerminalView {
    /// Explicitly allow first responder to present the iOS keyboard
    override var canBecomeFirstResponder: Bool { true }

    // Keyboard management is handled by updateUIView watching shouldShowKeyboard binding
    // No special lifecycle handling needed here
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}
