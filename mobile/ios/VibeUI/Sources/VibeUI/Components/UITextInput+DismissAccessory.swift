import UIKit

// MARK: - UITextField Extension

/// Extension to UITextField that provides convenient methods for adding and removing
/// a keyboard dismiss accessory view.
public extension UITextField {

    /// Adds a keyboard dismiss accessory view to the text field.
    ///
    /// This method creates and attaches a `KeyboardDismissAccessoryView` as the `inputAccessoryView`,
    /// allowing users to dismiss the keyboard with a dedicated button.
    ///
    /// - Parameter height: The height of the accessory view. Defaults to `KeyboardDismissAccessoryView.defaultHeight`.
    ///
    /// Example:
    /// ```swift
    /// let textField = UITextField()
    /// textField.addDismissKeyboardAccessory()
    /// ```
    func addDismissKeyboardAccessory(height: CGFloat = KeyboardDismissAccessoryView.defaultHeight) {
        let accessoryView = KeyboardDismissAccessoryView(attachedTo: self, height: height)
        inputAccessoryView = accessoryView
    }

    /// Removes the keyboard dismiss accessory view from the text field.
    ///
    /// This method sets the `inputAccessoryView` to `nil`, removing any previously attached
    /// keyboard accessory view.
    ///
    /// Example:
    /// ```swift
    /// let textField = UITextField()
    /// textField.removeDismissKeyboardAccessory()
    /// ```
    func removeDismissKeyboardAccessory() {
        inputAccessoryView = nil
    }
}

// MARK: - UITextView Extension

/// Extension to UITextView that provides convenient methods for adding and removing
/// a keyboard dismiss accessory view.
public extension UITextView {

    /// Adds a keyboard dismiss accessory view to the text view.
    ///
    /// This method creates and attaches a `KeyboardDismissAccessoryView` as the `inputAccessoryView`,
    /// allowing users to dismiss the keyboard with a dedicated button.
    ///
    /// - Parameter height: The height of the accessory view. Defaults to `KeyboardDismissAccessoryView.defaultHeight`.
    ///
    /// Example:
    /// ```swift
    /// let textView = UITextView()
    /// textView.addDismissKeyboardAccessory()
    /// ```
    func addDismissKeyboardAccessory(height: CGFloat = KeyboardDismissAccessoryView.defaultHeight) {
        let accessoryView = KeyboardDismissAccessoryView(attachedTo: self, height: height)
        inputAccessoryView = accessoryView
    }

    /// Removes the keyboard dismiss accessory view from the text view.
    ///
    /// This method sets the `inputAccessoryView` to `nil`, removing any previously attached
    /// keyboard accessory view.
    ///
    /// Example:
    /// ```swift
    /// let textView = UITextView()
    /// textView.removeDismissKeyboardAccessory()
    /// ```
    func removeDismissKeyboardAccessory() {
        inputAccessoryView = nil
    }
}
