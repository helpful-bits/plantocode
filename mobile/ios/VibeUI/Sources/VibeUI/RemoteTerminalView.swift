import SwiftUI
import Core
import Combine
import SwiftTerm
import OSLog
import QuartzCore

public struct RemoteTerminalView: View {
    let jobId: String
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    @State private var terminalSession: TerminalSession?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSessionActive = false
    @State private var composePresentation: ComposePresentation? = nil
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
        .fullScreenCover(item: $composePresentation) { presentation in
            TerminalComposeView(jobId: jobId, autoStartRecording: presentation.autoStartRecording)
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

    private static let sessionStartTimeout: TimeInterval = 30.0

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

                // Fetch preferred shell from settings with timeout
                let settingsService = SettingsDataService()
                var preferredShell: String?
                do {
                    try await withTimeout(seconds: 5.0) {
                        try await settingsService.loadPreferredTerminal()
                    }
                    preferredShell = settingsService.preferredTerminal
                } catch {
                    // Shell preference fetch failed - use default
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

                // Start session with timeout to prevent hanging
                let session = try await withTimeout(seconds: Self.sessionStartTimeout) {
                    try await terminalService.startSession(
                        jobId: capturedJobId,
                        shell: preferredShell,
                        context: contextBinding
                    )
                }
                await MainActor.run { [self] in
                    terminalSession = session
                    sessionIdForReadiness = session.id
                    isTerminalReady = container.terminalService.isSessionReady(session.id)
                    isSessionActive = true
                    isLoading = false

                    terminalController.onSend = { bytes in
                        Task {
                            try? await terminalService.write(jobId: capturedJobId, bytes: bytes)
                        }
                    }

                    // Propagate terminal size changes to remote PTY
                    terminalController.onResize = { cols, rows in
                        Task {
                            do {
                                try await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)

                                if hasInitialResize == false {
                                    await MainActor.run {
                                        hasInitialResize = true
                                    }
                                }
                            } catch {
                                // Resize failures are usually transient - PTY will use last known size
                            }
                        }
                    }

                    // Start output stream immediately to receive live data
                    outputCancellable = terminalService
                        .getHydratedRawOutputStream(for: capturedJobId)
                        .receive(on: DispatchQueue.main)
                        .sink { data in
                            terminalController.feedBytes(data: data)
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
                                try? await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                                await MainActor.run {
                                    hasInitialResize = true
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
        Task {
            // Resign keyboard
            await MainActor.run {
                terminalController.terminalView?.resignFirstResponder()
            }

            // Clear current line with Ctrl+U (non-critical if fails)
            try? await container.terminalService.write(jobId: jobId, bytes: [0x15])

            // Present compose sheet
            await MainActor.run {
                composePresentation = ComposePresentation(autoStartRecording: false)
            }
        }
    }

    private func openComposeWithVoice() {
        Task {
            // Resign keyboard
            await MainActor.run {
                terminalController.terminalView?.resignFirstResponder()
            }

            // Clear current line with Ctrl+U (non-critical if fails)
            try? await container.terminalService.write(jobId: jobId, bytes: [0x15])

            // Present compose sheet with auto-start flag
            await MainActor.run {
                composePresentation = ComposePresentation(autoStartRecording: true)
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
        terminalController.cleanup()
    }
}

// MARK: - SwiftTerm Controller

class SwiftTermController: NSObject, ObservableObject {
    weak var terminalView: TerminalView? {
        didSet {
            guard let terminalView = terminalView else { return }

            if !pendingData.isEmpty {
                for buffered in pendingData {
                    let buffer = ArraySlice([UInt8](buffered))
                    terminalView.feed(byteArray: buffer)
                }
                pendingData.removeAll()
            }

            if !batchBuffer.isEmpty {
                let buffer = ArraySlice([UInt8](batchBuffer))
                terminalView.feed(byteArray: buffer)
                batchBuffer.removeAll(keepingCapacity: true)
            }
        }
    }
    var onSend: (([UInt8]) -> Void)?
    var onResize: ((Int, Int) -> Void)?
    var isFirstResize = true
    private var pendingData: [Data] = []

    private var batchBuffer = Data()
    private var displayLink: CADisplayLink?
    private var needsFlush = false

    // Burst detection for adaptive frame rate
    private var lastDataReceivedAt: Date = .distantPast
    private var burstStartedAt: Date?
    private var framesSinceLastData: Int = 0
    private static let burstThreshold: TimeInterval = 0.05 // 50ms between chunks = burst mode
    private static let burstCooldown: TimeInterval = 0.3 // Stay in burst mode for 300ms after last data
    private static let minFlushInterval: TimeInterval = 0.05 // Max 20fps during bursts
    private var lastFlushAt: Date = .distantPast

    // Escape sequence buffering to avoid flushing mid-sequence
    private static let escapeChar: UInt8 = 0x1B // ESC

    deinit {
        displayLink?.invalidate()
    }

    func cleanup() {
        displayLink?.invalidate()
        displayLink = nil
        pendingData.removeAll(keepingCapacity: false)
        batchBuffer.removeAll(keepingCapacity: false)
        burstStartedAt = nil
        terminalView = nil
    }

    private func setupDisplayLinkIfNeeded() {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(displayLinkFired))
        // Lower frame rate to reduce flicker - 15-20fps is sufficient for terminal
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 15, maximum: 20, preferred: 20)
        link.add(to: .main, forMode: .common)
        link.isPaused = true
        displayLink = link
    }

    @objc private func displayLinkFired() {
        guard needsFlush else {
            displayLink?.isPaused = true
            return
        }

        let now = Date()

        // Check if we're in burst mode (rapid updates from Claude's TUI)
        let isInBurst = burstStartedAt != nil && now.timeIntervalSince(burstStartedAt!) < Self.burstCooldown

        if isInBurst {
            // During bursts, enforce minimum flush interval to coalesce more updates
            let timeSinceLastFlush = now.timeIntervalSince(lastFlushAt)
            if timeSinceLastFlush < Self.minFlushInterval {
                // Don't flush yet - wait for more data to coalesce
                framesSinceLastData += 1

                // But don't wait forever - flush after 3 frames even in burst mode
                if framesSinceLastData < 3 {
                    return
                }
            }
        }

        flushBatchBuffer()
    }

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

        let now = Date()

        // Burst detection: if data arrives rapidly, enter burst mode
        let timeSinceLastData = now.timeIntervalSince(lastDataReceivedAt)
        if timeSinceLastData < Self.burstThreshold {
            if burstStartedAt == nil {
                burstStartedAt = now
            }
        }
        lastDataReceivedAt = now
        framesSinceLastData = 0

        // Exit burst mode after cooldown
        if let burstStart = burstStartedAt, now.timeIntervalSince(burstStart) > Self.burstCooldown {
            burstStartedAt = nil
        }

        // If terminal view not ready, buffer the data
        guard terminalView != nil else {
            pendingData.append(data)

            // Prevent unbounded buffering
            if pendingData.count > 100 {
                pendingData.removeFirst(50)
            }
            return
        }

        // Accumulate data in batch buffer
        batchBuffer.append(data)

        // Mark that we need a flush and unpause display link
        needsFlush = true
        setupDisplayLinkIfNeeded()
        displayLink?.isPaused = false
    }

    private func flushBatchBuffer() {
        needsFlush = false
        lastFlushAt = Date()

        guard let terminalView = terminalView else { return }
        guard !batchBuffer.isEmpty || !pendingData.isEmpty else { return }

        // Feed any pre-terminal buffered data first
        if !pendingData.isEmpty {
            for buffered in pendingData {
                let buffer = ArraySlice([UInt8](buffered))
                terminalView.feed(byteArray: buffer)
            }
            pendingData.removeAll()
        }

        // Feed batched data
        if !batchBuffer.isEmpty {
            // Check if buffer ends with incomplete escape sequence
            // If so, hold back the incomplete part for next flush
            let holdbackData = extractIncompleteEscapeSequence()

            if !batchBuffer.isEmpty {
                let buffer = ArraySlice([UInt8](batchBuffer))
                terminalView.feed(byteArray: buffer)
                batchBuffer.removeAll(keepingCapacity: true)
            }

            // Put back the incomplete escape sequence for next flush
            if let holdback = holdbackData {
                batchBuffer.append(holdback)
            }
        }

        // Don't call setNeedsDisplay() - SwiftTerm's feed() handles display updates internally
        // Explicit setNeedsDisplay() can cause extra redraws and visible flicker during
        // escape sequence processing (clear line + redraw shows intermediate state)
    }

    /// Extract incomplete escape sequence from end of buffer to avoid mid-sequence flush
    /// Returns the incomplete portion to hold back, and modifies batchBuffer in place
    private func extractIncompleteEscapeSequence() -> Data? {
        guard batchBuffer.count > 0 else { return nil }

        // Look for ESC character in last 32 bytes (escape sequences are typically short)
        let searchStart = max(0, batchBuffer.count - 32)
        let searchRange = searchStart..<batchBuffer.count

        // Find last ESC character
        guard let escIndex = batchBuffer[searchRange].lastIndex(of: Self.escapeChar) else {
            return nil
        }

        // Check if this escape sequence is complete
        // Most escape sequences end with a letter (a-zA-Z) or specific terminators
        let sequenceData = batchBuffer[escIndex...]

        // If sequence is just ESC or ESC[, it's definitely incomplete
        if sequenceData.count <= 2 {
            let holdback = Data(batchBuffer[escIndex...])
            batchBuffer.removeSubrange(escIndex...)
            return holdback
        }

        // Check if CSI sequence (ESC [) - these end with a letter
        if sequenceData.count >= 2 && sequenceData[sequenceData.startIndex + 1] == 0x5B { // '['
            // CSI sequence - check if terminated
            let lastByte = sequenceData[sequenceData.endIndex - 1]
            let isTerminated = (lastByte >= 0x40 && lastByte <= 0x7E) // @ to ~

            if !isTerminated {
                let holdback = Data(batchBuffer[escIndex...])
                batchBuffer.removeSubrange(escIndex...)
                return holdback
            }
        }

        return nil
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

        // Note: We tried layer.drawsAsynchronously and layer.shouldRasterize
        // but they interfere with SwiftTerm's dynamic updates (typed characters don't appear).
        // The status line flicker is a SwiftTerm limitation - it renders escape sequences
        // (clear line + redraw) as separate visible states rather than atomically.
        // xterm.js doesn't have this issue because it uses proper double-buffering.

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

    override init(frame: CGRect) {
        super.init(frame: frame)
        // Increase scrollback after initialization
        let terminal = getTerminal()
        terminal.options.scrollback = 50_000
        terminal.silentLog = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        let terminal = getTerminal()
        terminal.options.scrollback = 50_000
        terminal.silentLog = true
    }

    // Keyboard management is handled by updateUIView watching shouldShowKeyboard binding
    // No special lifecycle handling needed here
}

// MARK: - Compose Presentation Model

/// Identifiable wrapper for compose sheet presentation to ensure correct state capture
struct ComposePresentation: Identifiable {
    let id = UUID()
    let autoStartRecording: Bool
}

// MARK: - Timeout Helper

/// Error thrown when an async operation times out
enum TimeoutError: Error, LocalizedError {
    case timedOut(seconds: TimeInterval)

    var errorDescription: String? {
        switch self {
        case .timedOut(let seconds):
            return "Operation timed out after \(Int(seconds)) seconds"
        }
    }
}

/// Execute an async operation with a timeout
/// - Parameters:
///   - seconds: Maximum time to wait
///   - operation: The async operation to execute
/// - Returns: The result of the operation
/// - Throws: TimeoutError if the operation takes too long, or any error from the operation
func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask {
            try await operation()
        }

        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TimeoutError.timedOut(seconds: seconds)
        }

        // Return the first result (either success or timeout)
        guard let result = try await group.next() else {
            throw TimeoutError.timedOut(seconds: seconds)
        }

        // Cancel the other task
        group.cancelAll()

        return result
    }
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}
