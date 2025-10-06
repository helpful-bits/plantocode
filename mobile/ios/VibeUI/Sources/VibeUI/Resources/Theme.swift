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
            dark: Color(red: 0.17, green: 0.20, blue: 0.26)
        )

        public static let card = DynamicColorPair(
            light: Color(red: 0.99, green: 0.99, blue: 0.99),
            dark: Color(red: 0.22, green: 0.25, blue: 0.32)
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
            light: Color(red: 0.15, green: 0.49, blue: 0.55),
            dark: Color(red: 0.36, green: 0.70, blue: 0.74)
        )

        public static let primaryForeground = DynamicColorPair(
            light: Color(red: 0.98, green: 0.98, blue: 0.98),
            dark: Color(red: 0.07, green: 0.08, blue: 0.12)
        )

        public static let secondary = DynamicColorPair(
            light: Color(red: 0.97, green: 0.97, blue: 0.97),
            dark: Color(red: 0.18, green: 0.21, blue: 0.28)
        )

        public static let muted = DynamicColorPair(
            light: Color(red: 0.98, green: 0.98, blue: 0.98),
            dark: Color(red: 0.15, green: 0.17, blue: 0.24)
        )

        public static let accent = DynamicColorPair(
            light: Color(red: 0.94, green: 0.98, blue: 0.98),
            dark: Color(red: 0.20, green: 0.28, blue: 0.32)
        )

        public static let accentForeground = DynamicColorPair(
            light: Color(red: 0.12, green: 0.18, blue: 0.20),
            dark: Color(red: 0.85, green: 0.85, blue: 0.85)
        )

        public static let destructive = DynamicColorPair(
            light: Color(red: 0.73, green: 0.21, blue: 0.21),
            dark: Color(red: 0.82, green: 0.30, blue: 0.30)
        )

        public static let destructiveForeground = DynamicColorPair(
            light: Color(red: 0.97, green: 0.96, blue: 0.96),
            dark: Color(red: 0.90, green: 0.88, blue: 0.88)
        )

        public static let warning = DynamicColorPair(
            light: Color(red: 0.84, green: 0.58, blue: 0.29),
            dark: Color(red: 0.84, green: 0.61, blue: 0.35)
        )

        public static let warningForeground = DynamicColorPair(
            light: Color(red: 0.18, green: 0.13, blue: 0.08),
            dark: Color(red: 0.95, green: 0.93, blue: 0.91)
        )

        public static let info = DynamicColorPair(
            light: Color(red: 0.33, green: 0.51, blue: 0.85),
            dark: Color(red: 0.41, green: 0.55, blue: 0.82)
        )

        public static let infoForeground = DynamicColorPair(
            light: Color(red: 0.11, green: 0.14, blue: 0.23),
            dark: Color(red: 0.92, green: 0.94, blue: 0.97)
        )

        public static let success = DynamicColorPair(
            light: Color(red: 0.30, green: 0.69, blue: 0.31),
            dark: Color(red: 0.22, green: 0.51, blue: 0.36)
        )

        public static let successForeground = DynamicColorPair(
            light: Color(red: 0.11, green: 0.21, blue: 0.11),
            dark: Color(red: 0.86, green: 0.88, blue: 0.86)
        )

        public static let border = DynamicColorPair(
            light: Color(red: 0.92, green: 0.92, blue: 0.92),
            dark: Color(red: 0.22, green: 0.25, blue: 0.34)
        )

        public static let input = DynamicColorPair(
            light: Color(red: 0.985, green: 0.985, blue: 0.985),
            dark: Color(red: 0.16, green: 0.19, blue: 0.26)
        )

        public static let ring = DynamicColorPair(
            light: Color(red: 0.15, green: 0.49, blue: 0.55),
            dark: Color(red: 0.36, green: 0.70, blue: 0.74)
        )

        public static let popover = DynamicColorPair(
            light: Color(red: 1.0, green: 1.0, blue: 1.0),
            dark: Color(red: 0.13, green: 0.15, blue: 0.20)
        )

        public static let popoverForeground = DynamicColorPair(
            light: Color(red: 0.15, green: 0.15, blue: 0.15),
            dark: Color(red: 0.9, green: 0.9, blue: 0.9)
        )

        public static let warningBackground = DynamicColorPair(
            light: Color(red: 0.95, green: 0.92, blue: 0.87),
            dark: Color(red: 0.13, green: 0.12, blue: 0.10)
        )

        public static let warningBorder = DynamicColorPair(
            light: Color(red: 0.82, green: 0.70, blue: 0.50),
            dark: Color(red: 0.35, green: 0.32, blue: 0.25)
        )

        public static let infoBackground = DynamicColorPair(
            light: Color(red: 0.93, green: 0.95, blue: 0.98),
            dark: Color(red: 0.11, green: 0.13, blue: 0.17)
        )

        public static let infoBorder = DynamicColorPair(
            light: Color(red: 0.70, green: 0.78, blue: 0.92),
            dark: Color(red: 0.28, green: 0.33, blue: 0.42)
        )

        public static let successBackground = DynamicColorPair(
            light: Color(red: 0.92, green: 0.96, blue: 0.92),
            dark: Color(red: 0.09, green: 0.12, blue: 0.10)
        )

        public static let successBorder = DynamicColorPair(
            light: Color(red: 0.65, green: 0.82, blue: 0.66),
            dark: Color(red: 0.22, green: 0.32, blue: 0.24)
        )

        public static let borderModal = DynamicColorPair(
            light: Color(red: 0.88, green: 0.88, blue: 0.88),
            dark: Color(red: 0.19, green: 0.23, blue: 0.30)
        )

        public static let codeBackground = DynamicColorPair(
            light: Color(red: 0.06, green: 0.09, blue: 0.16),
            dark: Color(red: 0.12, green: 0.15, blue: 0.22)
        )

        public static let codeForeground = DynamicColorPair(
            light: Color(red: 0.95, green: 0.95, blue: 0.95),
            dark: Color(red: 0.90, green: 0.90, blue: 0.90)
        )

        public static let codeBorder = DynamicColorPair(
            light: Color(red: 0.20, green: 0.24, blue: 0.32),
            dark: Color(red: 0.34, green: 0.39, blue: 0.48)
        )

        public static let inlineCodeBackground = DynamicColorPair(
            light: Color(red: 0.96, green: 0.96, blue: 0.96),
            dark: Color(red: 0.18, green: 0.21, blue: 0.28)
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
}
