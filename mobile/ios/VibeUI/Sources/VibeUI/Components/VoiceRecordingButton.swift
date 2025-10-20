import SwiftUI
import Core

/// Reusable voice recording button with transcription functionality
/// Extracts the working voice transcription logic from TaskInputView
public struct VoiceRecordingButton: View {
    // Input parameters
    @Binding var text: String
    @Binding var selectedRange: NSRange
    @Binding var selectedLanguage: String

    let transcriptionModel: String?
    let transcriptionPrompt: String?
    let transcriptionTemperature: Double?
    let onError: (String) -> Void
    let onTranscriptionComplete: () -> Void

    // Shared voice service (passed from parent to ensure state observation)
    @ObservedObject var voiceService: VoiceDictationService

    // Internal state
    @State private var recordingDuration: TimeInterval = 0
    @State private var timer: Timer?

    public init(
        text: Binding<String>,
        selectedRange: Binding<NSRange>,
        selectedLanguage: Binding<String>,
        voiceService: VoiceDictationService = VoiceDictationService.shared,
        transcriptionModel: String? = nil,
        transcriptionPrompt: String? = nil,
        transcriptionTemperature: Double? = nil,
        onError: @escaping (String) -> Void = { _ in },
        onTranscriptionComplete: @escaping () -> Void = {}
    ) {
        self._text = text
        self._selectedRange = selectedRange
        self._selectedLanguage = selectedLanguage
        self.voiceService = voiceService
        self.transcriptionModel = transcriptionModel
        self.transcriptionPrompt = transcriptionPrompt
        self.transcriptionTemperature = transcriptionTemperature
        self.onError = onError
        self.onTranscriptionComplete = onTranscriptionComplete
    }

    public var body: some View {
        Button(action: toggleRecording) {
            HStack(spacing: 6) {
                Image(systemName: voiceService.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 18))

                if voiceService.isRecording {
                    Text(formatDuration(recordingDuration))
                        .font(.system(.caption, design: .monospaced))

                    // Simple audio level visualization
                    HStack(spacing: 2) {
                        ForEach(0..<5, id: \.self) { _ in
                            Capsule()
                                .fill(voiceService.isRecording ? Color.white : Color.red)
                                .frame(width: 2, height: CGFloat.random(in: 4...12))
                        }
                    }
                }
            }
            .frame(maxWidth: voiceService.isRecording ? .infinity : nil)
        }
        .buttonStyle(RecordingButtonStyle(isRecording: voiceService.isRecording))
    }

    // MARK: - Voice Recording Logic (from TaskInputView)

    private func toggleRecording() {
        Task {
            do {
                if voiceService.isRecording {
                    // Stop recording
                    voiceService.stopRecording()
                    timer?.invalidate()
                    timer = nil
                    recordingDuration = 0

                    // Wait a bit for file writes to complete
                    try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds

                    // Transcribe the recording
                    // Convert "en-US" to "en" for Whisper API
                    let languageCode = String(selectedLanguage.prefix(2))

                    for try await transcribedText in voiceService.transcribe(
                        model: transcriptionModel,
                        language: languageCode,
                        prompt: transcriptionPrompt,
                        temperature: transcriptionTemperature
                    ) {
                        await MainActor.run {
                            let nsString = text as NSString

                            let validRange: NSRange
                            if selectedRange.location == NSNotFound || selectedRange.location > nsString.length {
                                validRange = NSRange(location: nsString.length, length: 0)
                            } else if selectedRange.location + selectedRange.length > nsString.length {
                                validRange = NSRange(location: selectedRange.location, length: nsString.length - selectedRange.location)
                            } else {
                                validRange = selectedRange
                            }

                            let beforeCursor = nsString.substring(to: validRange.location)
                            let afterCursor = nsString.substring(from: validRange.location + validRange.length)

                            let prefix = beforeCursor.isEmpty ? "" : (beforeCursor.hasSuffix(" ") || beforeCursor.hasSuffix("\n") ? "" : " ")
                            let trimmedText = transcribedText.trimmingCharacters(in: .whitespacesAndNewlines)

                            text = beforeCursor + prefix + trimmedText + afterCursor

                            let newCursorPosition = (beforeCursor as NSString).length + (prefix as NSString).length + (trimmedText as NSString).length
                            selectedRange = NSRange(location: newCursorPosition, length: 0)

                            onTranscriptionComplete()
                        }
                    }
                } else {
                    try await voiceService.startRecording()

                    // Start timer for duration display
                    await MainActor.run {
                        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                            recordingDuration += 0.1
                        }
                    }
                }
            } catch VoiceDictationError.permissionDenied {
                await MainActor.run {
                    onError("Microphone permission denied")
                }
            } catch VoiceDictationError.recordingInProgress {
                await MainActor.run {
                    onError("Recording already in progress")
                }
            } catch {
                await MainActor.run {
                    onError("Voice dictation error: \(error.localizedDescription)")
                }
            }
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    @State var text = ""
    @State var selectedRange = NSRange(location: 0, length: 0)
    @State var language = "en-US"

    return VStack {
        VoiceRecordingButton(
            text: $text,
            selectedRange: $selectedRange,
            selectedLanguage: $language
        )

        Text(text)
            .padding()
    }
    .padding()
}
