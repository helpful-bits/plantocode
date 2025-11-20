import SwiftUI

private func dynamicColor(_ pair: Theme.DynamicColorPair) -> Color {
    Color(UIColor { traitCollection in
        traitCollection.userInterfaceStyle == .dark ? UIColor(pair.dark) : UIColor(pair.light)
    })
}

public extension Color {
    static let background = dynamicColor(Theme.Colors.background)
    static let card = dynamicColor(Theme.Colors.card)
    static let foreground = dynamicColor(Theme.Colors.foreground)
    static let cardForeground = dynamicColor(Theme.Colors.cardForeground)
    static let mutedForeground = dynamicColor(Theme.Colors.mutedForeground)
    static let secondaryForeground = dynamicColor(Theme.Colors.secondaryForeground)
    static let primary = dynamicColor(Theme.Colors.primary)
    static let primaryForeground = dynamicColor(Theme.Colors.primaryForeground)
    static let secondary = dynamicColor(Theme.Colors.secondary)
    static let muted = dynamicColor(Theme.Colors.muted)
    static let accent = dynamicColor(Theme.Colors.accent)
    static let accentForeground = dynamicColor(Theme.Colors.accentForeground)
    static let destructive = dynamicColor(Theme.Colors.destructive)
    static let destructiveForeground = dynamicColor(Theme.Colors.destructiveForeground)
    static let warning = dynamicColor(Theme.Colors.warning)
    static let warningForeground = dynamicColor(Theme.Colors.warningForeground)
    static let info = dynamicColor(Theme.Colors.info)
    static let infoForeground = dynamicColor(Theme.Colors.infoForeground)
    static let success = dynamicColor(Theme.Colors.success)
    static let successForeground = dynamicColor(Theme.Colors.successForeground)
    static let border = dynamicColor(Theme.Colors.border)
    static let input = dynamicColor(Theme.Colors.input)
    static let ring = dynamicColor(Theme.Colors.ring)
    static let popover = dynamicColor(Theme.Colors.popover)
    static let popoverForeground = dynamicColor(Theme.Colors.popoverForeground)
    static let warningBackground = dynamicColor(Theme.Colors.warningBackground)
    static let warningBorder = dynamicColor(Theme.Colors.warningBorder)
    static let infoBackground = dynamicColor(Theme.Colors.infoBackground)
    static let infoBorder = dynamicColor(Theme.Colors.infoBorder)
    static let successBackground = dynamicColor(Theme.Colors.successBackground)
    static let successBorder = dynamicColor(Theme.Colors.successBorder)
    static let borderModal = dynamicColor(Theme.Colors.borderModal)
    static let codeBackground = dynamicColor(Theme.Colors.codeBackground)
    static let codeForeground = dynamicColor(Theme.Colors.codeForeground)
    static let codeBorder = dynamicColor(Theme.Colors.codeBorder)
    static let inlineCodeBackground = dynamicColor(Theme.Colors.inlineCodeBackground)
    static let inlineCodeForeground = dynamicColor(Theme.Colors.inlineCodeForeground)
    static let destructiveBackground = dynamicColor(Theme.Colors.destructiveBackground)
    static let destructiveBorder = dynamicColor(Theme.Colors.destructiveBorder)

    static var backgroundPrimary: Color { dynamicColor(Theme.Semantic.Background.primary) }
    static var backgroundSecondary: Color { dynamicColor(Theme.Semantic.Background.secondary) }
    static var backgroundTertiary: Color { dynamicColor(Theme.Semantic.Background.tertiary) }

    static var surfacePrimary: Color { dynamicColor(Theme.Semantic.Surface.card) }
    static var surfaceSecondary: Color { dynamicColor(Theme.Semantic.Surface.cardMuted) }
    static var surfaceElevated: Color { dynamicColor(Theme.Semantic.Surface.elevated) }

    static var textPrimary: Color { dynamicColor(Theme.Semantic.Text.primary) }
    static var textSecondary: Color { dynamicColor(Theme.Semantic.Text.secondary) }
    static var textMuted: Color { dynamicColor(Theme.Semantic.Text.muted) }
    static var textInverse: Color { dynamicColor(Theme.Semantic.Text.inverse) }

    static var inputBackground: Color { dynamicColor(Theme.Semantic.Input.background) }
    static var inputBorder: Color { dynamicColor(Theme.Semantic.Input.border) }
    static var inputPlaceholder: Color { dynamicColor(Theme.Semantic.Input.placeholder) }

    static var selectionBackground: Color { dynamicColor(Theme.Semantic.Selection.background) }
    static var subtleHighlight: Color { dynamicColor(Theme.Semantic.Selection.subtleHighlight) }

    static var appBackground: Color { backgroundPrimary }
    static var appCard: Color { surfacePrimary }
    static var appForeground: Color { textPrimary }
    static var appMutedForeground: Color { textMuted }
}
