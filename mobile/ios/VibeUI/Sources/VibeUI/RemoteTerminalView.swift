import SwiftUI
import UIKit
import Core
import Combine
import SwiftTerm
import QuartzCore
import Network
import CoreText

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

        attachSnapshotStream(jobId: capturedJobId)
        Task {
            defer { reattachInFlight = false }
            terminalService.requestSnapshot(jobId: capturedJobId)
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

    private func attachSnapshotStream(jobId: String) {
        terminalController.outputCancellable?.cancel()
        terminalController.outputCancellable = nil
        terminalController.resetForResync()

        terminalController.outputCancellable = container.terminalService
            .getRawOutputStream(for: jobId)
            .receive(on: DispatchQueue.main)
            .sink { data in
                terminalController.feedBytes(data: data)
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
        ZStack(alignment: .top) {
            SwiftTerminalView(controller: terminalController, shouldShowKeyboard: $shouldShowKeyboard)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)

            if isActionsExpanded {
                actionsToolbar
                    .frame(maxWidth: .infinity, alignment: .top)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .ignoresSafeArea([.container, .keyboard], edges: .bottom)
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

                    terminalController.onResize = { cols, rows, resizeId in
                        Task {
                            defer {
                                Task { @MainActor in
                                    terminalController.finishResizeTransition(resizeId)
                                }
                            }
                            do {
                                try await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                            } catch {
                            }
                        }
                    }
                    terminalController.onResyncNeeded = { [weak terminalController, container, jobId] in
                        guard let terminalController else { return }
                        let terminalService = container.terminalService
                        let capturedJobId = jobId

                        Task { @MainActor in
                            terminalController.outputCancellable?.cancel()
                            terminalController.outputCancellable = terminalService
                                .getRawOutputStream(for: capturedJobId)
                                .receive(on: DispatchQueue.main)
                                .sink { data in
                                    terminalController.feedBytes(data: data)
                                }
                            terminalService.requestSnapshot(jobId: capturedJobId)
                        }
                    }
                    attachSnapshotStream(jobId: capturedJobId)

                    if let termView = terminalController.terminalView {
                        let terminal = termView.getTerminal()
                        let cols = terminal.cols
                        let rows = terminal.rows

                        if cols > 0 && rows > 0 {
                            // Ensure PTY size is synced before requesting binary bind/snapshot.
                            Task {
                                try? await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                                terminalService.requestSnapshot(jobId: capturedJobId)
                            }
                        } else {
                            terminalService.requestSnapshot(jobId: capturedJobId)
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
        terminalController.outputCancellable?.cancel()
        terminalController.outputCancellable = nil
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
    struct DebugState {
        let needsInitialScrollToBottom: Bool
        let hasReceivedOutput: Bool
        let isResizeInProgress: Bool
        let pendingDataCount: Int
        let batchBufferBytes: Int
        let resizeBufferCount: Int
        let displayLinkPaused: Bool
    }
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
    var onResize: ((Int, Int, Int) -> Void)?
    var onResyncNeeded: (() -> Void)?
    var onContentUpdated: (() -> Void)?
    private var pendingData: [Data] = []

    var outputCancellable: AnyCancellable?

    private var batchBuffer = Data()
    private var displayLink: CADisplayLink?
    private var needsFlush = false
    private var needsInitialScrollToBottom = true
    private var hasReceivedOutput = false

    private var lastDataReceivedAt: Date = .distantPast
    private var burstStartedAt: Date?
    private static let burstThreshold: TimeInterval = 0.1
    private static let burstCooldown: TimeInterval = 0.5
    private static let minFlushIntervalIdle: TimeInterval = 0.12
    private static let minFlushIntervalBurst: TimeInterval = 0.06
    private var lastFlushAt: Date = .distantPast
    private static let dsrRequestSequence: [UInt8] = [0x1b, 0x5b, 0x36, 0x6e]
    private static let enableAutowrapSequence: [UInt8] = [0x1b, 0x5b, 0x3f, 0x37, 0x68]

    private var effectiveMinFlushInterval: TimeInterval {
        return burstStartedAt == nil ? Self.minFlushIntervalIdle : Self.minFlushIntervalBurst
    }

    // Background/foreground handling: pause feeding when app is backgrounded
    private var isFeedingPaused: Bool = false
    private var backgroundBuffer: [Data] = []
    private var backgroundBufferBytes: Int = 0
    private var needsResyncAfterBackground: Bool = false
    private static let maxBackgroundBufferBytes = 1 * 1_048_576
    private static let backgroundResyncThreshold: TimeInterval = 2.0
    private var backgroundedAt: Date?

    // Resize deduplication: track last sent dimensions
    private var lastSentCols: Int = 0
    private var lastSentRows: Int = 0

    // Resize transition buffering: pause feeding briefly during resize to avoid scroll corruption
    private var isResizeInProgress: Bool = false
    private var resizeBuffer: [Data] = []
    private static let maxResizeBufferChunks = 30
    private var resizeSequence: Int = 0
    private var activeResizeSequence: Int = 0
    private var resizeCompletionWorkItem: DispatchWorkItem?


    deinit {
        displayLink?.invalidate()
    }

    func cleanup() {
        displayLink?.invalidate()
        displayLink = nil
        pendingData.removeAll(keepingCapacity: false)
        batchBuffer.removeAll(keepingCapacity: false)
        backgroundBuffer.removeAll(keepingCapacity: false)
        backgroundBufferBytes = 0
        needsResyncAfterBackground = false
        backgroundedAt = nil
        resizeBuffer.removeAll(keepingCapacity: false)
        burstStartedAt = nil
        isFeedingPaused = false
        isResizeInProgress = false
        resizeSequence = 0
        activeResizeSequence = 0
        resizeCompletionWorkItem?.cancel()
        resizeCompletionWorkItem = nil
        lastSentCols = 0
        lastSentRows = 0
        outputCancellable?.cancel()
        outputCancellable = nil
        terminalView = nil
        onResyncNeeded = nil
        onContentUpdated = nil
        needsInitialScrollToBottom = true
        hasReceivedOutput = false
    }

    // MARK: - Background/Foreground Handling

    /// Pause feeding terminal data when app enters background.
    /// Data will be buffered and fed when resumed.
    func pauseFeeding() {
        isFeedingPaused = true
        backgroundedAt = Date()
        displayLink?.isPaused = true
    }

    /// Resume feeding terminal data when app enters foreground.
    /// Buffered data is fed immediately without animation.
    func resumeFeeding() {
        isFeedingPaused = false

        let timeInBackground = backgroundedAt.map { Date().timeIntervalSince($0) } ?? 0
        backgroundedAt = nil

        if needsResyncAfterBackground || timeInBackground >= Self.backgroundResyncThreshold {
            needsResyncAfterBackground = false
            resetForResync()
            onResyncNeeded?()
            return
        }

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
            backgroundBufferBytes = 0

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

    func resetForResync() {
        pendingData.removeAll(keepingCapacity: false)
        batchBuffer.removeAll(keepingCapacity: false)
        backgroundBuffer.removeAll(keepingCapacity: false)
        backgroundBufferBytes = 0
        resizeBuffer.removeAll(keepingCapacity: false)
        needsFlush = false
        burstStartedAt = nil
        isResizeInProgress = false
        needsInitialScrollToBottom = true
        hasReceivedOutput = false

        if let terminalView = terminalView {
            terminalView.getTerminal().resetToInitialState()
            let buffer = ArraySlice(Self.enableAutowrapSequence)
            terminalView.feed(byteArray: buffer)
            terminalView.setNeedsDisplay(terminalView.bounds)
        }
    }

    private func feedBytesImmediate(data: Data) {
        guard let terminalView = terminalView, !data.isEmpty else { return }
        hasReceivedOutput = true
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
            if needsResyncAfterBackground {
                return
            }

            backgroundBuffer.append(data)
            backgroundBufferBytes += data.count
            if backgroundBufferBytes > Self.maxBackgroundBufferBytes {
                needsResyncAfterBackground = true
                backgroundBuffer.removeAll(keepingCapacity: false)
                backgroundBufferBytes = 0
            }
            return
        }

        // If resize in progress, buffer data to avoid scroll corruption during size transition
        // This prevents cursor positioning commands from being interpreted with wrong dimensions
        if isResizeInProgress {
            resizeBuffer.append(data)
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
        hasReceivedOutput = true

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

            if needsInitialScrollToBottom {
                tryScrollToBottomIfNeeded()
            }

            // IMPORTANT: Avoid calling repositionVisibleFrame() on every flush.
            // We only use it once to ensure an initial "scroll to bottom" when the
            // terminal first becomes visible; repeated calls fight SwiftTerm's scroll handling.
        }

        onContentUpdated?()
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

    func tryScrollToBottomIfNeeded() {
        guard needsInitialScrollToBottom, hasReceivedOutput else { return }
        guard let terminalView = terminalView else { return }
        guard terminalView.bounds.width > 0, terminalView.bounds.height > 0 else { return }
        if terminalView.canScroll {
            terminalView.scroll(toPosition: 1)
        } else {
            terminalView.setContentOffset(.zero, animated: false)
        }
        needsInitialScrollToBottom = false
    }

    func debugState() -> DebugState {
        DebugState(
            needsInitialScrollToBottom: needsInitialScrollToBottom,
            hasReceivedOutput: hasReceivedOutput,
            isResizeInProgress: isResizeInProgress,
            pendingDataCount: pendingData.count,
            batchBufferBytes: batchBuffer.count,
            resizeBufferCount: resizeBuffer.count,
            displayLinkPaused: displayLink?.isPaused ?? true
        )
    }

    func send(data: [UInt8]) {
        onSend?(data)
    }
}

extension SwiftTermController: TerminalViewDelegate {
    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        send(data: Array(data))
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        // Skip invalid sizes (0x0 or unreasonably small)
        guard newCols >= 10 && newRows >= 5 else {
            return
        }

        // Skip if dimensions haven't actually changed (prevents duplicate resize calls during layout thrash)
        guard newCols != lastSentCols || newRows != lastSentRows else {
            return
        }

        // Start resize transition: buffer incoming data to avoid scroll corruption
        isResizeInProgress = true
        resizeSequence += 1
        let resizeId = resizeSequence
        activeResizeSequence = resizeId

        lastSentCols = newCols
        lastSentRows = newRows
        onResize?(newCols, newRows, resizeId)

        // Fallback completion in case resize RPC stalls.
        scheduleResizeCompletion(resizeId: resizeId, delay: 0.6)
    }

    /// Complete resize transition: flush buffered data and reset scroll position
    func finishResizeTransition(_ resizeId: Int) {
        guard isResizeInProgress, resizeId == activeResizeSequence else { return }
        resizeCompletionWorkItem?.cancel()
        resizeCompletionWorkItem = nil
        completeResizeTransition()
    }

    private func scheduleResizeCompletion(resizeId: Int, delay: TimeInterval) {
        resizeCompletionWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.finishResizeTransition(resizeId)
        }
        resizeCompletionWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func completeResizeTransition() {
        guard isResizeInProgress else { return }
        isResizeInProgress = false

        guard let terminalView = terminalView else {
            resizeBuffer.removeAll()
            return
        }

        if !resizeBuffer.isEmpty {
            var consolidated = Data()
            for chunk in resizeBuffer {
                consolidated.append(chunk)
            }
            resizeBuffer.removeAll()
            if !consolidated.isEmpty {
                UIView.performWithoutAnimation { [self] in
                    feedBytesImmediate(data: consolidated)
                }
            }
        } else {
            resizeBuffer.removeAll()
        }

        tryScrollToBottomIfNeeded()

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
        // SwiftTerm handles scrolling internally; no-op for now.
    }
}

// MARK: - Stable Terminal Host

private struct TerminalGrid: Equatable {
    let cols: Int
    let rows: Int
    let pixelSize: CGSize

    static let zero = TerminalGrid(cols: 0, rows: 0, pixelSize: .zero)
}

private enum TerminalFont {
    static func preferred() -> UIFont {
        if let menloFont = UIFont(name: "Menlo-Regular", size: 14) {
            return menloFont
        }
        return UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
    }
}

private enum TerminalCellMetrics {
    static func cellSize(for font: UIFont) -> CGSize {
        let lineAscent = CTFontGetAscent(font)
        let lineDescent = CTFontGetDescent(font)
        let lineLeading = CTFontGetLeading(font)
        var cellHeight = ceil(lineAscent + lineDescent + lineLeading)

        let fallbackProbe = "\u{2705}\u{25B3}"
        let probeLength = fallbackProbe.utf16.count
        let fallbackFont = CTFontCreateForString(font, fallbackProbe as CFString, CFRange(location: 0, length: probeLength))
        let fallbackHeight = ceil(
            CTFontGetAscent(fallbackFont) + CTFontGetDescent(fallbackFont) + CTFontGetLeading(fallbackFont)
        )
        if fallbackHeight > cellHeight {
            cellHeight = fallbackHeight
        }

        let cellWidth = "W".size(withAttributes: [.font: font]).width
        return CGSize(width: max(1, cellWidth), height: max(1, min(cellHeight, 8192)))
    }
}

final class StableTerminalHostView: UIView {
    private struct DebugSnapshot {
        let bounds: CGRect
        let safeInsets: UIEdgeInsets
        let panelFrame: CGRect
        let baseY: CGFloat
        let overlapGuide: CGFloat
        let overlapNotif: CGFloat?
        let overlapUsed: CGFloat
        let cursorRow: Int
        let cursorBottom: CGFloat
        let keyboardTop: CGFloat
        let desiredY: CGFloat
        let targetY: CGFloat
        let yDisp: Int
        let windowGuideFrame: CGRect?
        let notifFrame: CGRect?
        let hideInProgress: Bool
        let contentOffset: CGPoint
        let contentSize: CGSize
        let canScroll: Bool
        let scrollPosition: Double
        let controllerState: SwiftTermController.DebugState?
    }

    private weak var controller: SwiftTermController?
    // Debug overlay disabled for normal use.
    private let debugEnabled = false
    private let debugOverlay = UIView()
    private let debugLabel = UILabel()
    private struct LayoutSignature: Equatable {
        let size: CGSize
        let insets: UIEdgeInsets

        init(size: CGSize, insets: UIEdgeInsets, scale: CGFloat) {
            self.size = Self.snap(size, scale: scale)
            self.insets = Self.snap(insets, scale: scale)
        }

        private static func snap(_ size: CGSize, scale: CGFloat) -> CGSize {
            CGSize(
                width: (size.width * scale).rounded() / scale,
                height: (size.height * scale).rounded() / scale
            )
        }

        private static func snap(_ insets: UIEdgeInsets, scale: CGFloat) -> UIEdgeInsets {
            UIEdgeInsets(
                top: (insets.top * scale).rounded() / scale,
                left: (insets.left * scale).rounded() / scale,
                bottom: (insets.bottom * scale).rounded() / scale,
                right: (insets.right * scale).rounded() / scale
            )
        }
    }

    private let panelView = UIView()
    let terminalView: FirstResponderTerminalView
    private let cellSize: CGSize
    private var grid: TerminalGrid = .zero
    private var lastLayoutSignature: LayoutSignature?
    private var keyboardObservers: [NSObjectProtocol] = []
    private var lastKeyboardFrameInScreen: CGRect?
    private var keyboardHideInProgress: Bool = false
    private var basePanelOriginY: CGFloat = 0
    private var lastAppliedOverlap: CGFloat = 0
    private var lastAppliedTargetY: CGFloat = 0

    private let minimumCols = 10
    private let minimumRows = 5

    init(controller: SwiftTermController) {
        let font = TerminalFont.preferred()
        self.cellSize = TerminalCellMetrics.cellSize(for: font)
        self.terminalView = FirstResponderTerminalView(frame: .zero)
        self.controller = controller
        super.init(frame: .zero)

        backgroundColor = .black
        isOpaque = true
        clipsToBounds = true

        panelView.backgroundColor = .black
        panelView.isOpaque = true
        panelView.clipsToBounds = true
        addSubview(panelView)

        if debugEnabled {
            debugOverlay.backgroundColor = UIColor.black.withAlphaComponent(0.45)
            debugOverlay.isUserInteractionEnabled = false
            debugOverlay.layer.cornerRadius = 6
            debugOverlay.clipsToBounds = true
            addSubview(debugOverlay)

            debugLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
            debugLabel.textColor = .green
            debugLabel.numberOfLines = 0
            debugOverlay.addSubview(debugLabel)
        }

        terminalView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        panelView.addSubview(terminalView)

        configureTerminalView(terminalView, font: font)
        terminalView.terminalDelegate = controller
        controller.terminalView = terminalView
        controller.onContentUpdated = { [weak self] in
            self?.applyKeyboardPosition(animated: false)
            // self?.updateDebugOverlay()
        }

        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tapGesture.cancelsTouchesInView = false
        terminalView.addGestureRecognizer(tapGesture)

        startKeyboardObservers()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        for observer in keyboardObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        keyboardObservers.removeAll()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateGridIfNeeded()
        layoutPanel()
        applyKeyboardPosition(animated: false)
        controller?.tryScrollToBottomIfNeeded()
        // updateDebugOverlay()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        setNeedsLayout()
        layoutIfNeeded()
        applyKeyboardPosition(animated: false)
    }

    private func updateGridIfNeeded() {
        guard bounds.width > 0, bounds.height > 0 else { return }
        let scale = window?.screen.scale ?? UIScreen.main.scale
        let insets = layoutInsets()
        let signature = LayoutSignature(size: bounds.size, insets: insets, scale: scale)
        guard signature != lastLayoutSignature else { return }
        lastLayoutSignature = signature

        let usableWidth = bounds.width - insets.left - insets.right
        let usableHeight = bounds.height - insets.top - insets.bottom
        guard usableWidth > 0, usableHeight > 0 else { return }

        let cols = max(minimumCols, Int(usableWidth / cellSize.width))
        let rows = max(minimumRows, Int(usableHeight / cellSize.height))
        let pixelSize = CGSize(width: CGFloat(cols) * cellSize.width, height: CGFloat(rows) * cellSize.height)
        let newGrid = TerminalGrid(cols: cols, rows: rows, pixelSize: pixelSize)

        if newGrid != grid {
            grid = newGrid
            terminalView.resize(cols: cols, rows: rows)
        }
    }

    private func layoutPanel() {
        let insets = layoutInsets()
        let usableWidth = bounds.width - insets.left - insets.right
        let panelSize = grid.pixelSize
        let originX = insets.left + max(0, (usableWidth - panelSize.width) / 2)
        let originY = bounds.height - insets.bottom - panelSize.height

        let scale = window?.screen.scale ?? UIScreen.main.scale
        let snappedOriginX = (originX * scale).rounded() / scale
        let snappedOriginY = (originY * scale).rounded() / scale

        panelView.frame = CGRect(origin: CGPoint(x: snappedOriginX, y: snappedOriginY), size: panelSize)
        basePanelOriginY = snappedOriginY
        terminalView.frame = panelView.bounds
        applyKeyboardPosition(animated: false)
    }

    private func layoutInsets() -> UIEdgeInsets {
        UIEdgeInsets(
            top: safeAreaInsets.top,
            left: safeAreaInsets.left,
            bottom: 0,
            right: safeAreaInsets.right
        )
    }

    private func configureTerminalView(_ terminalView: FirstResponderTerminalView, font: UIFont) {
        terminalView.isOpaque = true
        terminalView.backgroundColor = .black
        terminalView.contentInsetAdjustmentBehavior = .never
        terminalView.font = font
        terminalView.nativeForegroundColor = UIColor.white
        terminalView.nativeBackgroundColor = UIColor.black
        terminalView.selectedTextBackgroundColor = UIColor(white: 0.25, alpha: 0.85)
        terminalView.selectionHandleColor = UIColor(white: 0.8, alpha: 1.0)

        let enableAutowrap: [UInt8] = [0x1b, 0x5b, 0x3f, 0x37, 0x68]
        terminalView.feed(byteArray: ArraySlice(enableAutowrap))

        if terminalView.responds(to: Selector(("setBackspaceSendsControlH:"))) {
            terminalView.setValue(false, forKey: "backspaceSendsControlH")
        }
        if terminalView.responds(to: Selector(("setOptionAsMetaKey:"))) {
            terminalView.setValue(true, forKey: "optionAsMetaKey")
        }
        if terminalView.responds(to: Selector(("setApplicationCursor:"))) {
            terminalView.setValue(true, forKey: "applicationCursor")
        }

        terminalView.isUserInteractionEnabled = true
    }

    private func startKeyboardObservers() {
        guard keyboardObservers.isEmpty else { return }
        let center = NotificationCenter.default

        keyboardObservers.append(center.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            self?.handleKeyboard(notification: note)
        })

        keyboardObservers.append(center.addObserver(
            forName: UIResponder.keyboardWillChangeFrameNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            self?.handleKeyboard(notification: note)
        })

        keyboardObservers.append(center.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            self?.handleKeyboard(notification: note)
        })

        keyboardObservers.append(center.addObserver(
            forName: UIResponder.keyboardDidChangeFrameNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            self?.handleKeyboard(notification: note)
        })
    }

    private func handleKeyboard(notification: Notification) {
        if let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
            lastKeyboardFrameInScreen = keyboardFrame
            let screenHeight = UIScreen.main.bounds.maxY
            if keyboardFrame.minY < screenHeight - 1 {
                keyboardHideInProgress = false
            }
        }
        if notification.name == UIResponder.keyboardWillHideNotification {
            keyboardHideInProgress = true
        }
        let duration = (notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        let curveRaw = (notification.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? Int) ?? UIView.AnimationCurve.easeOut.rawValue
        let options = UIView.AnimationOptions(rawValue: UInt(curveRaw << 16))
        applyKeyboardPosition(animated: true, duration: duration, options: options)
        // updateDebugOverlay()
    }

    private func currentKeyboardOverlap() -> CGFloat {
        let guideOverlap = keyboardOverlapFromLayoutGuide()
        if guideOverlap > 0 {
            keyboardHideInProgress = false
            return guideOverlap
        }

        guard let overlap = keyboardOverlapFromNotificationFrame() else { return 0 }
        if overlap > 0 {
            keyboardHideInProgress = false
            return overlap
        }

        if keyboardHideInProgress {
            keyboardHideInProgress = false
        }
        return 0
    }

    private func keyboardOverlapFromLayoutGuide() -> CGFloat {
        if let window = window {
            let windowGuideFrame = window.keyboardLayoutGuide.layoutFrame
            if windowGuideFrame.height > 0 {
                let keyboardFrameInView = convert(windowGuideFrame, from: window)
                return max(0, bounds.maxY - keyboardFrameInView.minY)
            }
        }

        let guideFrame = keyboardLayoutGuide.layoutFrame
        if guideFrame.height > 0 {
            return max(0, bounds.maxY - guideFrame.minY)
        }
        return 0
    }

    private func keyboardOverlapFromNotificationFrame() -> CGFloat? {
        guard let window = window, let screenFrame = lastKeyboardFrameInScreen else { return nil }
        let keyboardFrameInWindow = window.convert(screenFrame, from: nil)
        let keyboardFrameInView = convert(keyboardFrameInWindow, from: window)
        if keyboardFrameInView.minY >= bounds.maxY - 1 {
            return 0
        }
        var overlap = max(0, bounds.maxY - keyboardFrameInView.minY)
        if overlap > 0 {
            overlap += terminalView.inputAccessoryView?.bounds.height ?? 0
        }
        return overlap
    }

    private func applyKeyboardPosition(animated: Bool, duration: Double = 0, options: UIView.AnimationOptions = []) {
        guard panelView.bounds.height > 0 else { return }
        let overlap = currentKeyboardOverlap()
        let buffer = terminalView.getTerminal().buffer
        let cursorRow = max(0, buffer.y - buffer.yDisp)
        let cursorBottom = CGFloat(cursorRow + 1) * cellSize.height
        let keyboardTop = bounds.maxY - overlap
        let desiredPadding = cellSize.height
        let desiredY = keyboardTop - desiredPadding - cursorBottom

        let minY = basePanelOriginY - overlap
        let maxY = basePanelOriginY
        var targetY = min(max(desiredY, minY), maxY)
        lastAppliedTargetY = targetY
        lastAppliedOverlap = basePanelOriginY - targetY

        let scale = window?.screen.scale ?? UIScreen.main.scale
        targetY = (targetY * scale).rounded() / scale
        let animations = {
            self.panelView.transform = .identity
            var frame = self.panelView.frame
            frame.origin.y = targetY
            self.panelView.frame = frame
        }

        if animated {
            UIView.animate(withDuration: duration, delay: 0, options: [options, .beginFromCurrentState], animations: animations)
        } else {
            animations()
        }
    }

    private func updateDebugOverlay() {
        guard debugEnabled else { return }

        let buffer = terminalView.getTerminal().buffer
        let overlapNow = currentKeyboardOverlap()
        let cursorRow = max(0, buffer.y - buffer.yDisp)
        let cursorBottom = CGFloat(cursorRow + 1) * cellSize.height
        let keyboardTop = bounds.maxY - overlapNow
        let desiredY = keyboardTop - cellSize.height - cursorBottom

        let snapshot = DebugSnapshot(
            bounds: bounds,
            safeInsets: safeAreaInsets,
            panelFrame: panelView.frame,
            baseY: basePanelOriginY,
            overlapGuide: keyboardOverlapFromLayoutGuide(),
            overlapNotif: keyboardOverlapFromNotificationFrame(),
            overlapUsed: lastAppliedOverlap,
            cursorRow: cursorRow,
            cursorBottom: cursorBottom,
            keyboardTop: keyboardTop,
            desiredY: desiredY,
            targetY: lastAppliedTargetY,
            yDisp: buffer.yDisp,
            windowGuideFrame: window?.keyboardLayoutGuide.layoutFrame,
            notifFrame: lastKeyboardFrameInScreen,
            hideInProgress: keyboardHideInProgress,
            contentOffset: terminalView.contentOffset,
            contentSize: terminalView.contentSize,
            canScroll: terminalView.canScroll,
            scrollPosition: terminalView.scrollPosition,
            controllerState: controller?.debugState()
        )

        let lines: [String] = [
            "bounds=\(snapshot.bounds.debugString)",
            "safe=\(snapshot.safeInsets.debugString)",
            "panel=\(snapshot.panelFrame.debugString)",
            "baseY=\(snapshot.baseY.roundedString)",
            "ovlGuide=\(snapshot.overlapGuide.roundedString)",
            "ovlNotif=\(snapshot.overlapNotif?.roundedString ?? "nil")",
            "ovlUsed=\(snapshot.overlapUsed.roundedString)",
            "cursorRow=\(snapshot.cursorRow)",
            "cursorBottom=\(snapshot.cursorBottom.roundedString)",
            "kbdTop=\(snapshot.keyboardTop.roundedString)",
            "desiredY=\(snapshot.desiredY.roundedString)",
            "targetY=\(snapshot.targetY.roundedString)",
            "yDisp=\(snapshot.yDisp)",
            "winGuide=\(snapshot.windowGuideFrame?.debugString ?? "nil")",
            "notifFrame=\(snapshot.notifFrame?.debugString ?? "nil")",
            "hide=\(snapshot.hideInProgress)",
            "offset=\(snapshot.contentOffset.debugString)",
            "content=\(snapshot.contentSize.debugString)",
            "canScroll=\(snapshot.canScroll)",
            "scrollPos=\(String(format: "%.2f", snapshot.scrollPosition))",
            "needsScroll=\(snapshot.controllerState?.needsInitialScrollToBottom ?? false)",
            "hasOutput=\(snapshot.controllerState?.hasReceivedOutput ?? false)",
            "resize=\(snapshot.controllerState?.isResizeInProgress ?? false)",
            "pending=\(snapshot.controllerState?.pendingDataCount ?? 0)",
            "batch=\(snapshot.controllerState?.batchBufferBytes ?? 0)",
            "resizeBuf=\(snapshot.controllerState?.resizeBufferCount ?? 0)",
            "linkPaused=\(snapshot.controllerState?.displayLinkPaused ?? true)"
        ]

        debugLabel.text = lines.joined(separator: "\n")
        let maxWidth = min(bounds.width - 16, 340)
        let fitting = debugLabel.sizeThatFits(CGSize(width: maxWidth - 10, height: .greatestFiniteMagnitude))
        debugOverlay.frame = CGRect(x: 8, y: 8, width: maxWidth, height: fitting.height + 10)
        debugLabel.frame = CGRect(x: 5, y: 5, width: maxWidth - 10, height: fitting.height)
        bringSubviewToFront(debugOverlay)
    }

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        guard !terminalView.isFirstResponder else { return }
        _ = terminalView.becomeFirstResponder()
    }
}

private extension CGRect {
    var debugString: String {
        "(\(origin.x.roundedString), \(origin.y.roundedString), \(size.width.roundedString), \(size.height.roundedString))"
    }
}

private extension CGPoint {
    var debugString: String {
        "(\(x.roundedString), \(y.roundedString))"
    }
}

private extension CGSize {
    var debugString: String {
        "(\(width.roundedString), \(height.roundedString))"
    }
}

private extension UIEdgeInsets {
    var debugString: String {
        "(\(top.roundedString), \(left.roundedString), \(bottom.roundedString), \(right.roundedString))"
    }
}

private extension CGFloat {
    var roundedString: String {
        String(format: "%.1f", Double(self))
    }
}

// MARK: - SwiftTerm UIViewRepresentable

struct SwiftTerminalView: UIViewRepresentable {
    @ObservedObject var controller: SwiftTermController
    @Binding var shouldShowKeyboard: Bool

    func makeUIView(context: Context) -> StableTerminalHostView {
        StableTerminalHostView(controller: controller)
    }

    func updateUIView(_ uiView: StableTerminalHostView, context: Context) {
        if controller.terminalView !== uiView.terminalView {
            controller.terminalView = uiView.terminalView
        }

        if shouldShowKeyboard {
            DispatchQueue.main.async {
                guard uiView.terminalView.window != nil,
                      uiView.terminalView.superview != nil,
                      !uiView.terminalView.isFirstResponder else {
                    return
                }
                _ = uiView.terminalView.becomeFirstResponder()
            }
        } else {
            if uiView.terminalView.isFirstResponder {
                _ = uiView.terminalView.resignFirstResponder()
            }
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

    override func paste(_ sender: Any?) {
        guard let text = UIPasteboard.general.string, !text.isEmpty else { return }

        let terminal = getTerminal()
        if terminal.bracketedPasteMode {
            let wrapped = "\u{1b}[200~" + text + "\u{1b}[201~"
            send(txt: wrapped)
            setNeedsDisplay()
            return
        }

        super.paste(sender)
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
