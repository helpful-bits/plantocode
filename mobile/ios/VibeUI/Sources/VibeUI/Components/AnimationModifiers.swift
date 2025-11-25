import SwiftUI
import Core

// MARK: - Shimmer Effect Modifier

/// A modifier that adds a shimmer/loading effect across a view
public struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = -1.0
    let isActive: Bool
    let color: Color
    let duration: Double

    public init(isActive: Bool = true, color: Color = .white, duration: Double = 1.5) {
        self.isActive = isActive
        self.color = color
        self.duration = duration
    }

    public func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geometry in
                    if isActive {
                        LinearGradient(
                            stops: [
                                .init(color: color.opacity(0), location: 0),
                                .init(color: color.opacity(0.3), location: 0.3),
                                .init(color: color.opacity(0.5), location: 0.5),
                                .init(color: color.opacity(0.3), location: 0.7),
                                .init(color: color.opacity(0), location: 1)
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geometry.size.width * 0.6)
                        .offset(x: phase * (geometry.size.width * 1.6) - geometry.size.width * 0.3)
                        .blendMode(.overlay)
                    }
                }
            )
            .mask(content)
            .onAppear {
                guard isActive else { return }
                withAnimation(
                    .linear(duration: duration)
                    .repeatForever(autoreverses: false)
                ) {
                    phase = 1.0
                }
            }
            .onChange(of: isActive) { active in
                if active {
                    phase = -1.0
                    withAnimation(
                        .linear(duration: duration)
                        .repeatForever(autoreverses: false)
                    ) {
                        phase = 1.0
                    }
                }
            }
    }
}

// MARK: - Glow Effect Modifier

/// A modifier that adds a configurable glow effect around a view
public struct GlowModifier: ViewModifier {
    let color: Color
    let radius: CGFloat
    let isAnimated: Bool
    @State private var glowIntensity: CGFloat = 0.6

    public init(color: Color, radius: CGFloat = 10, isAnimated: Bool = false) {
        self.color = color
        self.radius = radius
        self.isAnimated = isAnimated
    }

    public func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(glowIntensity * 0.8), radius: radius * 0.5, x: 0, y: 0)
            .shadow(color: color.opacity(glowIntensity * 0.5), radius: radius, x: 0, y: 0)
            .shadow(color: color.opacity(glowIntensity * 0.3), radius: radius * 1.5, x: 0, y: 0)
            .onAppear {
                guard isAnimated else { return }
                withAnimation(
                    .easeInOut(duration: 1.2)
                    .repeatForever(autoreverses: true)
                ) {
                    glowIntensity = 1.0
                }
            }
    }
}

// MARK: - Pulse Ring View

/// Animated concentric rings that pulse outward
public struct PulseRingView: View {
    let color: Color
    let ringCount: Int
    let isAnimating: Bool

    @State private var scales: [CGFloat]
    @State private var opacities: [Double]

    public init(color: Color, ringCount: Int = 3, isAnimating: Bool = true) {
        self.color = color
        self.ringCount = ringCount
        self.isAnimating = isAnimating
        self._scales = State(initialValue: Array(repeating: 1.0, count: ringCount))
        self._opacities = State(initialValue: Array(repeating: 0.6, count: ringCount))
    }

    public var body: some View {
        ZStack {
            ForEach(0..<ringCount, id: \.self) { index in
                Circle()
                    .stroke(color, lineWidth: 2)
                    .scaleEffect(scales[index])
                    .opacity(opacities[index])
            }
        }
        .onAppear {
            guard isAnimating else { return }
            startAnimation()
        }
        .onChange(of: isAnimating) { animating in
            if animating {
                startAnimation()
            } else {
                resetAnimation()
            }
        }
    }

    private func startAnimation() {
        for index in 0..<ringCount {
            let delay = Double(index) * 0.4

            withAnimation(
                .easeOut(duration: 1.8)
                .repeatForever(autoreverses: false)
                .delay(delay)
            ) {
                scales[index] = 2.0
                opacities[index] = 0
            }
        }
    }

    private func resetAnimation() {
        scales = Array(repeating: 1.0, count: ringCount)
        opacities = Array(repeating: 0.6, count: ringCount)
    }
}

// MARK: - Breathing Animation Modifier

/// Subtle scale animation that makes elements appear to "breathe"
public struct BreathingModifier: ViewModifier {
    @State private var scale: CGFloat = 1.0
    let isActive: Bool
    let intensity: CGFloat
    let duration: Double

    public init(isActive: Bool = true, intensity: CGFloat = 0.03, duration: Double = 2.0) {
        self.isActive = isActive
        self.intensity = intensity
        self.duration = duration
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .onAppear {
                guard isActive else { return }
                withAnimation(
                    .easeInOut(duration: duration)
                    .repeatForever(autoreverses: true)
                ) {
                    scale = 1.0 + intensity
                }
            }
            .onChange(of: isActive) { active in
                if active {
                    withAnimation(
                        .easeInOut(duration: duration)
                        .repeatForever(autoreverses: true)
                    ) {
                        scale = 1.0 + intensity
                    }
                } else {
                    withAnimation(.easeOut(duration: 0.3)) {
                        scale = 1.0
                    }
                }
            }
    }
}

// MARK: - Typing Dots Animation

/// Animated typing indicator dots
public struct TypingDotsView: View {
    let color: Color
    @State private var dotScales: [CGFloat] = [1.0, 1.0, 1.0]

    public init(color: Color = AppColors.primaryForeground) {
        self.color = color
    }

    public var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(color)
                    .frame(width: 6, height: 6)
                    .scaleEffect(dotScales[index])
            }
        }
        .onAppear {
            animateDots()
        }
    }

    private func animateDots() {
        for index in 0..<3 {
            let delay = Double(index) * 0.2

            withAnimation(
                .easeInOut(duration: 0.5)
                .repeatForever(autoreverses: true)
                .delay(delay)
            ) {
                dotScales[index] = 0.5
            }
        }
    }
}

// MARK: - Audio Reactive Waveform

/// Enhanced waveform visualization with gradient and smooth animations
public struct AudioReactiveWaveform: View {
    let isAnimating: Bool
    let audioLevels: [Float]
    let primaryColor: Color
    let secondaryColor: Color
    let barCount: Int
    let isMirrored: Bool

    private let barWidth: CGFloat = 3
    private let barSpacing: CGFloat = 2
    private let minHeight: CGFloat = 4
    private let maxHeight: CGFloat = 20

    @State private var displayLevels: [CGFloat]
    @State private var glowPhase: CGFloat = 0

    public init(
        isAnimating: Bool,
        audioLevels: [Float],
        primaryColor: Color = AppColors.destructiveForeground,
        secondaryColor: Color = AppColors.destructive,
        barCount: Int = 12,
        isMirrored: Bool = true
    ) {
        self.isAnimating = isAnimating
        self.audioLevels = audioLevels
        self.primaryColor = primaryColor
        self.secondaryColor = secondaryColor
        self.barCount = barCount
        self.isMirrored = isMirrored

        let halfCount = isMirrored ? barCount / 2 : barCount
        self._displayLevels = State(initialValue: Array(repeating: 0.3, count: halfCount))
    }

    public var body: some View {
        HStack(spacing: barSpacing) {
            if isMirrored {
                // Left side (mirrored)
                ForEach((0..<displayLevels.count).reversed(), id: \.self) { index in
                    waveformBar(at: index)
                }
            }

            // Right side (or full if not mirrored)
            ForEach(0..<displayLevels.count, id: \.self) { index in
                waveformBar(at: index)
            }
        }
        .onChange(of: audioLevels) { newLevels in
            updateDisplayLevels(from: newLevels)
        }
        .onAppear {
            if isAnimating {
                startGlowAnimation()
            }
        }
    }

    @ViewBuilder
    private func waveformBar(at index: Int) -> some View {
        let height = barHeight(for: displayLevels[index])
        let glowOffset = sin(glowPhase + CGFloat(index) * 0.5)
        let glowOpacity = 0.3 + 0.3 * ((glowOffset + 1) / 2)

        RoundedRectangle(cornerRadius: barWidth / 2)
            .fill(
                LinearGradient(
                    colors: [primaryColor, secondaryColor.opacity(0.8)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: barWidth, height: height)
            .shadow(color: primaryColor.opacity(glowOpacity), radius: 2, x: 0, y: 0)
            .animation(.spring(response: 0.15, dampingFraction: 0.7), value: displayLevels[index])
    }

    private func barHeight(for level: CGFloat) -> CGFloat {
        guard isAnimating else { return minHeight }
        return minHeight + (maxHeight - minHeight) * level
    }

    private func updateDisplayLevels(from audioLevels: [Float]) {
        guard isAnimating else { return }

        let targetCount = displayLevels.count
        var newLevels: [CGFloat] = []

        for i in 0..<targetCount {
            let audioIndex = min(i, audioLevels.count - 1)
            if audioIndex >= 0 && audioIndex < audioLevels.count {
                // Apply smoothing and boost
                let raw = CGFloat(audioLevels[audioIndex])
                let boosted = min(1.0, raw * 1.3)
                newLevels.append(boosted)
            } else {
                newLevels.append(0.2)
            }
        }

        withAnimation(.spring(response: 0.1, dampingFraction: 0.8)) {
            displayLevels = newLevels
        }
    }

    private func startGlowAnimation() {
        withAnimation(
            .linear(duration: 2.0)
            .repeatForever(autoreverses: false)
        ) {
            glowPhase = 2 * .pi
        }
    }
}

// MARK: - Icon Morph Animation

/// Animated transition between mic and stop icons
public struct MorphingMicIcon: View {
    let isRecording: Bool
    let color: Color
    let size: CGFloat

    @State private var iconScale: CGFloat = 1.0
    @State private var rotation: Double = 0

    public init(isRecording: Bool, color: Color, size: CGFloat = 16) {
        self.isRecording = isRecording
        self.color = color
        self.size = size
    }

    public var body: some View {
        ZStack {
            if isRecording {
                // Stop icon (rounded square)
                RoundedRectangle(cornerRadius: 2)
                    .fill(color)
                    .frame(width: size * 0.6, height: size * 0.6)
                    .scaleEffect(iconScale)
                    .transition(.scale.combined(with: .opacity))
            } else {
                // Mic icon
                Image(systemName: "mic.fill")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundColor(color)
                    .scaleEffect(iconScale)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isRecording)
        .onChange(of: isRecording) { _ in
            // Bounce animation on change
            withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
                iconScale = 0.8
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    iconScale = 1.0
                }
            }
        }
    }
}

// MARK: - View Extensions

public extension View {
    /// Adds a shimmer effect to the view
    func shimmer(isActive: Bool = true, color: Color = .white, duration: Double = 1.5) -> some View {
        modifier(ShimmerModifier(isActive: isActive, color: color, duration: duration))
    }

    /// Adds a glow effect around the view
    func glow(color: Color, radius: CGFloat = 10, isAnimated: Bool = false) -> some View {
        modifier(GlowModifier(color: color, radius: radius, isAnimated: isAnimated))
    }

    /// Adds a subtle breathing animation
    func breathing(isActive: Bool = true, intensity: CGFloat = 0.03, duration: Double = 2.0) -> some View {
        modifier(BreathingModifier(isActive: isActive, intensity: intensity, duration: duration))
    }
}

// MARK: - Preview

#if DEBUG
struct AnimationModifiers_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 30) {
            // Shimmer preview
            Text("Shimmer Effect")
                .font(.title2)
                .padding()
                .background(AppColors.primary)
                .foregroundColor(.white)
                .cornerRadius(8)
                .shimmer(isActive: true)

            // Glow preview
            Circle()
                .fill(AppColors.destructive)
                .frame(width: 50, height: 50)
                .glow(color: AppColors.destructive, radius: 15, isAnimated: true)

            // Pulse rings preview
            ZStack {
                PulseRingView(color: AppColors.primary, ringCount: 3, isAnimating: true)
                    .frame(width: 60, height: 60)

                Circle()
                    .fill(AppColors.primary)
                    .frame(width: 30, height: 30)
            }

            // Breathing preview
            RoundedRectangle(cornerRadius: 12)
                .fill(AppColors.primary)
                .frame(width: 100, height: 50)
                .breathing(isActive: true)

            // Typing dots preview
            TypingDotsView(color: AppColors.primary)

            // Waveform preview
            AudioReactiveWaveform(
                isAnimating: true,
                audioLevels: [0.3, 0.5, 0.8, 0.6, 0.9, 0.4],
                primaryColor: AppColors.destructiveForeground,
                secondaryColor: AppColors.destructive
            )
            .frame(height: 30)

            // Morphing icon preview
            HStack(spacing: 30) {
                MorphingMicIcon(isRecording: false, color: AppColors.primaryForeground)
                MorphingMicIcon(isRecording: true, color: AppColors.destructiveForeground)
            }
        }
        .padding()
        .background(AppColors.background)
    }
}
#endif
