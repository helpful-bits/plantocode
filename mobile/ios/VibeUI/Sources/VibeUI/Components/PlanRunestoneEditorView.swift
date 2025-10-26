import SwiftUI
import Runestone
import TreeSitterHTMLRunestone
import TreeSitterMarkdownRunestone
import TreeSitterJavaScriptRunestone
import TreeSitterJSONRunestone
import TreeSitterPythonRunestone
import TreeSitterSwiftRunestone
import TreeSitterYAMLRunestone
import TreeSitterCSSRunestone
import TreeSitterRustRunestone
import TreeSitterGoRunestone
import UIKit

public struct PlanRunestoneEditorView: UIViewRepresentable {
    @Binding var text: String
    var isReadOnly: Bool = false
    var languageHint: String = "auto"
    var fontSize: CGFloat = 14
    var showLineNumbers: Bool = true
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(
        text: Binding<String>,
        isReadOnly: Bool = false,
        languageHint: String = "auto",
        fontSize: CGFloat = 14,
        showLineNumbers: Bool = true
    ) {
        self._text = text
        self.isReadOnly = isReadOnly
        self.languageHint = languageHint
        self.fontSize = fontSize
        self.showLineNumbers = showLineNumbers
    }

    enum LocalLanguage: String {
        case html
        case markdown
        case javascript
        case typescript
        case json
        case python
        case swift
        case yaml
        case css
        case rust
        case go
        case plaintext

        var treeSitterLanguage: TreeSitterLanguage {
            switch self {
            case .html: return .html
            case .markdown: return .markdown
            case .javascript, .typescript: return .javaScript
            case .json: return .json
            case .python: return .python
            case .swift: return .swift
            case .yaml: return .yaml
            case .css: return .css
            case .rust: return .rust
            case .go: return .go
            case .plaintext: return .html  // Fallback to HTML (no plain text in Runestone)
            }
        }
    }

    private func detectLanguage(text: String, hint: String) -> LocalLanguage {
        // Explicit hint takes priority
        if let explicitLanguage = LocalLanguage(rawValue: hint.lowercased()) {
            return explicitLanguage
        }

        // Handle legacy hints
        if hint == "xml" { return .html }

        // Auto-detection
        if hint == "auto" {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

            // JSON detection (highest priority - very structured)
            if (trimmed.hasPrefix("{") || trimmed.hasPrefix("[")) &&
               (text.contains("\":") || text.contains("\": ")) {
                return .json
            }

            // YAML detection
            if text.contains("\n- ") && text.contains(":") && !text.contains("```") {
                return .yaml
            }

            // Markdown detection
            let hasMarkdownCodeBlocks = text.contains("```")
            let hasMarkdownHeadings = text.contains("\n#") || text.hasPrefix("#")
            let hasMarkdownLists = text.contains("\n- ") || text.contains("\n* ")
            let hasMarkdownLinks = text.range(of: #"\[.+\]\(.+\)"#, options: .regularExpression) != nil
            if hasMarkdownCodeBlocks || hasMarkdownHeadings || hasMarkdownLists || hasMarkdownLinks {
                return .markdown
            }

            // Swift detection
            if text.contains("import SwiftUI") || text.contains("import Foundation") ||
               text.contains("func ") && text.contains("->") ||
               text.contains("class ") || text.contains("struct ") {
                return .swift
            }

            // Python detection
            if text.contains("def ") || text.contains("import ") && text.contains("\n    ") ||
               text.contains("if __name__") || text.contains("print(") {
                return .python
            }

            // JavaScript/TypeScript detection
            if text.contains("function ") || text.contains("const ") || text.contains("let ") ||
               text.contains("=>") || text.contains("import ") && text.contains(" from ") {
                return .javascript
            }

            // Rust detection
            if text.contains("fn ") && text.contains("->") && text.contains("use ") ||
               text.contains("impl ") || text.contains("pub fn") {
                return .rust
            }

            // Go detection
            if text.contains("package ") || text.contains("func ") && text.contains("import (") {
                return .go
            }

            // CSS detection
            if text.contains("{") && text.contains("}") && text.contains(":") &&
               (text.contains("color") || text.contains("margin") || text.contains("padding")) {
                return .css
            }

            // HTML/XML detection
            let hasXMLTags = trimmed.hasPrefix("<") || text.contains("</")
            if hasXMLTags {
                return .html
            }
        }

        // Default fallback
        return .plaintext
    }

    public func makeUIView(context: Context) -> TextView {
        let textView = TextView()
        textView.editorDelegate = context.coordinator

        // Configure editor
        textView.autocapitalizationType = .none
        textView.autocorrectionType = .no
        textView.smartDashesType = .no
        textView.smartQuotesType = .no
        textView.showLineNumbers = showLineNumbers
        textView.alwaysBounceVertical = true
        textView.contentInsetAdjustmentBehavior = .always
        textView.isLineWrappingEnabled = true
        textView.isOpaque = false
        textView.backgroundColor = .clear
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        // Accessibility configuration
        textView.isAccessibilityElement = true
        textView.accessibilityLabel = isReadOnly ? "Code viewer" : "Code editor"
        textView.accessibilityHint = isReadOnly ? "Read-only code content" : "Editable code content"
        textView.accessibilityTraits = isReadOnly ? [.staticText] : [.allowsDirectInteraction]

        // Detect language and create state
        let detectedLanguage = detectLanguage(text: text, hint: languageHint)
        let theme = VibeRunestoneTheme(fontSize: fontSize)
        let state = TextViewState(text: text, theme: theme, language: detectedLanguage.treeSitterLanguage)
        textView.setState(state)

        // Cache language and color scheme in coordinator
        context.coordinator.lastAppliedLanguage = detectedLanguage
        context.coordinator.lastAppliedScheme = colorScheme

        textView.isEditable = !isReadOnly

        if textView.isEditable {
            textView.addDismissKeyboardAccessory()
        }

        return textView
    }

    public func updateUIView(_ textView: TextView, context: Context) {
        // Only update text if it changed from outside (not from user typing)
        if textView.text != text && !context.coordinator.isUpdatingFromEditor {
            // Update text directly without resetting state
            textView.text = text
        }

        // Update editability
        if textView.isEditable != !isReadOnly {
            textView.isEditable = !isReadOnly
        }

        if textView.isEditable {
            if textView.inputAccessoryView == nil {
                textView.addDismissKeyboardAccessory()
            }
        } else {
            if textView.inputAccessoryView != nil {
                textView.removeDismissKeyboardAccessory()
            }
        }

        // Check if language or color scheme changed
        let currentLanguage = detectLanguage(text: text, hint: languageHint)
        let languageChanged = currentLanguage != context.coordinator.lastAppliedLanguage
        let schemeChanged = colorScheme != context.coordinator.lastAppliedScheme

        if languageChanged || schemeChanged {
            // Save selection and scroll position
            let selectedRange = textView.selectedRange
            let contentOffset = textView.contentOffset

            // Update state with new theme and language
            let theme = VibeRunestoneTheme(fontSize: fontSize)
            let state = TextViewState(text: textView.text, theme: theme, language: currentLanguage.treeSitterLanguage)
            textView.setState(state)

            // Restore selection and scroll position
            textView.selectedRange = selectedRange
            textView.contentOffset = contentOffset

            // Update cached values
            context.coordinator.lastAppliedLanguage = currentLanguage
            context.coordinator.lastAppliedScheme = colorScheme
        }
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    public class Coordinator: NSObject, TextViewDelegate {
        @Binding var text: String
        var isUpdatingFromEditor = false
        var lastAppliedLanguage: LocalLanguage = .plaintext
        var lastAppliedScheme: ColorScheme = .light

        init(text: Binding<String>) {
            self._text = text
        }

        public func textViewDidChange(_ textView: TextView) {
            isUpdatingFromEditor = true
            text = textView.text
            isUpdatingFromEditor = false
        }
    }
}
