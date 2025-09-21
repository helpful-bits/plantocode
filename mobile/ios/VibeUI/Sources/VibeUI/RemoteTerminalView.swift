import SwiftUI
import Core
import Combine
import AVFoundation

public struct RemoteTerminalView: View {
    let jobId: String
    @StateObject private var terminalService = DataServicesManager(baseURL: URL(string: Config.serverURL)!, deviceId: DeviceManager.shared.getOrCreateDeviceID()).terminalService
    @Environment(\.dismiss) private var dismiss

    @State private var terminalSession: TerminalSession?
    @State private var terminalOutput: [TerminalOutput] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isSessionActive = false
    @State private var isRecording = false
    @State private var isTranscribing = false
    @State private var isEnhancing = false
    @State private var audioRecorder: AVAudioRecorder?
    @StateObject private var serverFeatureService = DataServicesManager(baseURL: URL(string: Config.serverURL)!, deviceId: DeviceManager.shared.getOrCreateDeviceID()).serverFeatureService

    @State private var scrollToBottom = false

    private let outputBufferLimit = 1000 // Limit output lines to prevent memory issues

    public init(jobId: String) {
        self.jobId = jobId
    }

    public var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Terminal Header
                terminalHeader()

                // Terminal Output
                terminalOutputView()

                // Input Section
                if isSessionActive {
                    terminalInputView()
                }
            }
            .background(Color.black)
            .navigationTitle("Terminal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        if isSessionActive {
                            Button("Ctrl+C") {
                                sendCtrlC()
                            }
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.red)
                            .foregroundColor(.white)
                            .cornerRadius(4)

                            Button("Kill") {
                                killSession()
                            }
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.orange)
                            .foregroundColor(.white)
                            .cornerRadius(4)
                        }
                    }
                }
            }
        }
        .onAppear {
            startTerminalSession()
            setupAudioSession()
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
                        .progressViewStyle(CircularProgressViewStyle(tint: .green))
                        .scaleEffect(0.8)
                    Text("Starting session...")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            } else if isSessionActive {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 8, height: 8)
                    Text("Session Active")
                        .font(.caption)
                        .foregroundColor(.green)
                }
            } else {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 8, height: 8)
                    Text("Session Inactive")
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }

            Spacer()

            if let session = terminalSession {
                Text("Job: \(session.jobId)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.8))
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
                            .foregroundColor(.red)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color.black)
            .onAppear {
                // ScrollProxy is already available in scope
            }
            .onChange(of: terminalOutput.count) { _ in
                // Auto-scroll to bottom when new output arrives
                withAnimation(.easeOut(duration: 0.1)) {
                    scrollProxy.scrollTo(terminalOutput.count - 1, anchor: .bottom)
                }
            }
        }
    }

    @ViewBuilder
    private func terminalInputView() -> some View {
        VStack(spacing: 8) {
            // Command input row
            HStack(spacing: 8) {
                Text("$")
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.green)

                TextField("Enter command...", text: $inputText)
                    .font(.system(.body, design: .monospaced))
                    .textFieldStyle(PlainTextFieldStyle())
                    .foregroundColor(.white)
                    .submitLabel(.send)
                    .onSubmit {
                        sendCommand()
                    }

                Button("Send") {
                    sendCommand()
                }
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(6)
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            // Voice and enhancement controls
            HStack(spacing: 12) {
                // Microphone Button
                Button(action: toggleRecording) {
                    HStack(spacing: 6) {
                        Image(systemName: isRecording ? "mic.fill" : "mic")
                            .foregroundColor(isRecording ? .red : .primary)
                        Text(isRecording ? "Stop" : "Record")
                    }
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(isRecording ? Color.red.opacity(0.1) : Color.gray.opacity(0.2))
                    .foregroundColor(isRecording ? .red : .white)
                    .cornerRadius(6)
                }
                .disabled(isTranscribing)

                // Enhance Button
                Button("Enhance") {
                    enhanceText()
                }
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.2))
                .foregroundColor(.green)
                .cornerRadius(6)
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isEnhancing)

                if isEnhancing || isTranscribing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.7)
                }

                Spacer()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.9))
    }

    private func startTerminalSession() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let session = try await terminalService.startSession(jobId: jobId)
                await MainActor.run {
                    terminalSession = session
                    isSessionActive = true
                    isLoading = false
                }

                // Subscribe to output stream
                subscribeToOutput()

                // Load existing log
                await loadExistingLog()

            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }

    private func subscribeToOutput() {
        terminalService.getOutputStream(for: jobId)
            .receive(on: DispatchQueue.main)
            .sink { output in
                addTerminalOutput(output)
            }
            .store(in: &cancellables)
    }

    private func loadExistingLog() async {
        do {
            let existingOutput = try await terminalService.getLog(jobId: jobId)
            await MainActor.run {
                terminalOutput = Array(existingOutput.suffix(outputBufferLimit))
            }
        } catch {
            // Log loading is optional, don't show error for this
            print("Failed to load existing terminal log: \(error)")
        }
    }

    private func addTerminalOutput(_ output: TerminalOutput) {
        terminalOutput.append(output)

        // Limit buffer size
        if terminalOutput.count > outputBufferLimit {
            terminalOutput.removeFirst(terminalOutput.count - outputBufferLimit)
        }
    }

    private func sendCommand() {
        let command = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else { return }

        // Add command to output as echo
        let echoOutput = TerminalOutput(
            sessionId: terminalSession?.id ?? "",
            data: "$ \(command)\n",
            timestamp: Date(),
            outputType: .system
        )
        addTerminalOutput(echoOutput)

        // Send command to terminal
        Task {
            do {
                try await terminalService.write(jobId: jobId, data: command + "\n")
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
        Task {
            do {
                try await terminalService.sendCtrlC(jobId: jobId)
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
                try await terminalService.kill(jobId: jobId)
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
        cancellables.removeAll()
    }

    // MARK: - Voice Input Methods

    private func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        guard !isRecording else { return }

        // Request microphone permission
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                if granted {
                    self.beginRecording()
                } else {
                    self.errorMessage = "Microphone permission is required for voice input"
                }
            }
        }
    }

    private func beginRecording() {
        let audioFilename = getDocumentsDirectory().appendingPathComponent("terminal_recording.wav")

        let settings = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
            audioRecorder?.record()
            isRecording = true
            errorMessage = nil
        } catch {
            errorMessage = "Failed to start recording: \(error.localizedDescription)"
        }
    }

    private func stopRecording() {
        guard isRecording else { return }

        audioRecorder?.stop()
        isRecording = false

        // Transcribe the recorded audio
        transcribeRecording()
    }

    private func transcribeRecording() {
        let audioFilename = getDocumentsDirectory().appendingPathComponent("terminal_recording.wav")

        guard let audioData = try? Data(contentsOf: audioFilename) else {
            errorMessage = "Failed to read recorded audio"
            return
        }

        isTranscribing = true
        errorMessage = nil

        Task {
            do {
                let response = try await serverFeatureService.transcribeAudio(audioData)
                await MainActor.run {
                    isTranscribing = false
                    if !response.text.isEmpty {
                        if inputText.isEmpty {
                            inputText = response.text
                        } else {
                            inputText += " " + response.text
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    isTranscribing = false
                    errorMessage = "Transcription failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func enhanceText() {
        let textToEnhance = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !textToEnhance.isEmpty else { return }

        isEnhancing = true
        errorMessage = nil

        Task {
            do {
                let response = try await serverFeatureService.enhanceText(textToEnhance)
                await MainActor.run {
                    isEnhancing = false
                    inputText = response.enhancedText
                }
            } catch {
                await MainActor.run {
                    isEnhancing = false
                    errorMessage = "Text enhancement failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }

    private func getDocumentsDirectory() -> URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0]
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
            return .white
        case .stderr:
            return .red
        case .system:
            return .green
        }
    }
}

#Preview {
    RemoteTerminalView(jobId: "sample-job-id")
}