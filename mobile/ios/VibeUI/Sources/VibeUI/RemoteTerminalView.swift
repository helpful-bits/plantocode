import SwiftUI
import Core
import Combine
import AVFoundation

public struct RemoteTerminalView: View {
    let jobId: String
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    @State private var terminalSession: TerminalSession?
    @State private var terminalOutput: [TerminalOutput] = []
    @State private var inputText = ""
    @State private var commandSelectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var commandHistory: [String] = []
    @State private var historyIndex = -1
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSessionActive = false
    @StateObject private var voiceDictationService = VoiceDictationService.shared
    @StateObject private var textEnhancementService = TextEnhancementService.shared
    @StateObject private var settingsService = SettingsDataService()

    @State private var outputCancellable: AnyCancellable?
    @State private var transcriptionModel: String?
    @State private var transcriptionTemperature: Double?

    private let outputBufferLimit = 1000

    public init(jobId: String) {
        self.jobId = jobId
    }

    public var body: some View {
        VStack(spacing: 0) {
            terminalHeader()

            terminalOutputView()

            if isSessionActive {
                terminalInputView()
            }
        }
        .background(Color.background)
        .navigationTitle("Terminal")
        .navigationBarTitleDisplayMode(.inline)
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

                        Button("Kill") {
                            killSession()
                        }
                        .buttonStyle(CompactDestructiveButtonStyle())
                        .accessibilityLabel("Kill Process")
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
            startTerminalSession()
        }
        .onDisappear {
            cleanupSession()
        }
        .task {
            // Fetch voice transcription settings when view appears
            do {
                if let projectDir = container.sessionService.currentSession?.projectDirectory {
                    try await settingsService.fetchProjectTaskModelSettings(projectDirectory: projectDir)
                    if let settings = settingsService.projectTaskSettings["voiceTranscription"] {
                        transcriptionModel = settings.model
                        transcriptionTemperature = settings.temperature
                    }
                }
            } catch {
                print("Failed to fetch transcription settings: \(error)")
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

    @ViewBuilder
    private func terminalOutputView() -> some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(terminalOutput.enumerated()), id: \.offset) { index, output in
                        TerminalOutputRow(output: output)
                            .id(index)
                    }

                    if let errorMessage = errorMessage {
                        Text("Error: \(errorMessage)")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundColor(Color.destructive)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.codeBackground)
            .onAppear {
            }
            .onChange(of: terminalOutput.count) { _ in
                withAnimation(.easeOut(duration: 0.1)) {
                    scrollProxy.scrollTo(terminalOutput.count - 1, anchor: .bottom)
                }
            }
        }
    }

    @ViewBuilder
    private func terminalInputView() -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Text("$")
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(Color.success)

                SelectableTextView(
                    text: $inputText,
                    selectedRange: $commandSelectedRange,
                    placeholder: "Enter command...",
                    onInteraction: {},
                    singleLine: true,
                    onSubmit: sendCommand,
                    onUpArrow: { navigateHistory(direction: .up) },
                    onDownArrow: { navigateHistory(direction: .down) }
                )
                .frame(height: 36)

                Button("Send") {
                    sendCommand()
                }
                .buttonStyle(CompactPrimaryButtonStyle())
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send")
                .accessibilityHint("Sends the typed command to the terminal")
            }

            HStack(spacing: 12) {
                Button(action: toggleRecording) {
                    HStack(spacing: 6) {
                        Image(systemName: voiceDictationService.isRecording ? "mic.fill" : "mic")
                        Text(voiceDictationService.isRecording ? "Stop" : "Mic")
                    }
                }
                .buttonStyle(RecordingButtonStyle(isRecording: voiceDictationService.isRecording))

                Button("Enhance") {
                    enhanceText()
                }
                .buttonStyle(CompactSuccessButtonStyle())
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || textEnhancementService.isEnhancing)

                if textEnhancementService.isEnhancing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color.foreground))
                        .scaleEffect(0.7)
                }

                Spacer()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.background.opacity(0.9))
        .ignoresSafeArea(.keyboard)
    }

    private func startTerminalSession() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let session = try await container.terminalService.startSession(jobId: jobId)
                await MainActor.run {
                    terminalSession = session
                    isSessionActive = true
                    isLoading = false

                    // Subscribe to output once
                    outputCancellable = container.terminalService
                        .getOutputStream(for: jobId)
                        .receive(on: DispatchQueue.main)
                        .sink { output in
                            addTerminalOutput(output)
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


    private func addTerminalOutput(_ output: TerminalOutput) {
        terminalOutput.append(output)

        if terminalOutput.count > outputBufferLimit {
            terminalOutput.removeFirst(terminalOutput.count - outputBufferLimit)
        }
    }

    private func sendCommand() {
        let command = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else { return }

        if !commandHistory.contains(command) {
            commandHistory.append(command)
        }
        historyIndex = -1

        // Optional: local echo
        if let session = terminalSession {
            let echoOutput = TerminalOutput(
                sessionId: session.id,
                data: "$ \(command)\n",
                timestamp: Date(),
                outputType: .system
            )
            addTerminalOutput(echoOutput)
        }

        Task {
            do {
                try await container.terminalService.write(jobId: jobId, data: command + "\n")
                await MainActor.run {
                    inputText = ""
                    commandSelectedRange = NSRange(location: 0, length: 0)
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func sendCtrlC() {
        Task {
            do {
                try await container.terminalService.write(jobId: jobId, data: "\u{03}")
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
                    let killOutput = TerminalOutput(
                        sessionId: terminalSession?.id ?? "",
                        data: "\n[Session terminated]\n",
                        timestamp: Date(),
                        outputType: .system
                    )
                    addTerminalOutput(killOutput)
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

        cancellables.removeAll()
    }

    private func applyInsertionOrReplacement(_ text: String) {
        let nsString = inputText as NSString
        let textLength = nsString.length

        let validRange: NSRange
        if commandSelectedRange.location == NSNotFound || commandSelectedRange.location > textLength {
            validRange = NSRange(location: textLength, length: 0)
        } else if commandSelectedRange.location + commandSelectedRange.length > textLength {
            validRange = NSRange(location: commandSelectedRange.location, length: textLength - commandSelectedRange.location)
        } else {
            validRange = commandSelectedRange
        }

        let beforeRange = nsString.substring(to: validRange.location)
        let afterRange = nsString.substring(from: validRange.location + validRange.length)

        let needsSpaceBefore = !beforeRange.isEmpty && !beforeRange.hasSuffix(" ") && !beforeRange.hasSuffix("\n")
        let needsSpaceAfter = !afterRange.isEmpty && !afterRange.hasPrefix(" ") && !afterRange.hasPrefix("\n")

        let prefix = needsSpaceBefore ? " " : ""
        let suffix = needsSpaceAfter ? " " : ""

        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let insertionText = prefix + trimmedText + suffix

        inputText = beforeRange + insertionText + afterRange

        let newLocation = (beforeRange as NSString).length + (insertionText as NSString).length
        commandSelectedRange = NSRange(location: newLocation, length: 0)
    }

    private func toggleRecording() {
        if voiceDictationService.isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        Task {
            do {
                try await voiceDictationService.startRecording()
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func stopRecording() {
        voiceDictationService.stopRecording()

        Task {
            do {
                // Wait for file writes to complete
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds

                // Transcribe the recording
                for try await transcribedText in voiceDictationService.transcribe(
                    model: transcriptionModel,
                    language: nil, // Terminal doesn't have language picker, use server default
                    prompt: nil,
                    temperature: transcriptionTemperature
                ) {
                    await MainActor.run {
                        applyInsertionOrReplacement(transcribedText)
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Transcription failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func enhanceText() {
        let nsString = inputText as NSString
        let textLength = nsString.length

        let textToEnhance: String
        let isPartialEnhancement: Bool

        if commandSelectedRange.length > 0 && commandSelectedRange.location != NSNotFound && commandSelectedRange.location < textLength {
            let validLength = min(commandSelectedRange.length, textLength - commandSelectedRange.location)
            let validRange = NSRange(location: commandSelectedRange.location, length: validLength)
            textToEnhance = nsString.substring(with: validRange)
            isPartialEnhancement = true
        } else {
            textToEnhance = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
            isPartialEnhancement = false
        }

        guard !textToEnhance.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        Task {
            do {
                let sessionId = container.sessionService.currentSession?.id ?? "unknown"
                let projectDirectory = container.sessionService.currentSession?.projectDirectory

                let enhancedText = try await textEnhancementService.enhance(
                    text: textToEnhance,
                    context: "terminal_command",
                    sessionId: sessionId,
                    projectDirectory: projectDirectory
                )

                await MainActor.run {
                    if isPartialEnhancement {
                        let beforeSelection = nsString.substring(to: commandSelectedRange.location)
                        let afterSelection = nsString.substring(from: commandSelectedRange.location + commandSelectedRange.length)

                        inputText = beforeSelection + enhancedText + afterSelection

                        let newLocation = (beforeSelection as NSString).length + (enhancedText as NSString).length
                        commandSelectedRange = NSRange(location: newLocation, length: 0)
                    } else {
                        inputText = enhancedText
                        commandSelectedRange = NSRange(location: (enhancedText as NSString).length, length: 0)
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = "Text enhancement failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private enum HistoryDirection {
        case up, down
    }

    private func navigateHistory(direction: HistoryDirection) {
        guard !commandHistory.isEmpty else { return }

        switch direction {
        case .up:
            if historyIndex == -1 {
                historyIndex = commandHistory.count - 1
            } else if historyIndex > 0 {
                historyIndex -= 1
            }
        case .down:
            if historyIndex == -1 {
                return
            } else if historyIndex < commandHistory.count - 1 {
                historyIndex += 1
            } else {
                historyIndex = -1
                inputText = ""
                return
            }
        }

        if historyIndex >= 0 && historyIndex < commandHistory.count {
            inputText = commandHistory[historyIndex]
        }
    }

    @State private var cancellables = Set<AnyCancellable>()
}

private struct TerminalOutputRow: View {
    let output: TerminalOutput

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text(output.data)
                .font(.system(.caption, design: .monospaced))
                .foregroundColor(outputColor)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 1)
    }

    private var outputColor: Color {
        switch output.outputType {
        case .stdout:
            return Color.codeForeground
        case .stderr:
            return Color.destructive
        case .system:
            return Color.success
        }
    }
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}
