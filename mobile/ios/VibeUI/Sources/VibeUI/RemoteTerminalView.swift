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
    @State private var commandHistory: [String] = []
    @State private var historyIndex = -1
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSessionActive = false
    @State private var currentSessionId: String?
    @StateObject private var voiceDictationService = VoiceDictationService.shared
    @StateObject private var textEnhancementService = TextEnhancementService.shared

    @State private var scrollToBottom = false

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
                        .small()
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.destructive)
                        .foregroundColor(Color.foreground)
                        .cornerRadius(4)

                        Button("Kill") {
                            killSession()
                        }
                        .small()
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.warning)
                        .foregroundColor(Color.foreground)
                        .cornerRadius(4)
                    }

                    Button("Done") {
                        dismiss()
                    }
                    .small()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.primary)
                    .foregroundColor(Color.foreground)
                    .cornerRadius(4)
                }
            }
        }
        .onAppear {
            startTerminalSession()
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

                if #available(iOS 17.0, *) {
                    TextField("Enter command...", text: $inputText)
                        .font(.system(.body, design: .monospaced))
                        .textFieldStyle(PlainTextFieldStyle())
                        .foregroundColor(Color.foreground)
                        .submitLabel(.send)
                        .onSubmit {
                            sendCommand()
                        }
                        .onKeyPress(.upArrow) {
                            navigateHistory(direction: .up)
                            return .handled
                        }
                        .onKeyPress(.downArrow) {
                            navigateHistory(direction: .down)
                            return .handled
                        }
                } else {
                    TextField("Enter command...", text: $inputText)
                        .font(.system(.body, design: .monospaced))
                        .textFieldStyle(PlainTextFieldStyle())
                        .foregroundColor(Color.foreground)
                        .submitLabel(.send)
                        .onSubmit {
                            sendCommand()
                        }
                }

                Button("Send") {
                    sendCommand()
                }
                .small()
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.primary)
                .foregroundColor(Color.foreground)
                .cornerRadius(6)
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            HStack(spacing: 12) {
                Button(action: toggleRecording) {
                    HStack(spacing: 6) {
                        Image(systemName: voiceDictationService.isRecording ? "mic.fill" : "mic")
                            .foregroundColor(voiceDictationService.isRecording ? Color.destructive : Color.primary)
                        Text(voiceDictationService.isRecording ? "Stop" : "Mic")
                    }
                    .small()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(voiceDictationService.isRecording ? Color.destructive.opacity(0.1) : Color.muted.opacity(0.2))
                    .foregroundColor(voiceDictationService.isRecording ? Color.destructive : Color.foreground)
                    .cornerRadius(6)
                }

                Button("Enhance") {
                    enhanceText()
                }
                .small()
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.success.opacity(0.2))
                .foregroundColor(Color.success)
                .cornerRadius(6)
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
                for try await output in container.terminalService.openSession() {
                    await MainActor.run {
                        isLoading = false
                        isSessionActive = true

                        if let sessionId = parseSessionId(from: output) {
                            currentSessionId = sessionId
                        }

                        let terminalOutput = TerminalOutput(
                            sessionId: currentSessionId ?? "unknown",
                            data: output,
                            timestamp: Date(),
                            outputType: .stdout
                        )
                        addTerminalOutput(terminalOutput)
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
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
        guard !command.isEmpty, let sessionId = currentSessionId else { return }

        if !commandHistory.contains(command) {
            commandHistory.append(command)
        }
        historyIndex = -1

        let echoOutput = TerminalOutput(
            sessionId: sessionId,
            data: "$ \(command)\n",
            timestamp: Date(),
            outputType: .system
        )
        addTerminalOutput(echoOutput)

        Task {
            do {
                for try await output in container.terminalService.write(sessionId: sessionId, input: command + "\n") {
                    await MainActor.run {
                        let terminalOutput = TerminalOutput(
                            sessionId: sessionId,
                            data: output,
                            timestamp: Date(),
                            outputType: .stdout
                        )
                        addTerminalOutput(terminalOutput)
                    }
                }
                await MainActor.run {
                    inputText = ""
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func sendCtrlC() {
        guard let sessionId = currentSessionId else { return }

        Task {
            do {
                for try await output in container.terminalService.write(sessionId: sessionId, input: "\u{03}") {
                    await MainActor.run {
                        let terminalOutput = TerminalOutput(
                            sessionId: sessionId,
                            data: output,
                            timestamp: Date(),
                            outputType: .system
                        )
                        addTerminalOutput(terminalOutput)
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func killSession() {
        guard let sessionId = currentSessionId else { return }

        Task {
            do {
                try await container.terminalService.close(sessionId: sessionId)
                await MainActor.run {
                    isSessionActive = false
                    currentSessionId = nil
                    let killOutput = TerminalOutput(
                        sessionId: sessionId,
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
        cancellables.removeAll()
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

                for try await transcribedText in voiceDictationService.transcribe() {
                    await MainActor.run {
                        if inputText.isEmpty {
                            inputText = transcribedText
                        } else {
                            inputText += " " + transcribedText
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func stopRecording() {
        voiceDictationService.stopRecording()
    }

    private func enhanceText() {
        let textToEnhance = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !textToEnhance.isEmpty else { return }

        Task {
            do {
                let enhancedText = try await textEnhancementService.enhance(text: textToEnhance, context: "terminal_command")
                await MainActor.run {
                    inputText = enhancedText
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

    private func parseSessionId(from output: String) -> String? {
        if let data = output.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
           let sessionId = json["sessionId"] as? String {
            return sessionId
        }
        return nil
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
