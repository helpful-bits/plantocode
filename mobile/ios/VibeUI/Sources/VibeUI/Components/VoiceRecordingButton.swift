import SwiftUI
import UIKit
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
    @State private var capturedCursorPosition: NSRange? = nil
    @State private var recordingPulse = false

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
            HStack(spacing: 8) {
                micControl

                if phase != .idle {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(primaryLabel)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(primaryLabelColor)
                            .lineLimit(1)

                        Text(secondaryLabel)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(secondaryLabelColor)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 4)

                    trailingContent
                }
            }
            .padding(.horizontal, phase == .idle ? Theme.Spacing.cardSpacing : Theme.Spacing.md)
            .padding(.vertical, phase == .idle ? Theme.Spacing.cardSpacing : Theme.Spacing.sm)
            .frame(height: 48)
            .background(containerBackground)
            .clipShape(RoundedRectangle(cornerRadius: 999, style: .continuous))
            .shadow(color: shadowColor, radius: shadowRadius, x: 0, y: shadowY)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(voiceService.isTranscribing)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: phase)
        .onChange(of: voiceService.isRecording) { isRecording in
            recordingPulse = isRecording
        }
        .accessibilityLabel(accessibilityLabelText)
        .accessibilityHint(accessibilityHintText)
    }

    // MARK: - Derived Phase

    private enum RecordingPhase {
        case idle
        case recording
        case transcribing
    }

    private var phase: RecordingPhase {
        if voiceService.isTranscribing {
            return .transcribing
        } else if voiceService.isRecording {
            return .recording
        } else {
            return .idle
        }
    }

    // MARK: - View Components

    @ViewBuilder
    private var micControl: some View {
        ZStack {
            if phase == .recording {
                Circle()
                    .stroke(AppColors.destructiveForeground.opacity(0.3), lineWidth: 2)
                    .frame(width: 36, height: 36)
                    .scaleEffect(recordingPulse ? 1.3 : 1.0)
                    .opacity(recordingPulse ? 0 : 1)
                    .animation(.easeOut(duration: 1.5).repeatForever(autoreverses: false), value: recordingPulse)
            }

            Circle()
                .fill(micControlBackgroundColor)
                .frame(width: 32, height: 32)

            micIcon
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(micIconColor)
        }
        .frame(width: 36, height: 36)
    }

    @ViewBuilder
    private var micIcon: some View {
        switch phase {
        case .idle:
            Image(systemName: "mic.fill")
        case .recording:
            RoundedRectangle(cornerRadius: 1.5)
                .fill(AppColors.destructiveForeground)
                .frame(width: 10, height: 10)
        case .transcribing:
            if #available(iOS 17.0, *) {
                Image(systemName: "waveform")
                    .symbolEffect(.pulse, options: .repeating, value: voiceService.isTranscribing)
            } else {
                Image(systemName: "waveform")
            }
        }
    }

    private var micControlBackgroundColor: Color {
        switch phase {
        case .idle:
            return AppColors.primary
        case .recording:
            return AppColors.destructive
        case .transcribing:
            return AppColors.primary
        }
    }

    private var micIconColor: Color {
        switch phase {
        case .idle:
            return AppColors.primaryForeground
        case .recording:
            return AppColors.destructiveForeground
        case .transcribing:
            return AppColors.primaryForeground
        }
    }

    private var primaryLabel: String {
        switch phase {
        case .idle:
            return "Tap to record"
        case .recording:
            return formatDuration(recordingDuration)
        case .transcribing:
            return "Transcribing…"
        }
    }

    private var primaryLabelColor: Color {
        switch phase {
        case .idle:
            return AppColors.foreground
        case .recording:
            return AppColors.destructiveForeground
        case .transcribing:
            return AppColors.primaryForeground
        }
    }

    private var secondaryLabel: String {
        switch phase {
        case .idle:
            return "Voice input"
        case .recording:
            return "Tap to stop"
        case .transcribing:
            return "Please wait"
        }
    }

    private var secondaryLabelColor: Color {
        switch phase {
        case .idle:
            return AppColors.mutedForeground
        case .recording:
            return AppColors.destructiveForeground.opacity(0.85)
        case .transcribing:
            return AppColors.primaryForeground.opacity(0.9)
        }
    }

    @ViewBuilder
    private var trailingContent: some View {
        switch phase {
        case .idle:
            EmptyView()
        case .recording:
            AnimatedWaveform(
                isAnimating: voiceService.isRecording,
                audioLevels: voiceService.audioLevels
            )
            .frame(width: 50, height: 16)
        case .transcribing:
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: AppColors.primaryForeground))
                .scaleEffect(0.7)
        }
    }

    private var containerBackground: some View {
        Group {
            switch phase {
            case .idle:
                LinearGradient(
                    colors: [AppColors.primary.opacity(0.08), AppColors.primary.opacity(0.04)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            case .recording:
                LinearGradient(
                    colors: [AppColors.destructive, AppColors.destructive.opacity(0.9)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            case .transcribing:
                LinearGradient(
                    colors: [AppColors.primary, AppColors.primary.opacity(0.9)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }

    private var shadowColor: Color {
        switch phase {
        case .idle:
            return AppColors.primary.opacity(0.12)
        case .recording:
            return AppColors.destructive.opacity(0.4)
        case .transcribing:
            return AppColors.primary.opacity(0.4)
        }
    }

    private var shadowRadius: CGFloat {
        phase == .idle ? 3 : 6
    }

    private var shadowY: CGFloat {
        phase == .idle ? 1 : 2
    }

    private var accessibilityLabelText: String {
        switch phase {
        case .idle:
            return "Voice recording button"
        case .recording:
            return "Recording in progress, duration \(formatDuration(recordingDuration))"
        case .transcribing:
            return "Transcribing audio"
        }
    }

    private var accessibilityHintText: String {
        switch phase {
        case .idle:
            return "Double tap to start recording"
        case .recording:
            return "Double tap to stop recording and transcribe"
        case .transcribing:
            return "Transcription in progress, please wait"
        }
    }

    // MARK: - Voice Recording Logic

    private func toggleRecording() {
        guard !voiceService.isTranscribing else { return }

        Task {
            do {
                if voiceService.isRecording {
                    await MainActor.run {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }

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

                            // Use captured cursor position (from when recording started) instead of current position
                            // This prevents the cursor from jumping to the end during recording
                            let insertionRange = capturedCursorPosition ?? selectedRange

                            let validRange: NSRange
                            if insertionRange.location == NSNotFound || insertionRange.location > nsString.length {
                                validRange = NSRange(location: nsString.length, length: 0)
                            } else if insertionRange.location + insertionRange.length > nsString.length {
                                validRange = NSRange(location: insertionRange.location, length: nsString.length - insertionRange.location)
                            } else {
                                validRange = insertionRange
                            }

                            let beforeCursor = nsString.substring(to: validRange.location)
                            let afterCursor = nsString.substring(from: validRange.location + validRange.length)

                            let prefix = beforeCursor.isEmpty ? "" : (beforeCursor.hasSuffix(" ") || beforeCursor.hasSuffix("\n") ? "" : " ")
                            let trimmedText = transcribedText.trimmingCharacters(in: .whitespacesAndNewlines)

                            text = beforeCursor + prefix + trimmedText + afterCursor

                            let newCursorPosition = (beforeCursor as NSString).length + (prefix as NSString).length + (trimmedText as NSString).length
                            selectedRange = NSRange(location: newCursorPosition, length: 0)

                            // Clear captured position after use
                            capturedCursorPosition = nil

                            onTranscriptionComplete()
                        }
                    }
                } else {
                    await MainActor.run {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    }

                    await MainActor.run {
                        capturedCursorPosition = selectedRange
                    }

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
                    capturedCursorPosition = nil // Clear on error
                    onError("Microphone permission denied")
                }
            } catch VoiceDictationError.recordingInProgress {
                await MainActor.run {
                    capturedCursorPosition = nil // Clear on error
                    onError("Recording already in progress")
                }
            } catch {
                await MainActor.run {
                    capturedCursorPosition = nil // Clear on error
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

// MARK: - Animated Waveform Component

private struct AnimatedWaveform: View {
    let isAnimating: Bool
    let audioLevels: [Float]

    @State private var phase: CGFloat = 0

    private let barWidth: CGFloat = 2
    private let barSpacing: CGFloat = 2.5
    private let minHeight: CGFloat = 3
    private let maxHeight: CGFloat = 14

    var body: some View {
        HStack(spacing: barSpacing) {
            ForEach(Array(audioLevels.enumerated()), id: \.offset) { index, level in
                RoundedRectangle(cornerRadius: barWidth / 2)
                    .fill(AppColors.destructiveForeground.opacity(barOpacity(for: index)))
                    .frame(width: barWidth)
                    .frame(height: barHeight(for: level))
                    .scaleEffect(x: 1.0, y: barScale(for: index))
                    .animation(.easeOut(duration: 0.08), value: level)
            }
        }
        .onAppear {
            if isAnimating {
                withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                    phase = 2 * .pi
                }
            }
        }
        .onChange(of: isAnimating) { animating in
            if animating {
                withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                    phase = 2 * .pi
                }
            } else {
                phase = 0
            }
        }
    }

    private func barHeight(for level: Float) -> CGFloat {
        guard isAnimating else { return minHeight }
        let normalizedLevel = CGFloat(level)
        return minHeight + (maxHeight - minHeight) * normalizedLevel
    }

    private func barOpacity(for index: Int) -> Double {
        let wave = sin(phase + Double(index) * 0.5)
        let normalizedWave = (wave + 1.0) / 2.0
        return 0.5 + 0.5 * normalizedWave
    }

    private func barScale(for index: Int) -> CGFloat {
        let wave = sin(phase + Double(index) * 0.5)
        let normalizedWave = (wave + 1.0) / 2.0
        return 0.85 + 0.15 * normalizedWave
    }
}

#Preview {
    @State var text = ""
    @State var selectedRange = NSRange(location: 0, length: 0)
    @State var language = "en-US"

    return VStack(spacing: 20) {
        Text("Voice Recording Button - Compact Design")
            .font(.headline)

        HStack(spacing: 12) {
            VoiceRecordingButton(
                text: $text,
                selectedRange: $selectedRange,
                selectedLanguage: $language
            )

            Button {
            } label: {
                Image(systemName: "sparkles")
            }
            .buttonStyle(UtilityButtonStyle())

            Button {
            } label: {
                Image(systemName: "wand.and.stars")
            }
            .buttonStyle(UtilityButtonStyle())
        }

        if !text.isEmpty {
            Text("Transcribed: \(text)")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding()
        }
    }
    .padding()
}
