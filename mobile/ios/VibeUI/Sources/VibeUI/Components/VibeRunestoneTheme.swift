import SwiftUI
import Runestone

final class VibeRunestoneTheme: Runestone.Theme {
    private let baseFontSize: CGFloat

    init(fontSize: CGFloat = 14) {
        self.baseFontSize = fontSize
    }

    var font: UIFont {
        UIFont.monospacedSystemFont(ofSize: baseFontSize, weight: .regular)
    }

    var backgroundColor: UIColor {
        dynamicColor(Theme.Colors.codeBackground)
    }

    var gutterBackgroundColor: UIColor {
        dynamicColor(Theme.Colors.codeBackground)
    }

    var gutterHairlineColor: UIColor {
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.border.dark : Theme.Colors.border.light
            return UIColor(color.opacity(0.3))
        }
    }

    var lineNumberColor: UIColor {
        dynamicColor(Theme.Colors.mutedForeground)
    }

    var lineNumberFont: UIFont {
        // Line numbers slightly smaller than main font
        UIFont.monospacedSystemFont(ofSize: max(10, baseFontSize - 2), weight: .regular)
    }

    var selectedLineBackgroundColor: UIColor {
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.codeBackground.dark : Theme.Colors.codeBackground.light
            return UIColor(color.opacity(0.92))
        }
    }

    var selectedLinesLineNumberColor: UIColor {
        dynamicColor(Theme.Colors.mutedForeground)
    }

    var selectedLinesGutterBackgroundColor: UIColor {
        dynamicColor(Theme.Colors.codeBackground)
    }

    var invisibleCharactersColor: UIColor {
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.border.dark : Theme.Colors.border.light
            return UIColor(color.opacity(0.6))
        }
    }

    var textColor: UIColor {
        dynamicColor(Theme.Colors.codeForeground)
    }

    var insertionPointColor: UIColor {
        dynamicColor(Theme.Colors.primary)
    }

    var selectionBarColor: UIColor {
        dynamicColor(Theme.Colors.primary)
    }

    var selectionHighlightColor: UIColor {
        dynamicColor(Theme.Colors.selectionBackground)
    }

    var pageGuideBackgroundColor: UIColor {
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.border.dark : Theme.Colors.border.light
            return UIColor(color.opacity(0.4))
        }
    }

    var pageGuideHairlineColor: UIColor {
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.border.dark : Theme.Colors.border.light
            return UIColor(color.opacity(0.5))
        }
    }

    var markedTextBackgroundColor: UIColor {
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.accent.dark : Theme.Colors.accent.light
            return UIColor(color.opacity(0.3))
        }
    }

    var markedTextBackgroundBorderColor: UIColor {
        dynamicColor(Theme.Colors.primary)
    }

    private func dynamicColor(_ pair: Theme.DynamicColorPair) -> UIColor {
        UIColor { traitCollection in
            UIColor(traitCollection.userInterfaceStyle == .dark ? pair.dark : pair.light)
        }
    }

    func textColor(for highlightName: String) -> UIColor? {
        switch highlightName {
        case "comment":
            return dynamicColor(Theme.Colors.mutedForeground)

        case "keyword", "control", "operator":
            return dynamicColor(Theme.Colors.primary)

        case "string", "character":
            return dynamicColor(Theme.Colors.success)

        case "number", "constant":
            return dynamicColor(Theme.Colors.info)

        case "type", "class", "struct", "enum", "interface":
            return dynamicColor(Theme.Colors.primary)

        case "function", "method", "call":
            return dynamicColor(Theme.Colors.primary)

        case "property", "attribute":
            return dynamicColor(Theme.Colors.info)

        case "tag", "markup.heading":
            return dynamicColor(Theme.Colors.primary)

        case "markup.italic", "markup.bold", "markup.list":
            return dynamicColor(Theme.Colors.success)

        case "url", "link":
            return dynamicColor(Theme.Colors.primary)

        default:
            return textColor
        }
    }
}
