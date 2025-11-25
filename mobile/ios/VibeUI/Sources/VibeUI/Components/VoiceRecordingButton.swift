import SwiftUI
import UIKit
import Core

// MARK: - Voice Recording Button

/// Premium voice recording button with beautiful animations and transcription functionality
/// Features: Multi-phase UI (idle, recording, transcribing), audio-reactive waveform,
/// shimmer effects, pulse animations, and smooth state transitions
public struct VoiceRecordingButton: View {
    // MARK: - Input Parameters
    @Binding var text: String
    @Binding var selectedRange: NSRange
    @Binding var selectedLanguage: String
    @Binding var externalStartRecording: Bool

    let transcriptionModel: String?
    let transcriptionPrompt: String?
    let transcriptionTemperature: Double?
    let onError: (String) -> Void
    let onTranscriptionComplete: () -> Void

    // MARK: - Observed Objects
    @ObservedObject var voiceService: VoiceDictationService

    // MARK: - Internal State
    @State private var recordingDuration: TimeInterval = 0
    @State private var timer: Timer?
    @State private var capturedCursorPosition: NSRange? = nil
    @State private var animationNamespace: Namespace.ID?

    // Animation states
    @State private var isPressed = false
    @State private var iconBounce: CGFloat = 1.0
    @State private var containerScale: CGFloat = 1.0
    @State private var glowIntensity: CGFloat = 0.0

    // MARK: - Environment
    @Environment(\.colorScheme) private var colorScheme
    @Namespace private var buttonNamespace

    // MARK: - Initializer
    public init(
        text: Binding<String>,
        selectedRange: Binding<NSRange>,
        selectedLanguage: Binding<String>,
        voiceService: VoiceDictationService = VoiceDictationService.shared,
        transcriptionModel: String? = nil,
        transcriptionPrompt: String? = nil,
        transcriptionTemperature: Double? = nil,
        externalStartRecording: Binding<Bool> = .constant(false),
        onError: @escaping (String) -> Void = { _ in },
        onTranscriptionComplete: @escaping () -> Void = {}
    ) {
        self._text = text
        self._selectedRange = selectedRange
        self._selectedLanguage = selectedLanguage
        self._externalStartRecording = externalStartRecording
        self.voiceService = voiceService
        self.transcriptionModel = transcriptionModel
        self.transcriptionPrompt = transcriptionPrompt
        self.transcriptionTemperature = transcriptionTemperature
        self.onError = onError
        self.onTranscriptionComplete = onTranscriptionComplete
    }

    // MARK: - Body
    public var body: some View {
        Button(action: toggleRecording) {
            HStack(spacing: 10) {
                micControlView
                    .matchedGeometryEffect(id: "micControl", in: buttonNamespace)

                if phase != .idle {
                    labelsAndTrailingView
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .leading)).animation(.spring(response: 0.4, dampingFraction: 0.8)),
                            removal: .opacity.combined(with: .scale(scale: 0.9)).animation(.easeOut(duration: 0.2))
                        ))
                }
            }
            .padding(.horizontal, phase == .idle ? Theme.Spacing.cardSpacing : Theme.Spacing.md)
            .padding(.vertical, phase == .idle ? Theme.Spacing.cardSpacing : Theme.Spacing.sm)
            .frame(height: 52)
            .background(containerBackgroundView)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(borderOverlay)
            .shadow(color: shadowColor, radius: shadowRadius, x: 0, y: shadowY)
            .scaleEffect(containerScale)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(voiceService.isTranscribing)
        .animation(.spring(response: 0.4, dampingFraction: 0.75), value: phase)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeInOut(duration: 0.1)) {
                        containerScale = 0.97
                    }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        containerScale = 1.0
                    }
                }
        )
        .onChange(of: externalStartRecording) { shouldStart in
            if shouldStart && phase == .idle {
                toggleRecording()
                DispatchQueue.main.async {
                    externalStartRecording = false
                }
            }
        }
        .onAppear {
            startIdleAnimations()
        }
        .accessibilityLabel(accessibilityLabelText)
        .accessibilityHint(accessibilityHintText)
    }

    // MARK: - Recording Phase

    private enum RecordingPhase: Equatable {
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

    // MARK: - Mic Control View

    @ViewBuilder
    private var micControlView: some View {
        ZStack {
            // Pulse rings for recording state
            if phase == .recording {
                PulseRingView(
                    color: AppColors.destructiveForeground.opacity(0.5),
                    ringCount: 3,
                    isAnimating: true
                )
                .frame(width: 40, height: 40)
            }

            // Glow effect for recording/transcribing
            if phase != .idle {
                Circle()
                    .fill(micControlBackgroundColor.opacity(0.3))
                    .frame(width: 44, height: 44)
                    .blur(radius: 8)
            }

            // Main circle background
            Circle()
                .fill(micControlBackgroundGradient)
                .frame(width: 36, height: 36)
                .shadow(
                    color: micControlBackgroundColor.opacity(phase == .idle ? 0.2 : 0.4),
                    radius: phase == .idle ? 4 : 8,
                    x: 0,
                    y: phase == .idle ? 2 : 4
                )

            // Icon
            micIconView
                .scaleEffect(iconBounce)
        }
        .frame(width: 44, height: 44)
        .breathing(isActive: phase == .idle, intensity: 0.02, duration: 2.5)
    }

    @ViewBuilder
    private var micIconView: some View {
        Group {
            switch phase {
            case .idle:
                Image(systemName: "mic.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(AppColors.primaryForeground)
                    .transition(.scale.combined(with: .opacity))

            case .recording:
                RoundedRectangle(cornerRadius: 3)
                    .fill(AppColors.destructiveForeground)
                    .frame(width: 12, height: 12)
                    .transition(.scale.combined(with: .opacity))

            case .transcribing:
                if #available(iOS 17.0, *) {
                    Image(systemName: "waveform")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .symbolEffect(.variableColor.iterative, options: .repeating, value: voiceService.isTranscribing)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    Image(systemName: "waveform")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: phase)
    }

    private var micControlBackgroundGradient: LinearGradient {
        switch phase {
        case .idle:
            return LinearGradient(
                colors: [
                    AppColors.primary,
                    AppColors.primary.opacity(0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .recording:
            return LinearGradient(
                colors: [
                    AppColors.destructive,
                    AppColors.destructive.opacity(0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .transcribing:
            return LinearGradient(
                colors: [
                    AppColors.primary,
                    AppColors.primary.opacity(0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var micControlBackgroundColor: Color {
        switch phase {
        case .idle: return AppColors.primary
        case .recording: return AppColors.destructive
        case .transcribing: return AppColors.primary
        }
    }

    // MARK: - Labels and Trailing Content

    @ViewBuilder
    private var labelsAndTrailingView: some View {
        VStack(alignment: .leading, spacing: 2) {
            primaryLabelView
            secondaryLabelView
        }

        Spacer(minLength: 8)

        trailingContentView
    }

    @ViewBuilder
    private var primaryLabelView: some View {
        Group {
            switch phase {
            case .idle:
                Text("Tap to record")
            case .recording:
                Text(formatDuration(recordingDuration))
                    .monospacedDigit()
            case .transcribing:
                HStack(spacing: 6) {
                    Text("Transcribing")
                    TypingDotsView(color: .white.opacity(0.8))
                }
            }
        }
        .font(.system(size: 15, weight: .semibold, design: .rounded))
        .foregroundColor(primaryLabelColor)
        .lineLimit(1)
        .shimmer(isActive: phase == .transcribing, color: .white.opacity(0.3), duration: 2.0)
    }

    @ViewBuilder
    private var secondaryLabelView: some View {
        Text(secondaryLabel)
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(secondaryLabelColor)
            .lineLimit(1)
    }

    // Note: For filled backgrounds (recording/transcribing), we need light text in both light and dark modes.
    // `destructiveForeground` is light in both modes, while `primaryForeground` is dark in dark mode.
    // Using white with high opacity ensures readable text on filled teal/red backgrounds.
    private var primaryLabelColor: Color {
        switch phase {
        case .idle: return AppColors.foreground
        case .recording: return AppColors.destructiveForeground
        case .transcribing: return .white
        }
    }

    private var secondaryLabel: String {
        switch phase {
        case .idle: return "Voice input"
        case .recording: return "Tap to stop"
        case .transcribing: return "Please wait"
        }
    }

    private var secondaryLabelColor: Color {
        switch phase {
        case .idle: return AppColors.mutedForeground
        case .recording: return AppColors.destructiveForeground.opacity(0.8)
        case .transcribing: return .white.opacity(0.85)
        }
    }

    // MARK: - Trailing Content

    @ViewBuilder
    private var trailingContentView: some View {
        switch phase {
        case .idle:
            EmptyView()

        case .recording:
            AudioReactiveWaveform(
                isAnimating: voiceService.isRecording,
                audioLevels: voiceService.audioLevels,
                primaryColor: AppColors.destructiveForeground,
                secondaryColor: AppColors.destructiveForeground.opacity(0.6),
                barCount: 10,
                isMirrored: true
            )
            .frame(width: 60, height: 22)

        case .transcribing:
            ZStack {
                // Animated circular progress
                Circle()
                    .stroke(Color.white.opacity(0.25), lineWidth: 2)
                    .frame(width: 22, height: 22)

                Circle()
                    .trim(from: 0, to: 0.7)
                    .stroke(
                        Color.white,
                        style: StrokeStyle(lineWidth: 2, lineCap: .round)
                    )
                    .frame(width: 22, height: 22)
                    .rotationEffect(.degrees(-90))
                    .modifier(SpinningModifier())
            }
        }
    }

    // MARK: - Container Background

    @ViewBuilder
    private var containerBackgroundView: some View {
        Group {
            switch phase {
            case .idle:
                idleBackgroundView

            case .recording:
                LinearGradient(
                    colors: [
                        AppColors.destructive,
                        AppColors.destructive.opacity(0.92)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

            case .transcribing:
                LinearGradient(
                    colors: [
                        AppColors.primary,
                        AppColors.primary.opacity(0.92)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }

    @ViewBuilder
    private var idleBackgroundView: some View {
        ZStack {
            // Base gradient
            LinearGradient(
                colors: [
                    AppColors.primary.opacity(colorScheme == .dark ? 0.12 : 0.08),
                    AppColors.primary.opacity(colorScheme == .dark ? 0.08 : 0.04)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Subtle shimmer overlay for premium feel
            LinearGradient(
                colors: [
                    Color.white.opacity(0),
                    Color.white.opacity(colorScheme == .dark ? 0.03 : 0.05),
                    Color.white.opacity(0)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    @ViewBuilder
    private var borderOverlay: some View {
        RoundedRectangle(cornerRadius: 26, style: .continuous)
            .stroke(borderColor, lineWidth: borderWidth)
    }

    private var borderColor: Color {
        switch phase {
        case .idle:
            return AppColors.primary.opacity(colorScheme == .dark ? 0.25 : 0.15)
        case .recording:
            return AppColors.destructiveForeground.opacity(0.3)
        case .transcribing:
            return Color.white.opacity(0.25)
        }
    }

    private var borderWidth: CGFloat {
        phase == .idle ? 1 : 1.5
    }

    // MARK: - Shadow Properties

    private var shadowColor: Color {
        switch phase {
        case .idle:
            return AppColors.primary.opacity(colorScheme == .dark ? 0.2 : 0.15)
        case .recording:
            return AppColors.destructive.opacity(0.45)
        case .transcribing:
            return AppColors.primary.opacity(0.45)
        }
    }

    private var shadowRadius: CGFloat {
        switch phase {
        case .idle: return colorScheme == .dark ? 6 : 4
        case .recording, .transcribing: return 10
        }
    }

    private var shadowY: CGFloat {
        switch phase {
        case .idle: return 2
        case .recording, .transcribing: return 4
        }
    }

    // MARK: - Accessibility

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

    // MARK: - Animations

    private func startIdleAnimations() {
        // Icon subtle bounce on appear
        withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.2)) {
            iconBounce = 1.05
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                iconBounce = 1.0
            }
        }
    }

    private func triggerIconBounce() {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
            iconBounce = 0.85
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                iconBounce = 1.0
            }
        }
    }

    // MARK: - Voice Recording Logic

    private func toggleRecording() {
        guard !voiceService.isTranscribing else { return }

        triggerIconBounce()

        Task {
            do {
                if voiceService.isRecording {
                    // Stop recording
                    await MainActor.run {
                        // Enhanced haptic feedback for stopping
                        let generator = UIImpactFeedbackGenerator(style: .medium)
                        generator.impactOccurred()
                    }

                    voiceService.stopRecording()
                    timer?.invalidate()
                    timer = nil
                    recordingDuration = 0

                    try? await Task.sleep(nanoseconds: 100_000_000)

                    let languageCode = String(selectedLanguage.prefix(2))

                    for try await transcribedText in voiceService.transcribe(
                        model: transcriptionModel,
                        language: languageCode,
                        prompt: transcriptionPrompt,
                        temperature: transcriptionTemperature
                    ) {
                        await MainActor.run {
                            insertTranscribedText(transcribedText)

                            // Success haptic
                            let generator = UINotificationFeedbackGenerator()
                            generator.notificationOccurred(.success)

                            onTranscriptionComplete()
                        }
                    }
                } else {
                    // Start recording
                    await MainActor.run {
                        // Enhanced haptic feedback for starting
                        let generator = UIImpactFeedbackGenerator(style: .heavy)
                        generator.impactOccurred()

                        capturedCursorPosition = selectedRange
                    }

                    try await voiceService.startRecording()

                    await MainActor.run {
                        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [self] _ in
                            recordingDuration += 0.1

                            // Milestone haptic feedback
                            if recordingDuration.truncatingRemainder(dividingBy: 30.0) < 0.15 && recordingDuration > 1 {
                                let generator = UIImpactFeedbackGenerator(style: .light)
                                generator.impactOccurred()
                            }
                        }
                    }
                }
            } catch VoiceDictationError.permissionDenied {
                await handleError("Microphone permission denied")
            } catch VoiceDictationError.recordingInProgress {
                await handleError("Recording already in progress")
            } catch {
                await handleError("Voice dictation error: \(error.localizedDescription)")
            }
        }
    }

    private func insertTranscribedText(_ transcribedText: String) {
        let nsString = text as NSString
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

        capturedCursorPosition = nil
    }

    private func handleError(_ message: String) async {
        await MainActor.run {
            capturedCursorPosition = nil

            // Error haptic
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)

            onError(message)
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Spinning Modifier

private struct SpinningModifier: ViewModifier {
    @State private var rotation: Double = 0

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(rotation))
            .onAppear {
                withAnimation(
                    .linear(duration: 1.0)
                    .repeatForever(autoreverses: false)
                ) {
                    rotation = 360
                }
            }
    }
}

// MARK: - Preview

#Preview("Voice Recording Button States") {
    VStack(spacing: 24) {
        Text("Voice Recording Button")
            .font(.headline)
            .foregroundColor(AppColors.foreground)

        // Idle state preview
        VStack(spacing: 8) {
            Text("Idle State")
                .font(.caption)
                .foregroundColor(AppColors.mutedForeground)

            PreviewVoiceButton(simulatedPhase: .idle)
        }

        // Recording state preview
        VStack(spacing: 8) {
            Text("Recording State")
                .font(.caption)
                .foregroundColor(AppColors.mutedForeground)

            PreviewVoiceButton(simulatedPhase: .recording)
        }

        // Transcribing state preview
        VStack(spacing: 8) {
            Text("Transcribing State")
                .font(.caption)
                .foregroundColor(AppColors.mutedForeground)

            PreviewVoiceButton(simulatedPhase: .transcribing)
        }
    }
    .padding(24)
    .background(AppColors.background)
}

// Preview helper
private struct PreviewVoiceButton: View {
    let simulatedPhase: SimulatedPhase

    enum SimulatedPhase {
        case idle, recording, transcribing
    }

    var body: some View {
        HStack(spacing: 10) {
            micControl
            if simulatedPhase != .idle {
                labels
                Spacer(minLength: 8)
                trailing
            }
        }
        .padding(.horizontal, simulatedPhase == .idle ? Theme.Spacing.cardSpacing : Theme.Spacing.md)
        .padding(.vertical, simulatedPhase == .idle ? Theme.Spacing.cardSpacing : Theme.Spacing.sm)
        .frame(height: 52)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(borderColor, lineWidth: simulatedPhase == .idle ? 1 : 1.5)
        )
        .shadow(color: shadowColor, radius: shadowRadius, x: 0, y: 2)
    }

    @ViewBuilder
    private var micControl: some View {
        ZStack {
            if simulatedPhase == .recording {
                PulseRingView(
                    color: AppColors.destructiveForeground.opacity(0.5),
                    ringCount: 3,
                    isAnimating: true
                )
                .frame(width: 40, height: 40)
            }

            Circle()
                .fill(micBackground)
                .frame(width: 36, height: 36)

            micIcon
        }
        .frame(width: 44, height: 44)
    }

    @ViewBuilder
    private var micIcon: some View {
        switch simulatedPhase {
        case .idle:
            Image(systemName: "mic.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppColors.primaryForeground)
        case .recording:
            RoundedRectangle(cornerRadius: 3)
                .fill(AppColors.destructiveForeground)
                .frame(width: 12, height: 12)
        case .transcribing:
            Image(systemName: "waveform")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
        }
    }

    private var micBackground: LinearGradient {
        let color = simulatedPhase == .recording ? AppColors.destructive : AppColors.primary
        return LinearGradient(
            colors: [color, color.opacity(0.85)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    @ViewBuilder
    private var labels: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(simulatedPhase == .recording ? "0:05" : "Transcribing...")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(simulatedPhase == .recording ? AppColors.destructiveForeground : .white)

            Text(simulatedPhase == .recording ? "Tap to stop" : "Please wait")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(simulatedPhase == .recording ? AppColors.destructiveForeground.opacity(0.8) : .white.opacity(0.85))
        }
    }

    @ViewBuilder
    private var trailing: some View {
        if simulatedPhase == .recording {
            AudioReactiveWaveform(
                isAnimating: true,
                audioLevels: [0.3, 0.6, 0.8, 0.5, 0.9],
                primaryColor: AppColors.destructiveForeground,
                secondaryColor: AppColors.destructiveForeground.opacity(0.6)
            )
            .frame(width: 60, height: 22)
        } else {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                .scaleEffect(0.8)
        }
    }

    @ViewBuilder
    private var background: some View {
        switch simulatedPhase {
        case .idle:
            LinearGradient(
                colors: [AppColors.primary.opacity(0.1), AppColors.primary.opacity(0.05)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .recording:
            LinearGradient(
                colors: [AppColors.destructive, AppColors.destructive.opacity(0.92)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .transcribing:
            LinearGradient(
                colors: [AppColors.primary, AppColors.primary.opacity(0.92)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var borderColor: Color {
        switch simulatedPhase {
        case .idle: return AppColors.primary.opacity(0.2)
        case .recording: return AppColors.destructiveForeground.opacity(0.3)
        case .transcribing: return Color.white.opacity(0.25)
        }
    }

    private var shadowColor: Color {
        switch simulatedPhase {
        case .idle: return AppColors.primary.opacity(0.15)
        case .recording: return AppColors.destructive.opacity(0.45)
        case .transcribing: return AppColors.primary.opacity(0.45)
        }
    }

    private var shadowRadius: CGFloat {
        simulatedPhase == .idle ? 4 : 10
    }
}
