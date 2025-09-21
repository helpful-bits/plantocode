import SwiftUI
import UIKit

/// Lightweight code editor using UITextView with basic syntax highlighting
public struct CodeEditor: UIViewRepresentable {
    @Binding public var text: String
    public let isReadonly: Bool
    public let language: CodeLanguage
    public let theme: CodeEditorTheme
    public let showLineNumbers: Bool
    public let enableLineWrapping: Bool

    public init(
        text: Binding<String>,
        isReadonly: Bool = false,
        language: CodeLanguage = .markdown,
        theme: CodeEditorTheme = .system,
        showLineNumbers: Bool = true,
        enableLineWrapping: Bool = true
    ) {
        self._text = text
        self.isReadonly = isReadonly
        self.language = language
        self.theme = theme
        self.showLineNumbers = showLineNumbers
        self.enableLineWrapping = enableLineWrapping
    }

    public func makeUIView(context: Context) -> CodeEditorView {
        let editorView = CodeEditorView()
        editorView.configure(
            isReadonly: isReadonly,
            language: language,
            theme: theme,
            showLineNumbers: showLineNumbers,
            enableLineWrapping: enableLineWrapping
        )
        editorView.textDelegate = context.coordinator
        return editorView
    }

    public func updateUIView(_ uiView: CodeEditorView, context: Context) {
        if uiView.textView.text != text {
            uiView.setText(text)
        }
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    public class Coordinator: NSObject, UITextViewDelegate {
        let parent: CodeEditor

        init(_ parent: CodeEditor) {
            self.parent = parent
        }

        public func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
        }

        public func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            return !parent.isReadonly
        }
    }
}

public class CodeEditorView: UIView {
    public let scrollView = UIScrollView()
    public let textView = UITextView()
    public let lineNumberView = LineNumberView()

    private var language: CodeLanguage = .markdown
    private var theme: CodeEditorTheme = .system
    private var showLineNumbers = true
    private var enableLineWrapping = true

    public weak var textDelegate: UITextViewDelegate?

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setupViews()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupViews()
    }

    private func setupViews() {
        // Configure scroll view
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.showsVerticalScrollIndicator = true
        scrollView.showsHorizontalScrollIndicator = true
        addSubview(scrollView)

        // Configure text view
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.backgroundColor = .clear
        textView.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
        textView.autocorrectionType = .no
        textView.autocapitalizationType = .none
        textView.smartDashesType = .no
        textView.smartQuotesType = .no
        textView.smartInsertDeleteType = .no
        textView.spellCheckingType = .no
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        scrollView.addSubview(textView)

        // Configure line number view
        lineNumberView.translatesAutoresizingMaskIntoConstraints = false
        lineNumberView.backgroundColor = UIColor.systemGray6
        addSubview(lineNumberView)

        setupConstraints()
        applyTheme()

        // Text view notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(textViewDidChange),
            name: UITextView.textDidChangeNotification,
            object: textView
        )
    }

    private func setupConstraints() {
        NSLayoutConstraint.activate([
            // Line number view
            lineNumberView.leadingAnchor.constraint(equalTo: leadingAnchor),
            lineNumberView.topAnchor.constraint(equalTo: topAnchor),
            lineNumberView.bottomAnchor.constraint(equalTo: bottomAnchor),
            lineNumberView.widthAnchor.constraint(equalToConstant: 50),

            // Scroll view
            scrollView.leadingAnchor.constraint(equalTo: lineNumberView.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),

            // Text view
            textView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            textView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            textView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            textView.widthAnchor.constraint(equalTo: scrollView.widthAnchor)
        ])
    }

    public func configure(
        isReadonly: Bool,
        language: CodeLanguage,
        theme: CodeEditorTheme,
        showLineNumbers: Bool,
        enableLineWrapping: Bool
    ) {
        self.language = language
        self.theme = theme
        self.showLineNumbers = showLineNumbers
        self.enableLineWrapping = enableLineWrapping

        textView.isEditable = !isReadonly
        textView.isSelectable = true
        lineNumberView.isHidden = !showLineNumbers

        if enableLineWrapping {
            textView.textContainer.widthTracksTextView = true
            textView.textContainer.size = CGSize(width: scrollView.frame.width, height: CGFloat.greatestFiniteMagnitude)
        } else {
            textView.textContainer.widthTracksTextView = false
            textView.textContainer.size = CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        }

        applyTheme()
        textView.delegate = textDelegate
    }

    public func setText(_ text: String) {
        textView.text = text
        applySyntaxHighlighting()
        updateLineNumbers()
    }

    private func applyTheme() {
        switch theme {
        case .light:
            backgroundColor = .systemBackground
            textView.textColor = .label
            lineNumberView.backgroundColor = .systemGray6
        case .dark:
            backgroundColor = .systemBackground
            textView.textColor = .label
            lineNumberView.backgroundColor = .systemGray6
        case .system:
            backgroundColor = .systemBackground
            textView.textColor = .label
            lineNumberView.backgroundColor = .systemGray6
        }
    }

    private func applySyntaxHighlighting() {
        let fullRange = NSRange(location: 0, length: textView.text.count)
        let attributedString = NSMutableAttributedString(string: textView.text)

        // Reset attributes
        attributedString.removeAttribute(.foregroundColor, range: fullRange)
        attributedString.addAttribute(.font, value: UIFont.monospacedSystemFont(ofSize: 14, weight: .regular), range: fullRange)
        attributedString.addAttribute(.foregroundColor, value: UIColor.label, range: fullRange)

        // Apply syntax highlighting based on language
        applySyntaxHighlighting(to: attributedString, language: language)

        textView.attributedText = attributedString
    }

    private func applySyntaxHighlighting(to attributedString: NSMutableAttributedString, language: CodeLanguage) {
        let text = attributedString.string

        switch language {
        case .markdown:
            applyMarkdownHighlighting(to: attributedString, text: text)
        case .swift:
            applySwiftHighlighting(to: attributedString, text: text)
        case .xml:
            applyXMLHighlighting(to: attributedString, text: text)
        case .javascript:
            applyJavaScriptHighlighting(to: attributedString, text: text)
        case .json:
            applyJSONHighlighting(to: attributedString, text: text)
        case .plaintext:
            break // No highlighting for plain text
        }
    }

    private func applyMarkdownHighlighting(to attributedString: NSMutableAttributedString, text: String) {
        // Headers
        let headerPattern = "^#{1,6}\\s+.*$"
        highlightPattern(headerPattern, in: attributedString, color: .systemBlue, options: [.anchorsMatchLines])

        // Bold text
        let boldPattern = "\\*\\*([^*]+)\\*\\*"
        highlightPattern(boldPattern, in: attributedString, font: UIFont.monospacedSystemFont(ofSize: 14, weight: .bold))

        // Italic text
        let italicPattern = "\\*([^*]+)\\*"
        highlightPattern(italicPattern, in: attributedString, font: UIFont.italicSystemFont(ofSize: 14))

        // Code blocks
        let codeBlockPattern = "```[\\s\\S]*?```"
        highlightPattern(codeBlockPattern, in: attributedString, color: .systemGray, backgroundColor: .systemGray6)

        // Inline code
        let inlineCodePattern = "`([^`]+)`"
        highlightPattern(inlineCodePattern, in: attributedString, color: .systemRed, backgroundColor: .systemGray6)

        // Links
        let linkPattern = "\\[([^\\]]+)\\]\\(([^)]+)\\)"
        highlightPattern(linkPattern, in: attributedString, color: .systemBlue)
    }

    private func applySwiftHighlighting(to attributedString: NSMutableAttributedString, text: String) {
        // Keywords
        let keywords = ["func", "var", "let", "class", "struct", "enum", "protocol", "extension", "import", "if", "else", "for", "while", "switch", "case", "default", "return", "break", "continue", "public", "private", "internal", "static", "override", "init", "deinit"]
        for keyword in keywords {
            let pattern = "\\b\(keyword)\\b"
            highlightPattern(pattern, in: attributedString, color: .systemPurple)
        }

        // String literals
        let stringPattern = "\"([^\"\\\\]|\\\\.)*\""
        highlightPattern(stringPattern, in: attributedString, color: .systemRed)

        // Comments
        let commentPattern = "//.*$"
        highlightPattern(commentPattern, in: attributedString, color: .systemGreen, options: [.anchorsMatchLines])
    }

    private func applyXMLHighlighting(to attributedString: NSMutableAttributedString, text: String) {
        // XML tags
        let tagPattern = "<[^>]+>"
        highlightPattern(tagPattern, in: attributedString, color: .systemBlue)

        // XML tag names (element names)
        let elementPattern = "</?([A-Za-z][A-Za-z0-9_-]*)"
        highlightPattern(elementPattern, in: attributedString, color: .systemPurple)

        // Attribute names
        let attributePattern = "\\s([A-Za-z][A-Za-z0-9_-]*)="
        highlightPattern(attributePattern, in: attributedString, color: .systemOrange)

        // Attribute values
        let attributeValuePattern = "=\"([^\"]*)\""
        highlightPattern(attributeValuePattern, in: attributedString, color: .systemRed)

        // XML comments
        let commentPattern = "<!--[\\s\\S]*?-->"
        highlightPattern(commentPattern, in: attributedString, color: .systemGreen)

        // CDATA sections
        let cdataPattern = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>"
        highlightPattern(cdataPattern, in: attributedString, color: .systemGray, backgroundColor: .systemGray6)

        // XML declarations and processing instructions
        let processingInstructionPattern = "<\\?[\\s\\S]*?\\?>"
        highlightPattern(processingInstructionPattern, in: attributedString, color: .systemMint)
    }

    private func applyJavaScriptHighlighting(to attributedString: NSMutableAttributedString, text: String) {
        // Keywords
        let keywords = ["function", "var", "let", "const", "if", "else", "for", "while", "switch", "case", "default", "return", "break", "continue", "class", "extends", "import", "export", "try", "catch", "throw", "async", "await"]
        for keyword in keywords {
            let pattern = "\\b\(keyword)\\b"
            highlightPattern(pattern, in: attributedString, color: .systemPurple)
        }

        // String literals
        let stringPattern = "(\"([^\"\\\\]|\\\\.)*\"|'([^'\\\\]|\\\\.)*')"
        highlightPattern(stringPattern, in: attributedString, color: .systemRed)

        // Comments
        let commentPattern = "//.*$"
        highlightPattern(commentPattern, in: attributedString, color: .systemGreen, options: [.anchorsMatchLines])
    }

    private func applyJSONHighlighting(to attributedString: NSMutableAttributedString, text: String) {
        // Keys (strings followed by colon)
        let keyPattern = "\"([^\"\\\\]|\\\\.)*\"\\s*:"
        highlightPattern(keyPattern, in: attributedString, color: .systemBlue)

        // String values
        let stringPattern = ":\\s*\"([^\"\\\\]|\\\\.)*\""
        highlightPattern(stringPattern, in: attributedString, color: .systemRed)

        // Numbers
        let numberPattern = ":\\s*-?\\d+(\\.\\d+)?"
        highlightPattern(numberPattern, in: attributedString, color: .systemOrange)

        // Booleans and null
        let booleanPattern = ":\\s*(true|false|null)"
        highlightPattern(booleanPattern, in: attributedString, color: .systemPurple)
    }

    private func highlightPattern(
        _ pattern: String,
        in attributedString: NSMutableAttributedString,
        color: UIColor? = nil,
        backgroundColor: UIColor? = nil,
        font: UIFont? = nil,
        options: NSRegularExpression.Options = []
    ) {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return }

        let range = NSRange(location: 0, length: attributedString.length)
        regex.enumerateMatches(in: attributedString.string, options: [], range: range) { match, _, _ in
            guard let matchRange = match?.range else { return }

            if let color = color {
                attributedString.addAttribute(.foregroundColor, value: color, range: matchRange)
            }
            if let backgroundColor = backgroundColor {
                attributedString.addAttribute(.backgroundColor, value: backgroundColor, range: matchRange)
            }
            if let font = font {
                attributedString.addAttribute(.font, value: font, range: matchRange)
            }
        }
    }

    @objc private func textViewDidChange() {
        applySyntaxHighlighting()
        updateLineNumbers()
    }

    private func updateLineNumbers() {
        lineNumberView.updateLineNumbers(for: textView)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

public class LineNumberView: UIView {
    private let textView = UITextView()

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.backgroundColor = .clear
        textView.isEditable = false
        textView.isSelectable = false
        textView.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.textColor = .systemGray
        textView.textAlignment = .right
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 4, bottom: 8, right: 8)
        addSubview(textView)

        NSLayoutConstraint.activate([
            textView.leadingAnchor.constraint(equalTo: leadingAnchor),
            textView.topAnchor.constraint(equalTo: topAnchor),
            textView.trailingAnchor.constraint(equalTo: trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }

    public func updateLineNumbers(for mainTextView: UITextView) {
        let text = mainTextView.text ?? ""
        let lineCount = text.components(separatedBy: .newlines).count
        let lineNumbers = (1...lineCount).map { "\($0)" }.joined(separator: "\n")
        textView.text = lineNumbers
    }
}

// Supporting Types
public enum CodeLanguage: String, CaseIterable {
    case markdown = "markdown"
    case swift = "swift"
    case xml = "xml"
    case javascript = "javascript"
    case json = "json"
    case plaintext = "plaintext"

    public var displayName: String {
        switch self {
        case .markdown: return "Markdown"
        case .swift: return "Swift"
        case .xml: return "XML"
        case .javascript: return "JavaScript"
        case .json: return "JSON"
        case .plaintext: return "Plain Text"
        }
    }
}

public enum CodeEditorTheme: String, CaseIterable {
    case light = "light"
    case dark = "dark"
    case system = "system"

    public var displayName: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "System"
        }
    }
}