import SwiftUI

public enum Theme {
    public struct DynamicColorPair {
        public let light: Color
        public let dark: Color

        public init(light: Color, dark: Color) {
            self.light = light
            self.dark = dark
        }
    }

    public enum Colors {
        public static let background = DynamicColorPair(
            light: Color(red: 1.0, green: 1.0, blue: 1.0),
            dark: Color(red: 0.025, green: 0.079, blue: 0.086)
        )

        public static let card = DynamicColorPair(
            light: Color(red: 0.987, green: 0.987, blue: 0.987),
            dark: Color(red: 0.059, green: 0.115, blue: 0.122)
        )

        public static let foreground = DynamicColorPair(
            light: Color(red: 0.15, green: 0.15, blue: 0.15),
            dark: Color(red: 0.9, green: 0.9, blue: 0.9)
        )

        public static let cardForeground = DynamicColorPair(
            light: Color(red: 0.18, green: 0.18, blue: 0.18),
            dark: Color(red: 0.88, green: 0.88, blue: 0.88)
        )

        public static let mutedForeground = DynamicColorPair(
            light: Color(red: 0.4, green: 0.4, blue: 0.4),
            dark: Color(red: 0.62, green: 0.62, blue: 0.62)
        )

        public static let secondaryForeground = DynamicColorPair(
            light: Color(red: 0.2, green: 0.2, blue: 0.2),
            dark: Color(red: 0.82, green: 0.82, blue: 0.82)
        )

        public static let primary = DynamicColorPair(
            light: Color(red: 0.000, green: 0.473, blue: 0.474),
            dark: Color(red: 0.299, green: 0.622, blue: 0.620)
        )

        public static let primaryForeground = DynamicColorPair(
            light: Color(red: 0.98, green: 0.98, blue: 0.98),
            dark: Color(red: 0.008, green: 0.047, blue: 0.053)
        )

        public static let secondary = DynamicColorPair(
            light: Color(red: 0.97, green: 0.97, blue: 0.97),
            dark: Color(red: 0.114, green: 0.172, blue: 0.179)
        )

        public static let muted = DynamicColorPair(
            light: Color(red: 0.98, green: 0.98, blue: 0.98),
            dark: Color(red: 0.077, green: 0.134, blue: 0.141)
        )

        public static let accent = DynamicColorPair(
            light: Color(red: 0.94, green: 0.98, blue: 0.98),
            dark: Color(red: 0.105, green: 0.198, blue: 0.198)
        )

        public static let accentForeground = DynamicColorPair(
            light: Color(red: 0.12, green: 0.18, blue: 0.20),
            dark: Color(red: 0.85, green: 0.85, blue: 0.85)
        )

        public static let destructive = DynamicColorPair(
            light: Color(red: 0.73, green: 0.21, blue: 0.21),
            dark: Color(red: 0.903, green: 0.168, blue: 0.205)
        )

        public static let destructiveForeground = DynamicColorPair(
            light: Color(red: 0.97, green: 0.96, blue: 0.96),
            dark: Color(red: 0.898, green: 0.882, blue: 0.882)
        )

        public static let warning = DynamicColorPair(
            light: Color(red: 0.84, green: 0.58, blue: 0.29),
            dark: Color(red: 0.800, green: 0.471, blue: 0.000)
        )

        public static let warningForeground = DynamicColorPair(
            light: Color(red: 0.18, green: 0.13, blue: 0.08),
            dark: Color(red: 0.949, green: 0.933, blue: 0.914)
        )

        public static let info = DynamicColorPair(
            light: Color(red: 0.14, green: 0.56, blue: 0.75),
            dark: Color(red: 0.000, green: 0.563, blue: 0.696)
        )

        public static let infoForeground = DynamicColorPair(
            light: Color(red: 0.08, green: 0.16, blue: 0.22),
            dark: Color(red: 0.933, green: 0.945, blue: 0.957)
        )

        public static let success = DynamicColorPair(
            light: Color(red: 0.30, green: 0.69, blue: 0.31),
            dark: Color(red: 0.215, green: 0.380, blue: 0.222)
        )

        public static let successForeground = DynamicColorPair(
            light: Color(red: 0.11, green: 0.21, blue: 0.11),
            dark: Color(red: 0.863, green: 0.882, blue: 0.867)
        )

        public static let border = DynamicColorPair(
            light: Color(red: 0.92, green: 0.92, blue: 0.92),
            dark: Color(red: 0.172, green: 0.232, blue: 0.239)
        )

        public static let input = DynamicColorPair(
            light: Color(red: 0.985, green: 0.985, blue: 0.985),
            dark: Color(red: 0.096, green: 0.153, blue: 0.160)
        )

        public static let ring = DynamicColorPair(
            light: Color(red: 0.000, green: 0.473, blue: 0.474),
            dark: Color(red: 0.299, green: 0.622, blue: 0.620)
        )

        public static let popover = DynamicColorPair(
            light: Color(red: 1.0, green: 1.0, blue: 1.0),
            dark: Color(red: 0.041, green: 0.097, blue: 0.104)
        )

        public static let popoverForeground = DynamicColorPair(
            light: Color(red: 0.15, green: 0.15, blue: 0.15),
            dark: Color(red: 0.9, green: 0.9, blue: 0.9)
        )

        public static let warningBackground = DynamicColorPair(
            light: Color(red: 0.98, green: 0.96, blue: 0.91),
            dark: Color(red: 0.175, green: 0.036, blue: 0.000)
        )

        public static let warningBorder = DynamicColorPair(
            light: Color(red: 0.90, green: 0.82, blue: 0.66),
            dark: Color(red: 0.445, green: 0.208, blue: 0.000)
        )

        public static let infoBackground = DynamicColorPair(
            light: Color(red: 0.92, green: 0.97, blue: 0.99),
            dark: Color(red: 0.000, green: 0.106, blue: 0.159)
        )

        public static let infoBorder = DynamicColorPair(
            light: Color(red: 0.69, green: 0.84, blue: 0.92),
            dark: Color(red: 0.000, green: 0.317, blue: 0.397)
        )

        public static let successBackground = DynamicColorPair(
            light: Color(red: 0.92, green: 0.96, blue: 0.92),
            dark: Color(red: 0.010, green: 0.069, blue: 0.013)
        )

        public static let successBorder = DynamicColorPair(
            light: Color(red: 0.65, green: 0.82, blue: 0.66),
            dark: Color(red: 0.096, green: 0.210, blue: 0.102)
        )

        public static let borderModal = DynamicColorPair(
            light: Color(red: 0.88, green: 0.88, blue: 0.88),
            dark: Color(red: 0.008, green: 0.210, blue: 0.210)
        )

        public static let codeBackground = DynamicColorPair(
            light: Color(red: 0.06, green: 0.09, blue: 0.16),
            dark: Color(red: 0.001, green: 0.029, blue: 0.035)
        )

        public static let codeForeground = DynamicColorPair(
            light: Color(red: 0.95, green: 0.95, blue: 0.95),
            dark: Color(red: 0.90, green: 0.90, blue: 0.90)
        )

        public static let codeBorder = DynamicColorPair(
            light: Color(red: 0.20, green: 0.24, blue: 0.32),
            dark: Color(red: 0.172, green: 0.232, blue: 0.239)
        )

        public static let inlineCodeBackground = DynamicColorPair(
            light: Color(red: 0.96, green: 0.96, blue: 0.96),
            dark: Color(red: 0.077, green: 0.134, blue: 0.141)
        )

        public static let inlineCodeForeground = DynamicColorPair(
            light: Color(red: 0.15, green: 0.15, blue: 0.15),
            dark: Color(red: 0.82, green: 0.82, blue: 0.82)
        )
    }

    public enum Radii {
        public static let base: CGFloat = 8
        public static let lg: CGFloat = 8
        public static let md: CGFloat = 6
        public static let sm: CGFloat = 4
    }

    public enum Spacing {
        // Base spacing scale (4pt grid)
        public static let xs: CGFloat = 4
        public static let sm: CGFloat = 8
        public static let md: CGFloat = 12
        public static let lg: CGFloat = 16
        public static let xl: CGFloat = 20
        public static let xxl: CGFloat = 24

        // Common component spacing
        public static let cardPadding: CGFloat = 14
        public static let cardSpacing: CGFloat = 10
        public static let sectionSpacing: CGFloat = 16
        public static let itemSpacing: CGFloat = 6
    }
}
