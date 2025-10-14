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
    @StateObject private var settingsService = SettingsDataService()
    @StateObject private var terminalController = SwiftTermController()

    @State private var shouldShowKeyboard = false
    @State private var outputCancellable: AnyCancellable?

    private let outputBufferLimit = 1000

    @State private var copyButtons: [CopyButton] = []
    @State private var planContentForJob: String = ""
    @State private var didAutoPaste: Bool = false
    @State private var initialCopyButtonId: String? = nil

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
            // Compose + Copy buttons toolbar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button("Compose") {
                        showCompose = true
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

            // SwiftTerm terminal view - handles input, output, and keyboard accessories
            SwiftTerminalView(controller: terminalController, shouldShowKeyboard: $shouldShowKeyboard)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .onTapGesture {
                    // Toggle keyboard
                    shouldShowKeyboard.toggle()
                }
        }
        .background(Color.background)
        .navigationTitle("Terminal")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showCompose) {
            TerminalComposeView(jobId: jobId)
                .environmentObject(container)
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 12) {
                    if isSessionActive {
                        Button("Ctrl+C") {
                            sendCtrlC()
                        }
                        .buttonStyle(CompactDestructiveButtonStyle())
                        .accessibilityLabel("Send Ctrl+C")
                        .accessibilityHint("Sends interrupt signal to the running process")

                        Button("Stop") {
                            killSession()
                        }
                        .buttonStyle(CompactDestructiveButtonStyle())
                        .accessibilityLabel("Stop Process")
                        .accessibilityHint("Terminates the current process")
                    }

                    Button("Done") {
                        dismiss()
                    }
                    .buttonStyle(ToolbarButtonStyle())
                    .accessibilityLabel("Done")
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
        .onDisappear {
            cleanupSession()
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

                let session = try await terminalService.startSession(
                    jobId: capturedJobId,
                    shell: preferredShell
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
                            try? await terminalService.resize(jobId: capturedJobId, cols: cols, rows: rows)
                        }
                    }

                    outputCancellable = terminalService
                        .getHydratedRawOutputStream(for: capturedJobId)
                        .receive(on: DispatchQueue.main)
                        .sink { data in
                            terminalController.feedBytes(data: data)
                        }

                    terminalService.attachLiveBinary(for: capturedJobId, includeSnapshot: true)

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

        Task {
            container.terminalService.detachLiveBinary(for: jobId)
            try? await container.terminalService.detach(jobId: jobId)
        }
    }
}

// MARK: - SwiftTerm Controller

class SwiftTermController: ObservableObject {
    weak var terminalView: TerminalView?
    var onSend: (([UInt8]) -> Void)?
    var onResize: ((Int, Int) -> Void)?

    func feed(data: String) {
        guard let terminalView = terminalView else {
            return
        }

        let buffer = ArraySlice([UInt8](data.utf8))
        terminalView.feed(byteArray: buffer)

        // Force display update
        DispatchQueue.main.async {
            terminalView.setNeedsDisplay()
            terminalView.layoutIfNeeded()
        }
    }

    func feedBytes(data: Data) {
        guard let terminalView = terminalView else {
            return
        }

        let buffer = ArraySlice([UInt8](data))
        terminalView.feed(byteArray: buffer)

        // Force display update
        DispatchQueue.main.async {
            terminalView.setNeedsDisplay()
            terminalView.layoutIfNeeded()
        }
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
        // Debounce resize events (keyboard show/hide, rotation) with 200ms delay
        resizeDebouncer?.cancel()
        resizeDebouncer = DispatchWorkItem { [weak self] in
            self?.onResize?(newCols, newRows)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: resizeDebouncer!)
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
        Coordinator(controller: controller)
    }

    func makeUIView(context: Context) -> TerminalView {
        let terminalView = TerminalView(frame: .zero)
        terminalView.terminalDelegate = controller
        terminalView.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)

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

        // Enable keyboard input
        terminalView.isUserInteractionEnabled = true

        // Store reference to terminal view in controller
        controller.terminalView = terminalView

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

        init(controller: SwiftTermController) {
            self.controller = controller
        }
    }
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}
