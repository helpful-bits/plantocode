import SwiftUI

public extension Color {
    // MARK: - Background Colors
    static let background = Color("Background")
    static let card = Color("Card")
    static let popover = Color("Popover")

    // MARK: - Foreground Colors
    static let foreground = Color("Foreground")
    static let cardForeground = Color("CardForeground")
    static let mutedForeground = Color("MutedForeground")
    static let secondaryForeground = Color("SecondaryForeground")

    // MARK: - Primary & Accent
    static let primary = Color("Primary")
    static let primaryForeground = Color("PrimaryForeground")
    static let accent = Color("Accent")
    static let accentForeground = Color("AccentForeground")

    // MARK: - Semantic Colors
    static let destructive = Color("Destructive")
    static let destructiveForeground = Color("DestructiveForeground")
    static let warning = Color("Warning")
    static let warningForeground = Color("WarningForeground")
    static let info = Color("Info")
    static let infoForeground = Color("InfoForeground")
    static let success = Color("Success")
    static let successForeground = Color("SuccessForeground")

    // MARK: - UI Elements
    static let border = Color("Border")
    static let input = Color("Input")
    static let ring = Color("Ring")

    // MARK: - Secondary & Muted
    static let secondary = Color("Secondary")
    static let muted = Color("Muted")
}

// Color definitions matching desktop CSS
public struct ThemeColors {
    public struct Light {
        // Backgrounds
        public static let background = Color(white: 1.0) // oklch(1 0 0)
        public static let card = Color(white: 0.99) // oklch(0.99 0 0)
        public static let popover = Color(white: 1.0) // oklch(1 0 0)

        // Foregrounds
        public static let foreground = Color(white: 0.15) // oklch(0.15 0 0)
        public static let cardForeground = Color(white: 0.18) // oklch(0.18 0 0)
        public static let mutedForeground = Color(white: 0.4) // oklch(0.4 0 0)
        public static let secondaryForeground = Color(white: 0.2) // oklch(0.2 0 0)

        // Primary (Teal)
        public static let primary = Color(red: 0.15, green: 0.49, blue: 0.55) // Approximation of oklch(0.52 0.09 195)
        public static let primaryForeground = Color(white: 0.98) // oklch(0.98 0 0)

        // Secondary & Muted
        public static let secondary = Color(white: 0.97) // oklch(0.97 0 0)
        public static let muted = Color(white: 0.98) // oklch(0.98 0 0)

        // Accent (Light teal)
        public static let accent = Color(red: 0.94, green: 0.98, blue: 0.98) // Approximation of oklch(0.97 0.01 195)
        public static let accentForeground = Color(red: 0.12, green: 0.18, blue: 0.20) // Approximation of oklch(0.15 0.04 206)

        // Status colors
        public static let destructive = Color(red: 0.73, green: 0.21, blue: 0.21) // Approximation of oklch(0.55 0.22 25)
        public static let destructiveForeground = Color(red: 0.97, green: 0.96, blue: 0.96) // Approximation of oklch(0.97 0.01 25)
        public static let warning = Color(red: 0.84, green: 0.58, blue: 0.29) // Approximation of oklch(0.68 0.15 65)
        public static let warningForeground = Color(red: 0.18, green: 0.13, blue: 0.08) // Approximation of oklch(0.18 0.05 65)
        public static let info = Color(red: 0.33, green: 0.51, blue: 0.85) // Approximation of oklch(0.58 0.12 220)
        public static let infoForeground = Color(red: 0.11, green: 0.14, blue: 0.23) // Approximation of oklch(0.18 0.05 220)
        public static let success = Color(red: 0.30, green: 0.69, blue: 0.31) // Approximation of oklch(0.58 0.15 145)
        public static let successForeground = Color(red: 0.11, green: 0.21, blue: 0.11) // Approximation of oklch(0.18 0.05 145)

        // UI Elements
        public static let border = Color(white: 0.92) // oklch(0.92 0 0)
        public static let input = Color(white: 0.985) // oklch(0.985 0 0)
        public static let ring = Color(red: 0.15, green: 0.49, blue: 0.55) // Same as primary
    }

    public struct Dark {
        // Backgrounds (Navy tones)
        public static let background = Color(red: 0.11, green: 0.13, blue: 0.18) // Approximation of oklch(0.18 0.02 206)
        public static let card = Color(red: 0.14, green: 0.16, blue: 0.22) // Approximation of oklch(0.22 0.02 206)
        public static let popover = Color(red: 0.12, green: 0.14, blue: 0.20) // Approximation of oklch(0.20 0.02 206)

        // Foregrounds
        public static let foreground = Color(white: 0.9) // oklch(0.9 0 0)
        public static let cardForeground = Color(white: 0.88) // oklch(0.88 0 0)
        public static let mutedForeground = Color(white: 0.62) // oklch(0.62 0 0)
        public static let secondaryForeground = Color(white: 0.82) // oklch(0.82 0 0)

        // Primary (Brighter teal for dark mode)
        public static let primary = Color(red: 0.36, green: 0.70, blue: 0.74) // Approximation of oklch(0.65 0.08 195)
        public static let primaryForeground = Color(red: 0.07, green: 0.08, blue: 0.12) // Approximation of oklch(0.12 0.02 206)

        // Secondary & Muted (Navy tones)
        public static let secondary = Color(red: 0.18, green: 0.21, blue: 0.28) // Approximation of oklch(0.28 0.02 206)
        public static let muted = Color(red: 0.15, green: 0.17, blue: 0.24) // Approximation of oklch(0.24 0.02 206)

        // Accent (Light teal with good contrast)
        public static let accent = Color(red: 0.20, green: 0.28, blue: 0.32) // Approximation of oklch(0.3 0.03 195)
        public static let accentForeground = Color(white: 0.85) // oklch(0.85 0 0)

        // Status colors
        public static let destructive = Color(red: 0.82, green: 0.30, blue: 0.30) // Approximation of oklch(0.6 0.22 25)
        public static let destructiveForeground = Color(red: 0.90, green: 0.88, blue: 0.88) // Approximation of oklch(0.9 0.01 25)
        public static let warning = Color(red: 0.84, green: 0.61, blue: 0.35) // Approximation of oklch(0.65 0.15 65)
        public static let warningForeground = Color(red: 0.95, green: 0.93, blue: 0.91) // Approximation of oklch(0.95 0.02 65)
        public static let info = Color(red: 0.41, green: 0.55, blue: 0.82) // Approximation of oklch(0.6 0.12 220)
        public static let infoForeground = Color(red: 0.92, green: 0.94, blue: 0.97) // Approximation of oklch(0.95 0.02 220)
        public static let success = Color(red: 0.22, green: 0.51, blue: 0.36) // Approximation of oklch(0.45 0.08 145)
        public static let successForeground = Color(red: 0.86, green: 0.88, blue: 0.86) // Approximation of oklch(0.88 0.01 145)

        // UI Elements (Navy tones)
        public static let border = Color(red: 0.22, green: 0.25, blue: 0.34) // Approximation of oklch(0.34 0.02 206)
        public static let input = Color(red: 0.16, green: 0.19, blue: 0.26) // Approximation of oklch(0.26 0.02 206)
        public static let ring = Color(red: 0.36, green: 0.70, blue: 0.74) // Same as primary
    }
}

// Dynamic color provider
public struct DynamicColor {
    public static func color(light: Color, dark: Color) -> Color {
        return Color(UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}

// Register named colors for use in SwiftUI
public extension Color {
    static func registerThemeColors() {
        // This would typically be done with an Asset Catalog, but we can define them programmatically
        // These will be referenced by name in the UI code
    }

    init(_ name: String) {
        switch name {
        case "Background":
            self = DynamicColor.color(light: ThemeColors.Light.background, dark: ThemeColors.Dark.background)
        case "Card":
            self = DynamicColor.color(light: ThemeColors.Light.card, dark: ThemeColors.Dark.card)
        case "Popover":
            self = DynamicColor.color(light: ThemeColors.Light.popover, dark: ThemeColors.Dark.popover)
        case "Foreground":
            self = DynamicColor.color(light: ThemeColors.Light.foreground, dark: ThemeColors.Dark.foreground)
        case "CardForeground":
            self = DynamicColor.color(light: ThemeColors.Light.cardForeground, dark: ThemeColors.Dark.cardForeground)
        case "MutedForeground":
            self = DynamicColor.color(light: ThemeColors.Light.mutedForeground, dark: ThemeColors.Dark.mutedForeground)
        case "SecondaryForeground":
            self = DynamicColor.color(light: ThemeColors.Light.secondaryForeground, dark: ThemeColors.Dark.secondaryForeground)
        case "Primary":
            self = DynamicColor.color(light: ThemeColors.Light.primary, dark: ThemeColors.Dark.primary)
        case "PrimaryForeground":
            self = DynamicColor.color(light: ThemeColors.Light.primaryForeground, dark: ThemeColors.Dark.primaryForeground)
        case "Secondary":
            self = DynamicColor.color(light: ThemeColors.Light.secondary, dark: ThemeColors.Dark.secondary)
        case "Muted":
            self = DynamicColor.color(light: ThemeColors.Light.muted, dark: ThemeColors.Dark.muted)
        case "Accent":
            self = DynamicColor.color(light: ThemeColors.Light.accent, dark: ThemeColors.Dark.accent)
        case "AccentForeground":
            self = DynamicColor.color(light: ThemeColors.Light.accentForeground, dark: ThemeColors.Dark.accentForeground)
        case "Destructive":
            self = DynamicColor.color(light: ThemeColors.Light.destructive, dark: ThemeColors.Dark.destructive)
        case "DestructiveForeground":
            self = DynamicColor.color(light: ThemeColors.Light.destructiveForeground, dark: ThemeColors.Dark.destructiveForeground)
        case "Warning":
            self = DynamicColor.color(light: ThemeColors.Light.warning, dark: ThemeColors.Dark.warning)
        case "WarningForeground":
            self = DynamicColor.color(light: ThemeColors.Light.warningForeground, dark: ThemeColors.Dark.warningForeground)
        case "Info":
            self = DynamicColor.color(light: ThemeColors.Light.info, dark: ThemeColors.Dark.info)
        case "InfoForeground":
            self = DynamicColor.color(light: ThemeColors.Light.infoForeground, dark: ThemeColors.Dark.infoForeground)
        case "Success":
            self = DynamicColor.color(light: ThemeColors.Light.success, dark: ThemeColors.Dark.success)
        case "SuccessForeground":
            self = DynamicColor.color(light: ThemeColors.Light.successForeground, dark: ThemeColors.Dark.successForeground)
        case "Border":
            self = DynamicColor.color(light: ThemeColors.Light.border, dark: ThemeColors.Dark.border)
        case "Input":
            self = DynamicColor.color(light: ThemeColors.Light.input, dark: ThemeColors.Dark.input)
        case "Ring":
            self = DynamicColor.color(light: ThemeColors.Light.ring, dark: ThemeColors.Dark.ring)
        default:
            self = Color.gray
        }
    }
}