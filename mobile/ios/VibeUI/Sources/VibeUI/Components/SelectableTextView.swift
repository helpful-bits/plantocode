import SwiftUI
import UIKit
import Core

// MARK: - UITextView Wrapper with Selection Support

private class KeyCommandTextView: UITextView {
    var onUpArrow: (() -> Void)?
    var onDownArrow: (() -> Void)?

    override var keyCommands: [UIKeyCommand]? {
        var commands: [UIKeyCommand] = []

        if onUpArrow != nil {
            commands.append(UIKeyCommand(input: UIKeyCommand.inputUpArrow, modifierFlags: [], action: #selector(handleUpArrow)))
        }

        if onDownArrow != nil {
            commands.append(UIKeyCommand(input: UIKeyCommand.inputDownArrow, modifierFlags: [], action: #selector(handleDownArrow)))
        }

        return commands.isEmpty ? nil : commands
    }

    @objc private func handleUpArrow() {
        onUpArrow?()
    }

    @objc private func handleDownArrow() {
        onDownArrow?()
    }
}

public struct SelectableTextView: UIViewRepresentable {
    @Binding var text: String
    @Binding var selectedRange: NSRange
    @Binding var forceApplySelection: Bool
    @Binding var isEditing: Bool

    let placeholder: String
    let onInteraction: () -> Void
    let singleLine: Bool
    let onSubmit: (() -> Void)?
    let onUpArrow: (() -> Void)?
    let onDownArrow: (() -> Void)?
    let textColor: UIColor?
    let backgroundColor: UIColor?
    let font: UIFont?

    public init(
        text: Binding<String>,
        selectedRange: Binding<NSRange>,
        forceApplySelection: Binding<Bool>,
        isEditing: Binding<Bool>,
        placeholder: String,
        onInteraction: @escaping () -> Void,
        singleLine: Bool = false,
        onSubmit: (() -> Void)? = nil,
        onUpArrow: (() -> Void)? = nil,
        onDownArrow: (() -> Void)? = nil,
        textColor: UIColor? = nil,
        backgroundColor: UIColor? = nil,
        font: UIFont? = nil
    ) {
        self._text = text
        self._selectedRange = selectedRange
        self._forceApplySelection = forceApplySelection
        self._isEditing = isEditing
        self.placeholder = placeholder
        self.onInteraction = onInteraction
        self.singleLine = singleLine
        self.onSubmit = onSubmit
        self.onUpArrow = onUpArrow
        self.onDownArrow = onDownArrow
        self.textColor = textColor
        self.backgroundColor = backgroundColor
        self.font = font
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(self, isEditing: $isEditing)
    }

    private func scrollToCursorIfNeeded(in textView: UITextView, coordinator: Coordinator) {
        // Early exit if content fits entirely within bounds
        if textView.contentSize.height <= textView.bounds.height { return }

        guard let selectedTextRange = textView.selectedTextRange else { return }

        let caretRect = textView.caretRect(for: selectedTextRange.end)

        let contentInset = textView.contentInset
        let bounds = textView.bounds

        let visibleHeight = bounds.height - contentInset.top - contentInset.bottom
        if visibleHeight <= 0 { return }

        let visibleTop = textView.contentOffset.y + contentInset.top
        let visibleBottom = visibleTop + visibleHeight

        // Allow a comfortable band before scrolling
        let padding: CGFloat = 16

        // If caret already comfortably visible, do nothing
        if caretRect.minY >= visibleTop + padding &&
           caretRect.maxY <= visibleBottom - padding {
            return
        }

        // Compute min / max offsets
        let minOffsetY = -contentInset.top
        let maxOffsetY = max(
            -contentInset.top,
            textView.contentSize.height - bounds.height + contentInset.bottom
        )

        var targetOffsetY = textView.contentOffset.y

        if caretRect.maxY > visibleBottom - padding {
            // caret is below visible area – scroll just enough up
            targetOffsetY += (caretRect.maxY - (visibleBottom - padding))
        } else if caretRect.minY < visibleTop + padding {
            // caret is above visible area – scroll just enough down
            targetOffsetY -= ((visibleTop + padding) - caretRect.minY)
        }

        // Clamp targetOffsetY between min and max before applying
        targetOffsetY = min(max(targetOffsetY, minOffsetY), maxOffsetY)

        guard abs(targetOffsetY - textView.contentOffset.y) > 0.5 else { return }

        UIView.performWithoutAnimation {
            textView.setContentOffset(
                CGPoint(x: textView.contentOffset.x, y: targetOffsetY),
                animated: false
            )
        }
    }

    public func makeUIView(context: Context) -> UITextView {
        let textView = KeyCommandTextView()
        textView.font = font ?? UIFont.preferredFont(forTextStyle: .body)
        textView.textColor = textColor ?? UIColor(Color.textPrimary)
        textView.backgroundColor = backgroundColor ?? UIColor(Color.inputBackground)

        // Only apply border styling if custom background is not provided
        if backgroundColor == nil {
            textView.layer.cornerRadius = Theme.Radii.base
            textView.layer.borderWidth = 1
            textView.layer.borderColor = UIColor(Color.border).cgColor
        }

        textView.delegate = context.coordinator
        textView.autocapitalizationType = .sentences
        textView.autocorrectionType = .yes
        textView.spellCheckingType = .yes
        textView.keyboardType = .default
        textView.textAlignment = .left
        textView.isEditable = true
        textView.isSelectable = true
        textView.delaysContentTouches = false
        textView.canCancelContentTouches = true

        if singleLine {
            // Single-line mode: minimal insets and no scrolling
            textView.isScrollEnabled = false
            textView.textContainerInset = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
            textView.returnKeyType = .send
            textView.textContainer.maximumNumberOfLines = 1
            textView.textContainer.lineBreakMode = .byTruncatingTail
            textView.textContainer.lineFragmentPadding = 0
        } else {
            // Multi-line mode: normal insets and scrolling enabled
            textView.isScrollEnabled = true
            textView.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
            textView.returnKeyType = .default
        }

        textView.onUpArrow = onUpArrow
        textView.onDownArrow = onDownArrow

        context.coordinator.textView = textView

        textView.addDismissKeyboardAccessory()

        return textView
    }

    public func updateUIView(_ uiView: UITextView, context: Context) {
        // Store reference to textView in coordinator
        context.coordinator.textView = uiView

        // Update border color dynamically to respond to color scheme changes
        if backgroundColor == nil {
            uiView.layer.borderColor = UIColor(Color.border).cgColor
        }

        let forceTextUpdate = forceApplySelection
        if singleLine {
            let sanitizedText = text.replacingOccurrences(of: "\n", with: " ")
            if uiView.text != sanitizedText {
                uiView.text = sanitizedText
            }
        } else {
            // Only update text if not actively editing to prevent cursor jumps
            if uiView.text != text && (!context.coordinator.isUserEditing && !context.coordinator.isUserTyping || forceTextUpdate) {
                uiView.text = text
            }
        }

        // Handle force-apply selection (for voice transcription)
        if forceApplySelection {
            // Clamp the range to valid bounds
            let textLength = uiView.text.count
            let clampedLocation = min(max(0, selectedRange.location), textLength)
            let maxLength = textLength - clampedLocation
            let clampedLength = min(max(0, selectedRange.length), maxLength)
            let clampedRange = NSRange(location: clampedLocation, length: clampedLength)

            uiView.selectedRange = clampedRange

            // Scroll to show the cursor, accounting for keyboard and content insets
            scrollToCursorIfNeeded(in: uiView, coordinator: context.coordinator)

            // Reset the flag
            DispatchQueue.main.async {
                self.forceApplySelection = false
            }
        } else {
            // Update selection if it changed programmatically (not during user editing or typing)
            // This prevents cursor jumps when remote updates arrive during active typing
            let coordinator = context.coordinator
            let shouldPreserveSelection = coordinator.isUserEditing || coordinator.isUserTyping || coordinator.isFocused
            if !shouldPreserveSelection && (uiView.selectedRange.location != selectedRange.location || uiView.selectedRange.length != selectedRange.length) {
                // Validate range before setting
                let textLength = (uiView.text as NSString).length
                if selectedRange.location != NSNotFound && selectedRange.location <= textLength {
                    let validLength = min(selectedRange.length, textLength - selectedRange.location)
                    uiView.selectedRange = NSRange(location: selectedRange.location, length: validLength)

                    // Don't scroll for programmatic changes - let UITextView handle it naturally
                    // This prevents viewport jumps during undo/redo/remote updates
                }
            }
        }

        // Update placeholder visibility
        if text.isEmpty {
            if uiView.subviews.first(where: { $0.tag == 999 }) == nil {
                let placeholderLabel = UILabel()
                placeholderLabel.text = placeholder
                placeholderLabel.font = font ?? UIFont.preferredFont(forTextStyle: .body)
                placeholderLabel.textColor = UIColor(Color.inputPlaceholder)
                placeholderLabel.tag = 999
                placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
                uiView.addSubview(placeholderLabel)

                // Use appropriate positioning based on single-line vs multi-line
                let topConstant: CGFloat = singleLine ? 8 : 16
                let leadingConstant: CGFloat = singleLine ? 12 : 16

                NSLayoutConstraint.activate([
                    placeholderLabel.topAnchor.constraint(equalTo: uiView.topAnchor, constant: topConstant),
                    placeholderLabel.leadingAnchor.constraint(equalTo: uiView.leadingAnchor, constant: leadingConstant)
                ])
            }
        } else {
            uiView.subviews.first(where: { $0.tag == 999 })?.removeFromSuperview()
        }

        // Ensure keyboard dismiss accessory remains attached
        if uiView.inputAccessoryView == nil {
            uiView.addDismissKeyboardAccessory()
        }
    }

    public class Coordinator: NSObject, UITextViewDelegate {
        var parent: SelectableTextView
        weak var textView: UITextView?
        var isUserEditing: Bool = false
        var isFocused: Bool = false
        var isUserTyping: Bool = false
        var typingIdleTimer: Timer?
        var isEditingBinding: Binding<Bool>

        init(_ parent: SelectableTextView, isEditing: Binding<Bool>) {
            self.parent = parent
            self.isEditingBinding = isEditing
            super.init()
        }

        deinit {
            typingIdleTimer?.invalidate()
        }

        public func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            if parent.singleLine {
                if text == "\n" {
                    parent.onSubmit?()
                    return false
                }

                if text.contains("\n") {
                    let sanitized = text.replacingOccurrences(of: "\n", with: " ")
                    let currentText = textView.text as NSString
                    let newText = currentText.replacingCharacters(in: range, with: sanitized)

                    DispatchQueue.main.async { [weak self] in
                        self?.parent.text = newText
                    }
                    return false
                }
            }

            return true
        }

        public func textViewDidChange(_ textView: UITextView) {
            self.textView = textView
            isUserEditing = true
            isUserTyping = true

            // Reset typing flag after 200ms idle (matching desktop behavior)
            typingIdleTimer?.invalidate()
            typingIdleTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: false) { [weak self] _ in
                self?.isUserTyping = false
            }

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.parent.text = textView.text
                self.parent.onInteraction()

                // Reset editing flag after update
                DispatchQueue.main.async {
                    self.isUserEditing = false
                }
            }
        }

        public func textViewDidChangeSelection(_ textView: UITextView) {
            self.textView = textView
            isUserEditing = true

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.parent.selectedRange = textView.selectedRange

                // Reset flag after update
                DispatchQueue.main.async {
                    self.isUserEditing = false
                }
            }
        }

        public func textViewDidBeginEditing(_ textView: UITextView) {
            isFocused = true
            DispatchQueue.main.async { [weak self] in
                self?.isEditingBinding.wrappedValue = true
            }
        }

        public func textViewDidEndEditing(_ textView: UITextView) {
            isFocused = false
            isUserTyping = false
            typingIdleTimer?.invalidate()
            typingIdleTimer = nil
            DispatchQueue.main.async { [weak self] in
                self?.isEditingBinding.wrappedValue = false
            }
        }

        @objc func dismissKeyboard() {
            textView?.resignFirstResponder()
        }
    }
}
