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
        UIColor { traitCollection in
            let color = traitCollection.userInterfaceStyle == .dark ? Theme.Colors.primary.dark : Theme.Colors.primary.light
            return UIColor(color.opacity(0.22))
        }
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
            return UIColor.systemGray

        case "keyword", "control", "operator":
            return UIColor.systemPurple

        case "string", "character":
            return UIColor.systemRed

        case "number", "constant":
            return UIColor.systemOrange

        case "type", "class", "struct", "enum", "interface":
            return UIColor.systemTeal

        case "function", "method", "call":
            return UIColor.systemBlue

        case "property", "attribute":
            return UIColor.systemCyan

        case "tag", "markup.heading":
            return UIColor.systemIndigo

        case "markup.italic", "markup.bold", "markup.list":
            return UIColor.systemGreen

        case "url", "link":
            return UIColor.systemBlue

        default:
            return textColor
        }
    }
}
