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

    @State private var outputCancellable: AnyCancellable?

    private let outputBufferLimit = 1000

    public init(jobId: String) {
        self.jobId = jobId
    }

    public var body: some View {
        VStack(spacing: 0) {
            terminalHeader()

            // SwiftTerm terminal view - handles input, output, and keyboard accessories
            SwiftTerminalView(controller: terminalController)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .onTapGesture {
                    // Make terminal view first responder when tapped
                    terminalController.terminalView?.becomeFirstResponder()
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
                    Button("Compose") {
                        showCompose = true
                    }
                    .buttonStyle(ToolbarButtonStyle())
                    .accessibilityLabel("Compose")
                    .accessibilityHint("Opens full-screen editor with voice and AI features")

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

                let session = try await container.terminalService.startSession(
                    jobId: jobId,
                    workingDirectory: workingDirectory,
                    shell: preferredShell
                )
                await MainActor.run {
                    terminalSession = session
                    isSessionActive = true
                    isLoading = false

                    // Set up terminal controller to send raw bytes to server (preserves all keys)
                    terminalController.onSend = { [weak container] bytes in
                        Task {
                            try? await container?.terminalService.write(jobId: jobId, bytes: bytes)
                        }
                    }

                    // Propagate terminal size changes to remote PTY
                    terminalController.onResize = { [weak container] cols, rows in
                        Task {
                            try? await container?.terminalService.resize(jobId: jobId, cols: cols, rows: rows)
                        }
                    }

                    // Small delay to ensure publisher is ready, then subscribe to terminal output
                    Task {
                        try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 second

                        outputCancellable = container.terminalService
                            .getOutputStream(for: jobId)
                            .receive(on: DispatchQueue.main)
                            .sink { output in
                                // Feed data to SwiftTerm
                                terminalController.feed(data: output.data)
                            }
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

    func makeUIView(context: Context) -> TerminalView {
        let terminalView = TerminalView(frame: .zero)
        terminalView.terminalDelegate = controller
        terminalView.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)

        // Set dark color scheme
        terminalView.nativeForegroundColor = UIColor.white
        terminalView.nativeBackgroundColor = UIColor.black

        // Configure keyboard behavior for desktop parity (if properties exist)
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

        // Make it become first responder automatically
        DispatchQueue.main.async {
            terminalView.becomeFirstResponder()
        }

        // Store reference to terminal view in controller
        controller.terminalView = terminalView

        return terminalView
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {
        // Ensure terminal view reference is up to date
        if controller.terminalView !== uiView {
            controller.terminalView = uiView
        }
    }
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}
