import SwiftUI
import UIKit

/// A SwiftUI TextEditor wrapper that adds keyboard dismissal accessory
///
/// This bridges SwiftUI TextEditor to UITextView so we can attach the keyboard dismiss accessory.
/// Use this instead of plain TextEditor when you want consistent keyboard dismissal UX.
public struct DismissableTextEditor: UIViewRepresentable {
    @Binding var text: String
    var font: UIFont?
    var textColor: UIColor?
    var backgroundColor: UIColor?
    var autocapitalization: UITextAutocapitalizationType
    var autocorrection: UITextAutocorrectionType

    public init(
        text: Binding<String>,
        font: UIFont? = nil,
        textColor: UIColor? = nil,
        backgroundColor: UIColor? = nil,
        autocapitalization: UITextAutocapitalizationType = .sentences,
        autocorrection: UITextAutocorrectionType = .default
    ) {
        self._text = text
        self.font = font
        self.textColor = textColor
        self.backgroundColor = backgroundColor
        self.autocapitalization = autocapitalization
        self.autocorrection = autocorrection
    }

    public func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.font = font ?? .systemFont(ofSize: 14)
        textView.textColor = textColor ?? UIColor(Color.textPrimary)
        textView.backgroundColor = backgroundColor ?? UIColor(Color.inputBackground)
        textView.autocapitalizationType = autocapitalization
        textView.autocorrectionType = autocorrection
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        // Add keyboard dismiss accessory
        textView.addDismissKeyboardAccessory()

        return textView
    }

    public func updateUIView(_ uiView: UITextView, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }

        // Ensure accessory persists
        if uiView.inputAccessoryView == nil {
            uiView.addDismissKeyboardAccessory()
        }

        // Update styling if changed
        if let font = font, uiView.font != font {
            uiView.font = font
        }
        if let textColor = textColor, uiView.textColor != textColor {
            uiView.textColor = textColor
        }
        if let backgroundColor = backgroundColor, uiView.backgroundColor != backgroundColor {
            uiView.backgroundColor = backgroundColor
        }
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    public class Coordinator: NSObject, UITextViewDelegate {
        var parent: DismissableTextEditor

        init(_ parent: DismissableTextEditor) {
            self.parent = parent
        }

        public func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
        }
    }
}
