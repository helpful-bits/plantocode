import SwiftUI
import Core
import Combine
import SwiftTerm
import OSLog
import QuartzCore
import Network

public struct RemoteTerminalView: View {
    let jobId: String
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    @State private var terminalSession: TerminalSession?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSessionActive = false
    @State private var composePresentation: ComposePresentation? = nil
    @StateObject private var terminalController = SwiftTermController()
    @ObservedObject private var pathObserver = NetworkPathObserver.shared

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

    // Rate-limiting for reconnection to avoid repeated full-screen redraws
    @State private var lastReattachAt: Date? = nil
    @State private var reattachInFlight: Bool = false

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
        // Collapse actions and hide keyboard to maximize screen real estate
        await MainActor.run {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isActionsExpanded = false
            }
            shouldShowKeyboard = false
        }
    }

    private func pasteTaskDescription() async {
        guard !taskDescriptionContent.isEmpty else { return }
        try? await container.terminalService.sendLargeText(
            jobId: jobId,
            text: taskDescriptionContent,
            appendCarriageReturn: true
        )
        // Collapse actions and hide keyboard to maximize screen real estate
        await MainActor.run {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isActionsExpanded = false
            }
            shouldShowKeyboard = false
        }
    }

    private func reattachToExistingSessionIfNeeded() {
        guard let terminalSession = terminalSession, isSessionActive else { return }
        guard pathObserver.currentPath?.status == .satisfied else { return }

        // Prevent concurrent reattach attempts
        if reattachInFlight { return }

        // Rate-limit reattachment to at most once every 2 seconds
        let now = Date()
        if let last = lastReattachAt, now.timeIntervalSince(last) < 2.0 {
            return
        }

        reattachInFlight = true
        lastReattachAt = now

        let capturedJobId = jobId
        let terminalService = container.terminalService

        // If already subscribed to hydrated stream, only ensure binary bind is present
        // This avoids replaying the entire ring snapshot repeatedly
        if outputCancellable != nil {
            Task {
                defer { reattachInFlight = false }
                try? await terminalService.attachLiveBinary(for: capturedJobId, includeSnapshot: true)
            }
            return
        }

        // Subscribe to hydrated stream (first time or after cleanup)
        outputCancellable = terminalService
            .getHydratedRawOutputStream(for: capturedJobId)
            .receive(on: DispatchQueue.main)
            .sink { data in
                terminalController.feedBytes(data: data)
            }

        Task {
            defer { reattachInFlight = false }
            try? await terminalService.attachLiveBinary(for: capturedJobId, includeSnapshot: true)
        }
    }

    public var body: some View {
        bodyWithModifiers
    }

    @ViewBuilder
    private var bodyWithModifiers: some View {
        let base = mainContent
            .background(Color.background)
            .navigationBarTitleDisplayMode(.inline)
            .fullScreenCover(item: $composePresentation, content: composeSheet)
            .onChange(of: composePresentation, perform: handleComposePresentationChange)
            .toolbar { toolbarContent }
            .onAppear(perform: handleOnAppear)
            .onDisappear(perform: cleanupSession)
            .onChange(of: terminalSession?.id, perform: handleSessionIdChange)
            .onChange(of: isTerminalReady, perform: handleTerminalReadyChange)
            .onChange(of: scenePhase, perform: handleScenePhaseChange)

        base
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                isKeyboardVisible = true
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                isKeyboardVisible = false
            }
            .onReceive(pathObserver.$currentPath.compactMap { $0 }, perform: handlePathChange)
    }

    /// Handle app background/foreground transitions to prevent "endless scrolling" after background return.
    /// When backgrounded, terminal output is buffered instead of fed immediately.
    /// When foregrounded, buffered data is fed without animation to avoid scroll jumping.
    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .active:
            terminalController.resumeFeeding()
        case .inactive, .background:
            terminalController.pauseFeeding()
        @unknown default:
            break
        }
    }

    private func composeSheet(presentation: ComposePresentation) -> some View {
        TerminalComposeView(jobId: jobId, autoStartRecording: presentation.autoStartRecording)
            .environmentObject(container)
    }

    private func handleTerminalReadyChange(_ ready: Bool) {
        if ready { shouldShowKeyboard = true }
    }

    private func handlePathChange(_ path: NWPath) {
        if path.status == .satisfied {
            reattachToExistingSessionIfNeeded()
        }
    }

    // MARK: - Extracted View Components

    @ViewBuilder
    private var mainContent: some View {
        VStack(spacing: 0) {
            if let error = errorMessage {
                errorView(error: error)
            } else if isLoading {
                loadingView
            } else {
                terminalContentView
            }
        }
    }

    @ViewBuilder
    private func errorView(error: String) -> some View {
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
                    await MainActor.run { startTerminalSession() }
                }
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.background)
    }

    @ViewBuilder
    private var loadingView: some View {
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
    }

    @ViewBuilder
    private var terminalContentView: some View {
        if isActionsExpanded {
            actionsToolbar
        }
        SwiftTerminalView(controller: terminalController, shouldShowKeyboard: $shouldShowKeyboard)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black)
    }

    @ViewBuilder
    private var actionsToolbar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button("Compose") { openCompose() }
                    .buttonStyle(PrimaryButtonStyle())

                if contextType == .taskDescription && !taskDescriptionContent.isEmpty {
                    Button("Task") {
                        Task { await pasteTaskDescription() }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }

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

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .navigationBarTrailing) {
            HStack(spacing: 12) {
                micButton
                keyboardToggleButton
                actionsToggleButton
                if isSessionActive { stopButton }
                closeButton
            }
        }
    }

    private var micButton: some View {
        Button(action: { openComposeWithVoice() }) {
            Image(systemName: "mic.circle.fill")
                .font(.system(size: 20))
        }
        .buttonStyle(ToolbarButtonStyle())
        .accessibilityLabel("Voice Compose")
        .accessibilityHint("Opens compose view and starts voice recording")
    }

    @ViewBuilder
    private var keyboardToggleButton: some View {
        if shouldShowKeyboard {
            Button(action: { shouldShowKeyboard = false }) {
                Image(systemName: "keyboard.chevron.compact.down")
                    .font(.system(size: 16))
            }
            .buttonStyle(ToolbarButtonStyle())
            .accessibilityLabel("Hide Terminal Keyboard")
        } else {
            Button(action: { shouldShowKeyboard = true }) {
                Image(systemName: "keyboard")
                    .font(.system(size: 16))
            }
            .buttonStyle(ToolbarButtonStyle())
            .accessibilityLabel("Show Terminal Keyboard")
        }
    }

    private var actionsToggleButton: some View {
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
    }

    private var stopButton: some View {
        Button("Stop") { sendCtrlC() }
            .buttonStyle(CompactDestructiveButtonStyle())
            .accessibilityLabel("Stop Process")
    }

    private var closeButton: some View {
        Button {
            cleanupSession()
            dismiss()
        } label: {
            Image(systemName: "xmark")
        }
        .buttonStyle(ToolbarButtonStyle())
        .accessibilityLabel("Close")
    }

    // MARK: - Lifecycle Handlers

    private func handleOnAppear() {
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
            await MainActor.run { startTerminalSession() }
        }
    }

    private func handleSessionIdChange(_ newSessionId: String?) {
        sessionIdForReadiness = newSessionId
        if let sid = newSessionId {
            isTerminalReady = container.terminalService.isSessionReady(sid)
        } else {
            isTerminalReady = false
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
        guard !jobId.isEmpty else {
            errorMessage = "Invalid terminal job ID"
            isLoading = false
            cleanupSession()
            return
        }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                let workingDirectory = container.sessionService.currentSession?.projectDirectory

                var preferredShell: String?
                do {
                    try await withTimeout(seconds: 5.0) {
                        try await container.settingsService.loadPreferredTerminal()
                    }
                    preferredShell = container.settingsService.preferredTerminal
                } catch {
                }

                let terminalService = container.terminalService
                let capturedJobId = jobId

                let appSid = container.sessionService.currentSession?.id ?? ""
                let contextBinding = TerminalContextBinding(
                    appSessionId: appSid,
                    contextType: self.contextType,
                    jobId: capturedJobId
                )

                let initialSize = await MainActor.run { () -> (cols: Int?, rows: Int?) in
                    guard let termView = terminalController.terminalView else {
                        return (nil, nil)
                    }
                    let terminal = termView.getTerminal()
                    guard terminal.cols > 0 && terminal.rows > 0 else {
                        return (nil, nil)
                    }
                    return (terminal.cols, terminal.rows)
                }

                let session = try await withTimeout(seconds: Self.sessionStartTimeout) {
                    try await terminalService.startSession(
                        jobId: capturedJobId,
                        shell: preferredShell,
                        context: contextBinding,
                        initialCols: initialSize.cols,
                        initialRows: initialSize.rows
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
                            }
                        }
                    }
                    terminalController.onResizeCompleted = { needsSnapshot in
                        guard needsSnapshot else { return }
                        Task {
                            terminalService.requestSnapshot(jobId: capturedJobId)
                        }
                    }

                    if outputCancellable == nil {
                        outputCancellable = terminalService
                            .getHydratedRawOutputStream(for: capturedJobId)
                            .receive(on: DispatchQueue.main)
                            .sink { data in
                                terminalController.feedBytes(data: data)
                            }
                    }

                    if let termView = terminalController.terminalView {
                        let terminal = termView.getTerminal()
                        let cols = terminal.cols
                        let rows = terminal.rows

                        if cols > 0 && rows > 0 {
                            // Ensure PTY size is synced before requesting binary bind/snapshot.
                            Task {
                                try? await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                                await MainActor.run {
                                    hasInitialResize = true
                                }
                            }
                        }
                    }
                }

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
                    cleanupSession()
                }
            }
        }
    }

    private func handleComposePresentationChange(_ newValue: ComposePresentation?) {
        // Hide keyboard when compose sheet dismisses
        if newValue == nil {
            shouldShowKeyboard = false
            terminalController.terminalView?.resignFirstResponder()
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
                    cleanupSession()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    cleanupSession()
                }
            }
        }
    }

    private func cleanupSession() {
        outputCancellable?.cancel()
        outputCancellable = nil
        readinessCancellable?.cancel()
        readinessCancellable = nil
        isSessionActive = false
        let capturedJobId = jobId
        let terminalService = container.terminalService
        Task {
            try? await terminalService.detach(jobId: capturedJobId)
        }
        terminalController.cleanup()
    }
}

// MARK: - SwiftTerm Controller

class SwiftTermController: NSObject, ObservableObject {
    private static let clearScreenBytes: [UInt8] = [0x1b, 0x5b, 0x32, 0x4a, 0x1b, 0x5b, 0x48] // ESC[2J ESC[H
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
    var onResizeCompleted: ((Bool) -> Void)?
    var isFirstResize = true
    private var pendingData: [Data] = []

    private var batchBuffer = Data()
    private var displayLink: CADisplayLink?
    private var needsFlush = false

    private var lastDataReceivedAt: Date = .distantPast
    private var burstStartedAt: Date?
    private var framesSinceLastData: Int = 0
    private static let burstThreshold: TimeInterval = 0.1
    private static let burstCooldown: TimeInterval = 0.5
    private static let minFlushIntervalIdle: TimeInterval = 0.12
    private static let minFlushIntervalBurst: TimeInterval = 0.06
    private var lastFlushAt: Date = .distantPast
    private static let dsrRequestSequence: [UInt8] = [0x1b, 0x5b, 0x36, 0x6e]

    private var effectiveMinFlushInterval: TimeInterval {
        return burstStartedAt == nil ? Self.minFlushIntervalIdle : Self.minFlushIntervalBurst
    }

    // Background/foreground handling: pause feeding when app is backgrounded
    private var isFeedingPaused: Bool = false
    private var backgroundBuffer: [Data] = []
    private static let maxBackgroundChunks = 50

    // Resize deduplication: track last sent dimensions
    private var lastSentCols: Int = 0
    private var lastSentRows: Int = 0

    // Resize transition buffering: pause feeding briefly during resize to avoid scroll corruption
    private var isResizeInProgress: Bool = false
    private var resizeBuffer: [Data] = []
    private var didBufferDuringResize: Bool = false
    private static let maxResizeBufferChunks = 30
    private static let resizeDebounceIdle: TimeInterval = 0.25  // 250ms when no active output
    private static let resizeDebounceActive: TimeInterval = 0.08  // 80ms when actively streaming

    // Scroll-following: only auto-scroll when user is near bottom
    private var followOutput: Bool = true
    private var lastScrollPosition: Double = 1.0
    private static let nearBottomThreshold: Double = 0.98

    deinit {
        displayLink?.invalidate()
    }

    func cleanup() {
        displayLink?.invalidate()
        displayLink = nil
        pendingData.removeAll(keepingCapacity: false)
        batchBuffer.removeAll(keepingCapacity: false)
        backgroundBuffer.removeAll(keepingCapacity: false)
        resizeBuffer.removeAll(keepingCapacity: false)
        burstStartedAt = nil
        isFeedingPaused = false
        isResizeInProgress = false
        didBufferDuringResize = false
        lastSentCols = 0
        lastSentRows = 0
        terminalView = nil
    }

    // MARK: - Background/Foreground Handling

    /// Pause feeding terminal data when app enters background.
    /// Data will be buffered and fed when resumed.
    func pauseFeeding() {
        isFeedingPaused = true
        displayLink?.isPaused = true
    }

    /// Resume feeding terminal data when app enters foreground.
    /// Buffered data is fed immediately without animation.
    func resumeFeeding() {
        isFeedingPaused = false

        // Feed background-buffered data without animation to avoid scroll jumping
        // CRITICAL: Consolidate all chunks into one data block before feeding.
        // Feeding each chunk separately causes SwiftTerm to recalculate scroll position
        // for each chunk, leading to "endless scrolling" when returning from background
        // with many buffered chunks.
        if !backgroundBuffer.isEmpty {
            var consolidated = Data()
            for chunk in backgroundBuffer {
                consolidated.append(chunk)
            }
            backgroundBuffer.removeAll()

            if !consolidated.isEmpty {
                UIView.performWithoutAnimation { [self] in
                    feedBytesImmediate(data: consolidated)
                }
            }
            // Let SwiftTerm handle scrolling naturally after background resume
        }

        // Resume display link if we have pending data
        if needsFlush {
            displayLink?.isPaused = false
        }
    }

    private func feedBytesImmediate(data: Data) {
        guard let terminalView = terminalView, !data.isEmpty else { return }
        let buffer = ArraySlice([UInt8](data))
        terminalView.feed(byteArray: buffer)
    }

    private func setupDisplayLinkIfNeeded() {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(displayLinkFired))
        // Moderate frame rate keeps latency low without maxing out CPU.
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 6, maximum: 30, preferred: 15)
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

        let timeSinceLastFlush = now.timeIntervalSince(lastFlushAt)
        if timeSinceLastFlush < effectiveMinFlushInterval {
            return
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

        // If paused (app backgrounded), buffer instead of feeding
        if isFeedingPaused {
            backgroundBuffer.append(data)
            // Prevent unbounded memory growth during background
            if backgroundBuffer.count > Self.maxBackgroundChunks {
                backgroundBuffer.removeFirst(backgroundBuffer.count - Self.maxBackgroundChunks)
            }
            return
        }

        // If resize in progress, buffer data to avoid scroll corruption during size transition
        // This prevents cursor positioning commands from being interpreted with wrong dimensions
        if isResizeInProgress {
            resizeBuffer.append(data)
            didBufferDuringResize = true
            // Prevent unbounded memory growth during resize
            if resizeBuffer.count > Self.maxResizeBufferChunks {
                resizeBuffer.removeFirst(resizeBuffer.count - Self.maxResizeBufferChunks)
            }
            return
        }

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

        if containsDsrRequest(data) {
            flushBatchBuffer()
            return
        }

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

        // CRITICAL: Capture buffer contents BEFORE any operations that might trigger reentrancy.
        // terminalView.feed() can pump the run loop, allowing feedBytes() to be called again.
        // If we don't snapshot first, the buffer indices can become invalid mid-iteration,
        // causing EXC_BREAKPOINT crashes in Data subscript operations.
        let pendingDataSnapshot = pendingData
        let batchBufferSnapshot = batchBuffer
        pendingData.removeAll()
        batchBuffer.removeAll(keepingCapacity: true)

        // Wrap feed operations in performWithoutAnimation
        // to prevent Core Animation from interpolating between terminal frames
        UIView.performWithoutAnimation {
            // Feed any pre-terminal buffered data first
            for buffered in pendingDataSnapshot {
                let buffer = ArraySlice([UInt8](buffered))
                terminalView.feed(byteArray: buffer)
            }

            // Feed batched data directly - SwiftTerm handles incomplete escape sequences internally
            if !batchBufferSnapshot.isEmpty {
                let buffer = ArraySlice([UInt8](batchBufferSnapshot))
                terminalView.feed(byteArray: buffer)
            }

            // CRITICAL: Do NOT call repositionVisibleFrame() here!
            // SwiftTerm handles cursor visibility internally. Calling repositionVisibleFrame()
            // causes "fighting loop" where our scroll conflicts with SwiftTerm's cursor-following
            // behavior during TUI redraws (like Claude Code's progress display).
            // Let SwiftTerm manage all scrolling naturally.
        }
    }

    private func containsDsrRequest(_ data: Data) -> Bool {
        guard !data.isEmpty else { return false }
        let bytes = [UInt8](data)
        let pattern = Self.dsrRequestSequence
        guard bytes.count >= pattern.count else { return false }

        for idx in 0...(bytes.count - pattern.count) {
            if bytes[idx] == pattern[0]
                && bytes[idx + 1] == pattern[1]
                && bytes[idx + 2] == pattern[2]
                && bytes[idx + 3] == pattern[3] {
                return true
            }
        }
        return false
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

        // Skip if dimensions haven't actually changed (prevents duplicate resize calls during layout thrash)
        guard newCols != lastSentCols || newRows != lastSentRows else {
            return
        }

        // First resize must be immediate to set correct PTY size before output rendering
        // Subsequent resizes are debounced to handle keyboard show/hide and rotation smoothly
        if isFirstResize {
            isFirstResize = false
            lastSentCols = newCols
            lastSentRows = newRows
            onResize?(newCols, newRows)
        } else {
            // Start resize transition: buffer incoming data to avoid scroll corruption
            // from cursor positioning commands interpreted with wrong dimensions
            isResizeInProgress = true
            didBufferDuringResize = false

            // Adaptive debounce: shorter when actively streaming (burstStartedAt != nil),
            // longer when idle to coalesce rapid keyboard show/hide cycles
            let isActivelyStreaming = burstStartedAt != nil
            let debounceInterval = isActivelyStreaming ? Self.resizeDebounceActive : Self.resizeDebounceIdle

            resizeDebouncer?.cancel()
            let capturedCols = newCols
            let capturedRows = newRows
            resizeDebouncer = DispatchWorkItem { [weak self] in
                guard let self = self else { return }

                // Double-check dimensions still different before sending
                guard capturedCols != self.lastSentCols || capturedRows != self.lastSentRows else {
                    self.completeResizeTransition()
                    return
                }

                self.lastSentCols = capturedCols
                self.lastSentRows = capturedRows
                self.onResize?(capturedCols, capturedRows)

                // Complete resize transition after a brief delay to allow PTY to process
                // the new size before we resume feeding data
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                    self?.completeResizeTransition()
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + debounceInterval, execute: resizeDebouncer!)
        }
    }

    /// Complete resize transition: flush buffered data and reset scroll position
    private func completeResizeTransition() {
        guard isResizeInProgress else { return }
        isResizeInProgress = false

        guard let terminalView = terminalView else {
            resizeBuffer.removeAll()
            return
        }

        resizeBuffer.removeAll()

        // Clear local buffers and screen; rehydrate via snapshot after resize.
        pendingData.removeAll(keepingCapacity: false)
        batchBuffer.removeAll(keepingCapacity: false)
        backgroundBuffer.removeAll(keepingCapacity: false)
        needsFlush = false

        UIView.performWithoutAnimation { [self] in
            let buffer = ArraySlice(Self.clearScreenBytes)
            terminalView.feed(byteArray: buffer)
        }

        onResizeCompleted?(true)

        // Let SwiftTerm handle scrolling naturally after resize

        // Resume display link if we have pending batch data
        if needsFlush {
            displayLink?.isPaused = false
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
        // Track scroll position and update followOutput state
        // When user scrolls up, disable auto-scroll; when near bottom, re-enable
        lastScrollPosition = position
        if position >= Self.nearBottomThreshold {
            followOutput = true
        } else {
            followOutput = false
        }
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

        // Mark terminal as opaque with solid background to reduce compositing artifacts during mirroring
        terminalView.isOpaque = true
        terminalView.backgroundColor = .black

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

        // Note: We intentionally do NOT call repositionVisibleFrame() after batch flushes.
        // SwiftTerm handles cursor visibility and scrolling internally. Forcing scroll position
        // causes "fighting loop" during TUI redraws (like Claude Code's progress display).

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
        // Mobile-optimized scrollback: 2,000 lines reduces layout work when
        // coming back from background with large output buffers.
        // Higher values (e.g., 50,000) cause "endless scrolling" issues.
        let terminal = getTerminal()
        terminal.options.scrollback = 2_000
        terminal.silentLog = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        let terminal = getTerminal()
        terminal.options.scrollback = 2_000
        terminal.silentLog = true
    }

    // Keyboard management is handled by updateUIView watching shouldShowKeyboard binding
    // No special lifecycle handling needed here
}

// MARK: - Compose Presentation Model

/// Identifiable wrapper for compose sheet presentation to ensure correct state capture
struct ComposePresentation: Identifiable, Equatable {
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
