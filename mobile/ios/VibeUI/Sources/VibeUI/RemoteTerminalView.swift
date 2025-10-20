import SwiftUI
import Core
import Combine
import SwiftTerm

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

    @State private var shouldShowKeyboard = false
    @State private var outputCancellable: AnyCancellable?
    @State private var hasInitialResize = false
    @State private var pendingTerminalInput = "" // Track input that hasn't been sent yet

    private let outputBufferLimit = 1000

    @State private var copyButtons: [CopyButton] = []
    @State private var planContentForJob: String = ""
    @State private var didAutoPaste: Bool = false
    @State private var initialCopyButtonId: String? = nil
    @State private var isActionsExpanded: Bool = false

    public init(jobId: String, initialCopyButtonId: String? = nil) {
        self.jobId = jobId
        self._initialCopyButtonId = State(initialValue: initialCopyButtonId)
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
        if let content = try? await container.plansService.getFullPlanContent(jobId: jobId).async() {
            await MainActor.run { self.planContentForJob = content }
        }
    }

    private func ensurePlanContent(jobId: String) async {
        if planContentForJob.isEmpty {
            await loadPlanContent(jobId: jobId)
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

    private func tryAutoPaste(jobId: String) {
        guard !didAutoPaste, !planContentForJob.isEmpty, !copyButtons.isEmpty else { return }
        didAutoPaste = true
        Task {
            try? await Task.sleep(nanoseconds: 150_000_000) // PTY readiness delay
            let chosen: CopyButton
            if let id = initialCopyButtonId, let found = copyButtons.first(where: { $0.id == id }) {
                chosen = found
            } else {
                chosen = copyButtons[0]
            }
            await paste(using: chosen, jobId: jobId)
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Compose + Copy buttons toolbar - only visible when Actions is expanded
            if isActionsExpanded {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Button("Compose") {
                            openCompose()
                        }
                        .buttonStyle(PrimaryButtonStyle())

                        if !copyButtons.isEmpty && !planContentForJob.isEmpty {
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
                .background(Color(.systemGroupedBackground))
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            // SwiftTerm terminal view - handles input, output, and keyboard accessories
            SwiftTerminalView(controller: terminalController, shouldShowKeyboard: $shouldShowKeyboard)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
        }
        .background(Color.background)
        .navigationTitle("Terminal")
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
                        .accessibilityLabel("Hide Keyboard")
                        .accessibilityHint("Dismisses the on-screen keyboard")
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

                    Button("Close") {
                        cleanupSession()
                        dismiss()
                    }
                    .buttonStyle(ToolbarButtonStyle())
                    .accessibilityLabel("Close")
                    .accessibilityHint("Closes the terminal view")
                }
            }
        }
        .onAppear {
            // Ensure relay connection is ready before starting terminal
            Task {
                let connectionManager = MultiConnectionManager.shared

                // Restore connections if needed
                if !connectionManager.isActiveDeviceConnected {
                    do {
                        try await connectionManager.restoreConnections()
                    } catch {
                        print("Failed to restore connections: \(error)")
                    }

                    // Wait up to 10 seconds for connection
                    var attempts = 0
                    while !connectionManager.isActiveDeviceConnected && attempts < 40 {
                        try? await Task.sleep(nanoseconds: 250_000_000) // 0.25s
                        attempts += 1
                    }

                    if !connectionManager.isActiveDeviceConnected {
                        await MainActor.run {
                            errorMessage = "Cannot start terminal: No active device connection. Please ensure desktop is online."
                            isLoading = false
                        }
                        return
                    }
                }

                startTerminalSession()
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
                    print("Failed to fetch shell preference: \(error)")
                }

                // Capture service and jobId before entering MainActor scope
                let terminalService = container.terminalService
                let capturedJobId = jobId

                // Build explicit context binding
                let appSid = container.sessionService.currentSession?.id ?? ""
                let contextBinding = TerminalContextBinding(
                    appSessionId: appSid,
                    contextType: .implementationPlan,
                    jobId: capturedJobId
                )

                let session = try await terminalService.startSession(
                    jobId: capturedJobId,
                    shell: preferredShell,
                    context: contextBinding
                )
                await MainActor.run {
                    terminalSession = session
                    isSessionActive = true
                    isLoading = false

                    terminalController.onSend = { bytes in
                        Task {
                            do {
                                try await terminalService.write(jobId: capturedJobId, bytes: bytes)
                                print("[Terminal] Successfully sent \(bytes.count) bytes to desktop")
                            } catch {
                                print("[Terminal] Failed to send bytes: \(error)")
                            }
                        }
                    }

                    // Propagate terminal size changes to remote PTY
                    terminalController.onResize = { cols, rows in
                        Task {
                            do {
                                print("[Terminal] Sending resize: \(cols)x\(rows) (initial=\(!hasInitialResize))")
                                try await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)

                                if !hasInitialResize {
                                    hasInitialResize = true
                                    print("[Terminal] First resize complete")
                                }
                            } catch {
                                print("[Terminal] Failed to resize: \(error)")
                            }
                        }
                    }

                    // Start output stream immediately to receive live data
                    print("[Terminal] Subscribing to hydrated output stream for session \(capturedJobId)")
                    outputCancellable = terminalService
                        .getHydratedRawOutputStream(for: capturedJobId)
                        .receive(on: DispatchQueue.main)
                        .sink { data in
                            print("[Terminal] feedBytes called with \(data.count) bytes for session \(capturedJobId)")
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
                            print("[Terminal] Manual initial resize: \(cols)x\(rows)")

                            Task {
                                do {
                                    try await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                                    hasInitialResize = true
                                    print("[Terminal] Manual resize complete")
                                } catch {
                                    print("[Terminal] Failed manual resize: \(error)")
                                }
                            }
                        } else {
                            print("[Terminal] Skipping manual resize - terminal not yet sized (\(cols)x\(rows))")
                        }
                    }

                    // Enable keyboard after setup
                    shouldShowKeyboard = true
                }

                // Load copy buttons and plan content (no auto-paste)
                Task {
                    await loadCopyButtons()
                    await ensurePlanContent(jobId: jobId)
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
        // Do not detach binary binding here; binding is session-scoped and finalized on real teardown.
        outputCancellable?.cancel()
        outputCancellable = nil
    }
}

// MARK: - SwiftTerm Controller

class SwiftTermController: ObservableObject {
    weak var terminalView: TerminalView?
    var onSend: (([UInt8]) -> Void)?
    var onResize: ((Int, Int) -> Void)?
    var isFirstResize = true

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
        guard let terminalView = terminalView else {
            return
        }

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
            print("[Terminal] Skipping invalid resize: \(newCols)x\(newRows)")
            return
        }

        // First resize must be immediate to set correct PTY size before output rendering
        // Subsequent resizes are debounced to handle keyboard show/hide and rotation smoothly
        if isFirstResize {
            isFirstResize = false
            print("[Terminal] Immediate first resize: \(newCols)x\(newRows)")
            onResize?(newCols, newRows)
        } else {
            // Debounce subsequent resize events with 200ms delay
            resizeDebouncer?.cancel()
            resizeDebouncer = DispatchWorkItem { [weak self] in
                self?.onResize?(newCols, newRows)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: resizeDebouncer!)
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

    func makeUIView(context: Context) -> TerminalView {
        let terminalView = TerminalView(frame: .zero)
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

        // Store reference to terminal view in controller
        controller.terminalView = terminalView

        // Observe keyboard notifications to sync state bidirectionally
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil,
            queue: .main
        ) { _ in
            if terminalView.isFirstResponder {
                context.coordinator.updateKeyboardState(true)
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { _ in
            if !terminalView.isFirstResponder {
                context.coordinator.updateKeyboardState(false)
            }
        }

        return terminalView
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {
        // Ensure terminal view reference is up to date
        if controller.terminalView !== uiView {
            controller.terminalView = uiView
        }

        // Handle keyboard visibility changes
        if shouldShowKeyboard {
            if !uiView.isFirstResponder && !context.coordinator.didBecomeFirstResponder {
                DispatchQueue.main.async {
                    uiView.becomeFirstResponder()
                    context.coordinator.didBecomeFirstResponder = true
                }
            }
        } else {
            if uiView.isFirstResponder {
                DispatchQueue.main.async {
                    uiView.resignFirstResponder()
                    context.coordinator.didBecomeFirstResponder = false
                }
            }
        }
    }

    class Coordinator {
        var didBecomeFirstResponder = false
        let controller: SwiftTermController
        var shouldShowKeyboard: Binding<Bool>

        init(controller: SwiftTermController, shouldShowKeyboard: Binding<Bool>) {
            self.controller = controller
            self.shouldShowKeyboard = shouldShowKeyboard
        }

        func updateKeyboardState(_ isShowing: Bool) {
            DispatchQueue.main.async {
                self.shouldShowKeyboard.wrappedValue = isShowing
            }
        }
    }
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}
