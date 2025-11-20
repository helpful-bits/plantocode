import SwiftUI
import UIKit

/// A SwiftUI TextField wrapper that adds keyboard dismissal accessory
///
/// This bridges SwiftUI TextField to UITextField so we can attach the keyboard dismiss accessory.
/// Use this instead of plain TextField when you want consistent keyboard dismissal UX.
public struct DismissableTextField: UIViewRepresentable {
    var placeholder: String
    @Binding var text: String
    var font: UIFont?
    var textColor: UIColor?
    var autocapitalization: UITextAutocapitalizationType
    var autocorrection: UITextAutocorrectionType
    var onSubmit: (() -> Void)?

    public init(
        _ placeholder: String,
        text: Binding<String>,
        font: UIFont? = nil,
        textColor: UIColor? = nil,
        autocapitalization: UITextAutocapitalizationType = .sentences,
        autocorrection: UITextAutocorrectionType = .default,
        onSubmit: (() -> Void)? = nil
    ) {
        self.placeholder = placeholder
        self._text = text
        self.font = font
        self.textColor = textColor
        self.autocapitalization = autocapitalization
        self.autocorrection = autocorrection
        self.onSubmit = onSubmit
    }

    public func makeUIView(context: Context) -> UITextField {
        let textField = UITextField()
        textField.delegate = context.coordinator
        textField.placeholder = placeholder
        textField.font = font ?? .systemFont(ofSize: 17)
        textField.textColor = textColor ?? UIColor(Color.textPrimary)
        textField.backgroundColor = UIColor(Color.inputBackground)
        textField.autocapitalizationType = autocapitalization
        textField.autocorrectionType = autocorrection
        textField.borderStyle = .none
        textField.returnKeyType = .done

        // Set placeholder color
        textField.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor(Color.inputPlaceholder)]
        )

        // Set proper content hugging and compression resistance for single-line behavior
        textField.setContentHuggingPriority(.defaultHigh, for: .vertical)
        textField.setContentCompressionResistancePriority(.required, for: .vertical)

        // Add keyboard dismiss accessory
        textField.addDismissKeyboardAccessory()

        return textField
    }

    public func updateUIView(_ uiView: UITextField, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }

        // Ensure accessory persists
        if uiView.inputAccessoryView == nil {
            uiView.addDismissKeyboardAccessory()
        }

        // Update styling if changed
        uiView.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor(Color.inputPlaceholder)]
        )
        if let font = font, uiView.font != font {
            uiView.font = font
        }
        if let textColor = textColor, uiView.textColor != textColor {
            uiView.textColor = textColor
        }
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    public class Coordinator: NSObject, UITextFieldDelegate {
        var parent: DismissableTextField

        init(_ parent: DismissableTextField) {
            self.parent = parent
        }

        public func textFieldDidChangeSelection(_ textField: UITextField) {
            parent.text = textField.text ?? ""
        }

        public func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            parent.onSubmit?()
            textField.resignFirstResponder()
            return true
        }
    }
}
