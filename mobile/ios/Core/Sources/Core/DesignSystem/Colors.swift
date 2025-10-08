import SwiftUI

/// Strongly-typed design system mapping OKLCH colors from desktop globals.css to iOS
/// This ensures visual consistency across web (desktop) and mobile platforms
public struct AppColors {
    // MARK: - Base Colors

    /// Background color - CSS: oklch(1 0 0) light / oklch(0.18 0.02 206) dark
    /// Light: pure white, Dark: navy oklch(0.18 0.02 206)
    public static let background = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.025, green: 0.079, blue: 0.086, alpha: 1.0)
            : UIColor(white: 1.0, alpha: 1.0)
    })

    /// Foreground color - CSS: oklch(0.15 0 0)
    /// Primary text color with dark mode support
    public static let foreground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(white: 0.9, alpha: 1.0)
            : UIColor(red: 0.15, green: 0.15, blue: 0.15, alpha: 1.0)
    })

    // MARK: - Card Colors

    /// Card background - CSS: oklch(0.99 0 0) light / oklch(0.22 0.02 206) dark
    /// Slightly off-white for subtle layering
    public static let card = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.059, green: 0.115, blue: 0.122, alpha: 1.0)
            : UIColor(red: 0.987, green: 0.987, blue: 0.987, alpha: 1.0)
    })

    /// Card foreground - CSS: oklch(0.18 0 0)
    public static let cardForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(white: 0.88, alpha: 1.0)
            : UIColor(red: 0.18, green: 0.18, blue: 0.18, alpha: 1.0)
    })

    // MARK: - Popover Colors

    /// Popover background - CSS: oklch(1 0 0) light / oklch(0.20 0.02 206) dark
    public static let popover = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.041, green: 0.097, blue: 0.104, alpha: 1.0)
            : UIColor(white: 1.0, alpha: 1.0)
    })

    /// Popover foreground - CSS: oklch(0.15 0 0)
    public static let popoverForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(white: 0.9, alpha: 1.0)
            : UIColor(red: 0.15, green: 0.15, blue: 0.15, alpha: 1.0)
    })

    // MARK: - Primary Colors (Teal - #0F7E8C)

    /// Primary color - CSS: oklch(0.52 0.09 195) light / oklch(0.65 0.08 195) dark
    /// Based on app icon teal (#0F7E8C)
    public static let primary = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.299, green: 0.622, blue: 0.620, alpha: 1.0)
            : UIColor(red: 0.000, green: 0.473, blue: 0.474, alpha: 1.0)
    })

    /// Primary foreground - CSS: oklch(0.98 0 0) light / oklch(0.12 0.02 206) dark
    public static let primaryForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.001, green: 0.029, blue: 0.035, alpha: 1.0)
            : UIColor(red: 0.98, green: 0.98, blue: 0.98, alpha: 1.0)
    })

    // MARK: - Secondary Colors

    /// Secondary background - CSS: oklch(0.97 0 0) light / oklch(0.28 0.02 206) dark
    /// Light gray on white
    public static let secondary = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.114, green: 0.172, blue: 0.179, alpha: 1.0)
            : UIColor(red: 0.97, green: 0.97, blue: 0.97, alpha: 1.0)
    })

    /// Secondary foreground - CSS: oklch(0.2 0 0)
    public static let secondaryForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(white: 0.82, alpha: 1.0)
            : UIColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1.0)
    })

    // MARK: - Muted Colors

    /// Muted background - CSS: oklch(0.98 0 0) light / oklch(0.24 0.02 206) dark
    public static let muted = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.077, green: 0.134, blue: 0.141, alpha: 1.0)
            : UIColor(red: 0.98, green: 0.98, blue: 0.98, alpha: 1.0)
    })

    /// Muted foreground - CSS: oklch(0.4 0 0)
    public static let mutedForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(white: 0.62, alpha: 1.0)
            : UIColor(red: 0.4, green: 0.4, blue: 0.4, alpha: 1.0)
    })

    // MARK: - Accent Colors (Light Teal)

    /// Accent color - CSS: oklch(0.97 0.01 195) light / oklch(0.3 0.03 195) dark
    /// Light teal variant based on #5FB1BE
    public static let accent = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.105, green: 0.198, blue: 0.198, alpha: 1.0)
            : UIColor(red: 0.94, green: 0.98, blue: 0.98, alpha: 1.0)
    })

    /// Accent foreground - CSS: oklch(0.15 0.04 206)
    public static let accentForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(white: 0.85, alpha: 1.0)
            : UIColor(red: 0.12, green: 0.18, blue: 0.20, alpha: 1.0)
    })

    // MARK: - Status Colors

    /// Destructive/error color - CSS: oklch(0.55 0.22 25) light / oklch(0.6 0.22 25) dark
    public static let destructive = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.903, green: 0.168, blue: 0.205, alpha: 1.0)
            : UIColor(red: 0.73, green: 0.21, blue: 0.21, alpha: 1.0)
    })

    /// Destructive foreground - CSS: oklch(0.97 0.01 25) light / oklch(0.9 0.01 25) dark
    public static let destructiveForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.898, green: 0.882, blue: 0.882, alpha: 1.0)
            : UIColor(red: 0.97, green: 0.96, blue: 0.96, alpha: 1.0)
    })

    /// Warning color - CSS: oklch(0.68 0.15 65) light / oklch(0.65 0.15 65) dark
    public static let warning = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.800, green: 0.471, blue: 0.000, alpha: 1.0)
            : UIColor(red: 0.84, green: 0.58, blue: 0.29, alpha: 1.0)
    })

    /// Warning foreground - CSS: oklch(0.18 0.05 65) light / oklch(0.95 0.02 65) dark
    public static let warningForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.949, green: 0.933, blue: 0.914, alpha: 1.0)
            : UIColor(red: 0.18, green: 0.13, blue: 0.08, alpha: 1.0)
    })

    /// Warning background - CSS: oklch(0.95 0.04 65) light / oklch(0.2 0.08 65) dark
    public static let warningBackground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.175, green: 0.036, blue: 0.000, alpha: 1.0)
            : UIColor(red: 0.98, green: 0.96, blue: 0.91, alpha: 1.0)
    })

    /// Warning border - CSS: oklch(0.8 0.08 65) light / oklch(0.4 0.12 65) dark
    public static let warningBorder = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.445, green: 0.208, blue: 0.000, alpha: 1.0)
            : UIColor(red: 0.90, green: 0.82, blue: 0.66, alpha: 1.0)
    })

    /// Success color - CSS: oklch(0.58 0.15 145) light / oklch(0.45 0.08 145) dark
    public static let success = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.215, green: 0.380, blue: 0.222, alpha: 1.0)
            : UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1.0)
    })

    /// Success foreground - CSS: oklch(0.18 0.05 145) light / oklch(0.88 0.01 145) dark
    public static let successForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.863, green: 0.882, blue: 0.867, alpha: 1.0)
            : UIColor(red: 0.11, green: 0.21, blue: 0.11, alpha: 1.0)
    })

    /// Info color - CSS: oklch(0.58 0.12 220) light / oklch(0.6 0.12 220) dark
    public static let info = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.000, green: 0.563, blue: 0.696, alpha: 1.0)
            : UIColor(red: 0.14, green: 0.56, blue: 0.75, alpha: 1.0)
    })

    /// Info foreground - CSS: oklch(0.18 0.05 220) light / oklch(0.95 0.02 220) dark
    public static let infoForeground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.933, green: 0.945, blue: 0.957, alpha: 1.0)
            : UIColor(red: 0.08, green: 0.16, blue: 0.22, alpha: 1.0)
    })

    /// Info background - CSS: oklch(0.95 0.03 220) light / oklch(0.2 0.06 220) dark
    public static let infoBackground = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.000, green: 0.106, blue: 0.159, alpha: 1.0)
            : UIColor(red: 0.92, green: 0.97, blue: 0.99, alpha: 1.0)
    })

    /// Info border - CSS: oklch(0.8 0.06 220) light / oklch(0.4 0.08 220) dark
    public static let infoBorder = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.000, green: 0.317, blue: 0.397, alpha: 1.0)
            : UIColor(red: 0.69, green: 0.84, blue: 0.92, alpha: 1.0)
    })

    // MARK: - UI Element Colors

    /// Border color - CSS: oklch(0.92 0 0) light / oklch(0.34 0.02 206) dark
    public static let border = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.172, green: 0.232, blue: 0.239, alpha: 1.0)
            : UIColor(red: 0.92, green: 0.92, blue: 0.92, alpha: 1.0)
    })

    /// Ring/focus color - CSS: oklch(0.52 0.09 195) light / oklch(0.65 0.08 195) dark
    /// Same as primary for consistency
    public static let ring = Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0.299, green: 0.622, blue: 0.620, alpha: 1.0)
            : UIColor(red: 0.000, green: 0.473, blue: 0.474, alpha: 1.0)
    })

    // MARK: - Corner Radius Constants

    /// Base radius - CSS: 0.5rem = 8pt
    public static let radius: CGFloat = 8

    /// Large radius - CSS: var(--radius) = 8pt
    public static let radiusLg: CGFloat = 8

    /// Medium radius - CSS: calc(var(--radius) - 2px) = 6pt
    public static let radiusMd: CGFloat = 6

    /// Small radius - CSS: calc(var(--radius) - 4px) = 4pt
    public static let radiusSm: CGFloat = 4
}

// MARK: - Color Extensions for Convenient Access

public extension Color {
    // Base colors - mapped from AppColors
    static var appBackground: Color { AppColors.background }
    static var appForeground: Color { AppColors.foreground }

    // Card colors
    static var appCard: Color { AppColors.card }
    static var appCardForeground: Color { AppColors.cardForeground }

    // Popover colors
    static var appPopover: Color { AppColors.popover }
    static var appPopoverForeground: Color { AppColors.popoverForeground }

    // Primary colors
    static var appPrimary: Color { AppColors.primary }
    static var appPrimaryForeground: Color { AppColors.primaryForeground }

    // Secondary colors
    static var appSecondary: Color { AppColors.secondary }
    static var appSecondaryForeground: Color { AppColors.secondaryForeground }

    // Muted colors
    static var appMuted: Color { AppColors.muted }
    static var appMutedForeground: Color { AppColors.mutedForeground }

    // Accent colors
    static var appAccent: Color { AppColors.accent }
    static var appAccentForeground: Color { AppColors.accentForeground }

    // Status colors
    static var appDestructive: Color { AppColors.destructive }
    static var appDestructiveForeground: Color { AppColors.destructiveForeground }
    static var appWarning: Color { AppColors.warning }
    static var appWarningForeground: Color { AppColors.warningForeground }
    static var appWarningBackground: Color { AppColors.warningBackground }
    static var appWarningBorder: Color { AppColors.warningBorder }
    static var appSuccess: Color { AppColors.success }
    static var appSuccessForeground: Color { AppColors.successForeground }
    static var appInfo: Color { AppColors.info }
    static var appInfoForeground: Color { AppColors.infoForeground }
    static var appInfoBackground: Color { AppColors.infoBackground }
    static var appInfoBorder: Color { AppColors.infoBorder }

    // UI elements
    static var appBorder: Color { AppColors.border }
    static var appRing: Color { AppColors.ring }
}
