import UIKit
import Runestone

// MARK: - UITextField Extension

/// Extension to UITextField that provides convenient methods for adding and removing
/// a keyboard dismiss accessory view.
public extension UITextField {

    /// Adds a keyboard dismiss accessory view to the text field.
    ///
    /// This method creates and attaches a `KeyboardDismissAccessoryView` as the `inputAccessoryView`,
    /// allowing users to dismiss the keyboard with a dedicated button.
    ///
    /// - Parameters:
    ///   - height: The height of the accessory view. Defaults to `KeyboardDismissAccessoryView.defaultHeight`.
    ///   - onDismiss: Optional callback invoked when the dismiss button is tapped.
    ///
    /// Example:
    /// ```swift
    /// let textField = UITextField()
    /// textField.addDismissKeyboardAccessory()
    /// ```
    func addDismissKeyboardAccessory(
        height: CGFloat = KeyboardDismissAccessoryView.defaultHeight,
        onDismiss: (() -> Void)? = nil
    ) {
        // Reuse existing accessory if already present
        if let existingAccessory = inputAccessoryView as? KeyboardDismissAccessoryView {
            existingAccessory.targetResponder = self
            existingAccessory.onDismiss = onDismiss
            return
        }

        // Create new accessory if not present
        let accessory = KeyboardDismissAccessoryView(
            height: height,
            targetResponder: self,
            onDismiss: onDismiss
        )
        inputAccessoryView = accessory
    }

    /// Removes the keyboard dismiss accessory view from the text field.
    ///
    /// This method sets the `inputAccessoryView` to `nil`, only if it's our KeyboardDismissAccessoryView.
    ///
    /// Example:
    /// ```swift
    /// let textField = UITextField()
    /// textField.removeDismissKeyboardAccessory()
    /// ```
    func removeDismissKeyboardAccessory() {
        // Only remove if it's our KeyboardDismissAccessoryView
        if inputAccessoryView is KeyboardDismissAccessoryView {
            inputAccessoryView = nil
        }
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
    /// - Parameters:
    ///   - height: The height of the accessory view. Defaults to `KeyboardDismissAccessoryView.defaultHeight`.
    ///   - onDismiss: Optional callback invoked when the dismiss button is tapped.
    ///
    /// Example:
    /// ```swift
    /// let textView = UITextView()
    /// textView.addDismissKeyboardAccessory()
    /// ```
    func addDismissKeyboardAccessory(
        height: CGFloat = KeyboardDismissAccessoryView.defaultHeight,
        onDismiss: (() -> Void)? = nil
    ) {
        // Reuse existing accessory if already present
        if let existingAccessory = inputAccessoryView as? KeyboardDismissAccessoryView {
            existingAccessory.targetResponder = self
            existingAccessory.onDismiss = onDismiss
            return
        }

        // Create new accessory if not present
        let accessory = KeyboardDismissAccessoryView(
            height: height,
            targetResponder: self,
            onDismiss: onDismiss
        )
        inputAccessoryView = accessory
    }

    /// Removes the keyboard dismiss accessory view from the text view.
    ///
    /// This method sets the `inputAccessoryView` to `nil`, only if it's our KeyboardDismissAccessoryView.
    ///
    /// Example:
    /// ```swift
    /// let textView = UITextView()
    /// textView.removeDismissKeyboardAccessory()
    /// ```
    func removeDismissKeyboardAccessory() {
        // Only remove if it's our KeyboardDismissAccessoryView
        if inputAccessoryView is KeyboardDismissAccessoryView {
            inputAccessoryView = nil
        }
    }
}

// MARK: - Runestone TextView Extension

/// Extension to Runestone TextView that provides convenient methods for adding and removing
/// a keyboard dismiss accessory view.
public extension Runestone.TextView {

    /// Adds a keyboard dismiss accessory view to the text view.
    ///
    /// This method creates and attaches a `KeyboardDismissAccessoryView` as the `inputAccessoryView`,
    /// allowing users to dismiss the keyboard with a dedicated button.
    ///
    /// - Parameters:
    ///   - height: The height of the accessory view. Defaults to `KeyboardDismissAccessoryView.defaultHeight`.
    ///   - onDismiss: Optional callback invoked when the dismiss button is tapped.
    func addDismissKeyboardAccessory(
        height: CGFloat = KeyboardDismissAccessoryView.defaultHeight,
        onDismiss: (() -> Void)? = nil
    ) {
        // Reuse existing accessory if already present
        if let existingAccessory = inputAccessoryView as? KeyboardDismissAccessoryView {
            existingAccessory.targetResponder = self
            existingAccessory.onDismiss = onDismiss
            return
        }

        // Create new accessory if not present
        let accessory = KeyboardDismissAccessoryView(
            height: height,
            targetResponder: self,
            onDismiss: onDismiss
        )
        inputAccessoryView = accessory
    }

    /// Removes the keyboard dismiss accessory view from the text view.
    ///
    /// This method sets the `inputAccessoryView` to `nil`, only if it's our KeyboardDismissAccessoryView.
    func removeDismissKeyboardAccessory() {
        // Only remove if it's our KeyboardDismissAccessoryView
        if inputAccessoryView is KeyboardDismissAccessoryView {
            inputAccessoryView = nil
        }
    }
}
