import SwiftUI
import Core

// MARK: - Primary Button Style

/// Primary button style matching desktop "default" variant
/// Maps to CSS: bg-primary text-primary-foreground hover:bg-primary/85
public struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(AppColors.primaryForeground)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                backgroundView(isPressed: configuration.isPressed)
            )
            .cornerRadius(AppColors.radius)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }

    @ViewBuilder
    private func backgroundView(isPressed: Bool) -> some View {
        if isPressed {
            AppColors.primary.opacity(0.85)
        } else {
            AppColors.primary
        }
    }
}

// MARK: - Secondary Button Style

/// Secondary button style matching desktop "secondary" variant
/// Maps to CSS: bg-secondary/80 text-secondary-foreground hover:bg-secondary/60 border border-border/50
public struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.9)
                    : AppColors.secondaryForeground
            )
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                backgroundView(isPressed: configuration.isPressed)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppColors.radius)
                    .stroke(
                        configuration.isPressed
                            ? AppColors.primary.opacity(colorScheme == .dark ? 0.5 : 0.3)
                            : AppColors.primary.opacity(colorScheme == .dark ? 0.3 : 0.15),
                        lineWidth: 1
                    )
            )
            .cornerRadius(AppColors.radius)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.05 : 0.12),
                radius: colorScheme == .light ? 2 : 3,
                x: 0,
                y: 1
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }

    @ViewBuilder
    private func backgroundView(isPressed: Bool) -> some View {
        if isPressed {
            AppColors.secondary.opacity(0.6)
        } else {
            AppColors.secondary.opacity(0.8)
        }
    }
}

// MARK: - Outline Button Style

/// Outline button style matching desktop "outline" variant
/// Maps to CSS: border border-border bg-background/80 text-foreground hover:bg-accent/60 hover:text-accent-foreground
public struct OutlineButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.9)
                    : AppColors.foreground
            )
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                backgroundView(isPressed: configuration.isPressed)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppColors.radius)
                    .stroke(
                        configuration.isPressed
                            ? AppColors.primary.opacity(colorScheme == .dark ? 0.6 : 0.4)
                            : AppColors.primary.opacity(colorScheme == .dark ? 0.35 : 0.2),
                        lineWidth: 1
                    )
            )
            .cornerRadius(AppColors.radius)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.06 : 0.14),
                radius: colorScheme == .light ? 2 : 3,
                x: 0,
                y: 1
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }

    @ViewBuilder
    private func backgroundView(isPressed: Bool) -> some View {
        if isPressed {
            AppColors.primary.opacity(0.08)
        } else {
            AppColors.background.opacity(0.8)
        }
    }
}

// MARK: - Ghost Button Style

/// Ghost button style matching desktop "ghost" variant
/// Maps to CSS: text-foreground hover:bg-accent/40 hover:text-accent-foreground
public struct GhostButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(
                configuration.isPressed ? AppColors.accentForeground : AppColors.foreground
            )
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                configuration.isPressed ? AppColors.accent.opacity(0.4) : Color.clear
            )
            .cornerRadius(AppColors.radius)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Destructive Button Style

/// Destructive button style for delete/danger actions
/// Maps to CSS: bg-destructive text-destructive-foreground hover:bg-destructive/85
public struct DestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(AppColors.destructiveForeground)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                configuration.isPressed
                    ? AppColors.destructive.opacity(0.85)
                    : AppColors.destructive
            )
            .cornerRadius(AppColors.radius)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Warning Button Style

/// Warning button style for warning actions
/// Maps to CSS: bg-warning text-warning-foreground hover:bg-warning/85
public struct WarningButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(AppColors.warningForeground)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                configuration.isPressed
                    ? AppColors.warning.opacity(0.85)
                    : AppColors.warning
            )
            .cornerRadius(AppColors.radius)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Success Button Style

/// Success button style for success/confirm actions
public struct SuccessButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(AppColors.successForeground)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                configuration.isPressed
                    ? AppColors.success.opacity(0.85)
                    : AppColors.success
            )
            .cornerRadius(AppColors.radius)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Link Button Style

/// Link button style for text-only link actions
/// Maps to CSS: text-primary underline-offset-4 hover:underline hover:text-primary/80
public struct LinkButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.8)
                    : AppColors.primary
            )
            .underline(configuration.isPressed)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Compact Button Styles (for smaller contexts)

/// Compact primary button for space-constrained UIs
public struct CompactPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(AppColors.primaryForeground)
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .background(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.85)
                    : AppColors.primary
            )
            .cornerRadius(AppColors.radiusSm)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

/// Compact secondary button for space-constrained UIs
public struct CompactSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.9)
                    : AppColors.secondaryForeground
            )
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.sm)
            .background(
                configuration.isPressed
                    ? AppColors.secondary.opacity(0.6)
                    : AppColors.secondary.opacity(0.8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppColors.radiusSm)
                    .stroke(
                        configuration.isPressed
                            ? AppColors.primary.opacity(colorScheme == .dark ? 0.5 : 0.3)
                            : AppColors.primary.opacity(colorScheme == .dark ? 0.3 : 0.15),
                        lineWidth: 1
                    )
            )
            .cornerRadius(AppColors.radiusSm)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.04 : 0.1),
                radius: colorScheme == .light ? 1 : 2,
                x: 0,
                y: 0.5
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Icon Button Styles

/// Icon-only button style for toolbar and utility actions
public struct IconButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    private let size: CGFloat

    public init(size: CGFloat = 32) {
        self.size = size
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size * 0.5))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.8)
                    : AppColors.primary
            )
            .frame(width: size, height: size)
            .background(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.12)
                    : AppColors.primary.opacity(0.05)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppColors.radiusSm)
                    .stroke(
                        AppColors.primary.opacity(colorScheme == .dark ? 0.25 : 0.12),
                        lineWidth: 1
                    )
            )
            .cornerRadius(AppColors.radiusSm)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.1 : 0.18),
                radius: colorScheme == .light ? 2 : 3,
                x: 0,
                y: 1
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

/// Compact icon button for toolbars and compact UIs
public struct CompactIconButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.8)
                    : AppColors.primary
            )
            .frame(width: 24, height: 24)
            .background(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.12)
                    : AppColors.primary.opacity(0.05)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(
                        AppColors.primary.opacity(colorScheme == .dark ? 0.25 : 0.12),
                        lineWidth: 0.5
                    )
            )
            .cornerRadius(4)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.08 : 0.15),
                radius: colorScheme == .light ? 1 : 2,
                x: 0,
                y: 0.5
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Recording Button Style

/// Recording button style with state-based appearance
public struct RecordingButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    let isRecording: Bool

    public init(isRecording: Bool) {
        self.isRecording = isRecording
    }

    public func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed

        return configuration.label
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.sm)
            .background(backgroundColor(pressed: pressed))
            .overlay(
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .stroke(borderColor(pressed: pressed), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 999, style: .continuous))
            .scaleEffect(pressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.12), value: pressed)
    }

    private func backgroundColor(pressed: Bool) -> Color {
        if isRecording {
            return AppColors.destructive.opacity(pressed ? 0.18 : 0.14)
        } else {
            return AppColors.muted.opacity(pressed ? 0.16 : 0.12)
        }
    }

    private func borderColor(pressed: Bool) -> Color {
        if isRecording {
            return AppColors.destructiveForeground.opacity(pressed ? 0.9 : 0.7)
        } else {
            return AppColors.border.opacity(pressed ? 0.9 : 0.6)
        }
    }
}

// MARK: - Floating Action Button Style

/// Floating action button with shadow and circular design
public struct FloatingActionButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    private let color: Color

    public init(color: Color = AppColors.primary) {
        self.color = color
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18))
            .foregroundColor(.white)
            .frame(width: 36, height: 36)
            .background(
                Circle()
                    .fill(configuration.isPressed ? color.opacity(0.85) : color)
            )
            .shadow(color: color.opacity(0.3), radius: 4, x: 0, y: 2)
            .opacity(isEnabled ? 1.0 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Toolbar Button Styles

/// Toolbar button style for navigation bar buttons (minimal, iOS-native feel)
public struct ToolbarButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.8)
                    : AppColors.primary
            )
            .frame(minHeight: 44)
            .padding(.horizontal, Theme.Spacing.md)
            .background(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.12)
                    : AppColors.primary.opacity(0.05)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppColors.radiusSm)
                    .stroke(
                        configuration.isPressed
                            ? AppColors.primary.opacity(colorScheme == .dark ? 0.45 : 0.25)
                            : AppColors.primary.opacity(colorScheme == .dark ? 0.3 : 0.15),
                        lineWidth: 1
                    )
            )
            .cornerRadius(AppColors.radiusSm)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.08 : 0.15),
                radius: colorScheme == .light ? 2 : 3,
                x: 0,
                y: 1
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Compact toolbar button for destructive actions
public struct CompactDestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(AppColors.destructiveForeground)
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, Theme.Spacing.xs)
            .background(
                configuration.isPressed
                    ? AppColors.destructive.opacity(0.85)
                    : AppColors.destructive
            )
            .cornerRadius(AppColors.radiusSm)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

/// Compact toolbar button for success actions
public struct CompactSuccessButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(AppColors.successForeground)
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, Theme.Spacing.xs)
            .background(
                configuration.isPressed
                    ? AppColors.success.opacity(0.85)
                    : AppColors.success.opacity(0.8)
            )
            .cornerRadius(AppColors.radiusSm)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Utility Button Style

/// Utility button for secondary actions like language picker
public struct UtilityButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.8)
                    : AppColors.primary
            )
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.cardSpacing)
            .background(
                configuration.isPressed
                    ? AppColors.primary.opacity(0.08)
                    : AppColors.primary.opacity(0.04)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppColors.radiusSm)
                    .stroke(
                        configuration.isPressed
                            ? AppColors.primary.opacity(colorScheme == .dark ? 0.5 : 0.3)
                            : AppColors.primary.opacity(colorScheme == .dark ? 0.3 : 0.15),
                        lineWidth: 1
                    )
            )
            .cornerRadius(AppColors.radiusSm)
            .shadow(
                color: AppColors.primary.opacity(colorScheme == .light ? 0.12 : 0.2),
                radius: colorScheme == .light ? 3 : 4,
                x: 0,
                y: 1
            )
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Social Login Button Style

/// Social login button with provider-specific styling
public struct SocialLoginButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public enum Provider {
        case google
        case github
        case microsoft
        case apple

        var backgroundColor: Color {
            switch self {
            case .google: return Color(red: 0.26, green: 0.52, blue: 0.96)
            case .github: return Color(red: 0.13, green: 0.13, blue: 0.13)
            case .microsoft: return Color(red: 0.0, green: 0.47, blue: 0.84)
            case .apple: return Color.black
            }
        }

        var foregroundColor: Color {
            return .white
        }
    }

    private let provider: Provider

    public init(provider: Provider) {
        self.provider = provider
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(provider.foregroundColor)
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.vertical, Theme.Spacing.md)
            .frame(minHeight: 44)
            .background(
                configuration.isPressed
                    ? provider.backgroundColor.opacity(0.85)
                    : provider.backgroundColor
            )
            .cornerRadius(AppColors.radius)
            .opacity(isEnabled ? 1.0 : 0.5)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Preview

#if DEBUG
struct ButtonStyles_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                Text("Standard Buttons").font(.headline)

                Button("Primary Button") {}
                    .buttonStyle(PrimaryButtonStyle())

                Button("Secondary Button") {}
                    .buttonStyle(SecondaryButtonStyle())

                Button("Outline Button") {}
                    .buttonStyle(OutlineButtonStyle())

                Button("Ghost Button") {}
                    .buttonStyle(GhostButtonStyle())

                Button("Destructive Button") {}
                    .buttonStyle(DestructiveButtonStyle())

                Button("Warning Button") {}
                    .buttonStyle(WarningButtonStyle())

                Button("Success Button") {}
                    .buttonStyle(SuccessButtonStyle())

                Button("Link Button") {}
                    .buttonStyle(LinkButtonStyle())

                Divider()
                Text("Compact Buttons").font(.headline)

                HStack(spacing: Theme.Spacing.md) {
                    Button("Compact Primary") {}
                        .buttonStyle(CompactPrimaryButtonStyle())

                    Button("Compact Secondary") {}
                        .buttonStyle(CompactSecondaryButtonStyle())
                }

                HStack(spacing: Theme.Spacing.md) {
                    Button("Compact Destructive") {}
                        .buttonStyle(CompactDestructiveButtonStyle())

                    Button("Compact Success") {}
                        .buttonStyle(CompactSuccessButtonStyle())
                }

                Divider()
                Text("Icon Buttons").font(.headline)

                HStack(spacing: Theme.Spacing.md) {
                    Button(action: {}) {
                        Image(systemName: "heart.fill")
                    }
                    .buttonStyle(IconButtonStyle())

                    Button(action: {}) {
                        Image(systemName: "star.fill")
                    }
                    .buttonStyle(CompactIconButtonStyle())
                }

                Divider()
                Text("Special Buttons").font(.headline)

                Button(action: {}) {
                    HStack {
                        Image(systemName: "mic.fill")
                        Text("Recording")
                    }
                }
                .buttonStyle(RecordingButtonStyle(isRecording: true))

                Button(action: {}) {
                    Image(systemName: "sparkles")
                }
                .buttonStyle(FloatingActionButtonStyle())

                Button("Toolbar Action") {}
                    .buttonStyle(ToolbarButtonStyle())

                Button("Utility") {}
                    .buttonStyle(UtilityButtonStyle())

                Button("Disabled Button") {}
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(true)
            }
            .padding()
        }
        .previewLayout(.sizeThatFits)
    }
}
#endif
