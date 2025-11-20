import UIKit
import SwiftUI

/// A reusable keyboard accessory view that provides a dismiss button to hide the keyboard.
///
/// This view is designed to be attached to text input controls (UITextField, UITextView) as an
/// `inputAccessoryView`. It automatically adapts to Dark/Light mode and dynamic type sizes.
///
/// Example usage:
/// ```swift
/// let textField = UITextField()
/// textField.addDismissKeyboardAccessory()
/// ```
public final class KeyboardDismissAccessoryView: UIInputView {

    // MARK: - Public Properties

    /// The default height for the accessory view (minimal to be invisible)
    public static let defaultHeight: CGFloat = 1

    /// The target responder that will resign first responder status when the dismiss button is tapped.
    /// This is a weak reference to avoid retain cycles.
    public weak var targetResponder: UIResponder?

    /// Optional callback invoked when the dismiss button is tapped
    public var onDismiss: (() -> Void)?

    // MARK: - Private Properties

    private let blurEffectView: UIVisualEffectView
    private let dismissButton: UIButton
    private let baseHeight: CGFloat

    // MARK: - Initialization

    /// Creates a new keyboard dismiss accessory view.
    ///
    /// - Parameters:
    ///   - height: The height of the accessory view. Defaults to `defaultHeight`.
    ///   - targetResponder: The responder that should resign first responder when dismissed.
    ///   - onDismiss: Optional callback invoked when the dismiss button is tapped.
    public init(
        height: CGFloat = KeyboardDismissAccessoryView.defaultHeight,
        targetResponder: UIResponder? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.targetResponder = targetResponder
        self.baseHeight = height
        self.onDismiss = onDismiss

        // Use .systemMaterial for automatic Dark/Light mode adaptation
        let blurEffect = UIBlurEffect(style: .systemMaterial)
        self.blurEffectView = UIVisualEffectView(effect: blurEffect)

        // Create dismiss button with SF Symbol
        self.dismissButton = UIButton(type: .system)

        // Initialize as UIInputView with keyboard style
        let initialFrame = CGRect(x: 0, y: 0, width: UIScreen.main.bounds.width, height: height)
        super.init(frame: initialFrame, inputViewStyle: .keyboard)

        setupViews()
        setupConstraints()
        setupAccessibility()
    }

    required init?(coder: NSCoder) {
        self.targetResponder = nil
        self.baseHeight = Self.defaultHeight
        self.onDismiss = nil

        let blurEffect = UIBlurEffect(style: .systemMaterial)
        self.blurEffectView = UIVisualEffectView(effect: blurEffect)
        self.dismissButton = UIButton(type: .system)

        super.init(coder: coder)

        setupViews()
        setupConstraints()
        setupAccessibility()
    }

    // MARK: - Setup

    private func setupViews() {
        backgroundColor = .clear

        // Configure blur effect view - make it invisible
        blurEffectView.translatesAutoresizingMaskIntoConstraints = false
        blurEffectView.isUserInteractionEnabled = false
        blurEffectView.alpha = 0

        // Configure dismiss button
        // Use "keyboard.chevron.compact.down" if available (iOS 14+), fallback to "chevron.down"
        let iconName = UIImage(systemName: "keyboard.chevron.compact.down") != nil
            ? "keyboard.chevron.compact.down"
            : "chevron.down"
        if let image = UIImage(systemName: iconName) {
            let templateImage = image.withRenderingMode(.alwaysTemplate)
            dismissButton.setImage(templateImage, for: .normal)
        }
        dismissButton.tintColor = .label
        dismissButton.backgroundColor = UIColor(Color.inputBackground)
        dismissButton.layer.cornerRadius = 8
        dismissButton.translatesAutoresizingMaskIntoConstraints = false
        dismissButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        // Use target/action pattern to avoid retain cycles
        dismissButton.addTarget(self, action: #selector(dismissButtonTapped), for: .touchUpInside)

        // Add blur first, then button on top
        addSubview(blurEffectView)
        addSubview(dismissButton)
    }

    private func setupConstraints() {
        // Set margins for layout
        directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 12, bottom: 0, trailing: 12)

        NSLayoutConstraint.activate([
            // Blur effect view fills entire accessory view (but invisible)
            blurEffectView.topAnchor.constraint(equalTo: topAnchor),
            blurEffectView.leadingAnchor.constraint(equalTo: leadingAnchor),
            blurEffectView.trailingAnchor.constraint(equalTo: trailingAnchor),
            blurEffectView.bottomAnchor.constraint(equalTo: bottomAnchor),

            // Position dismiss button ABOVE the accessory bar (floating)
            dismissButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            dismissButton.bottomAnchor.constraint(equalTo: topAnchor, constant: -8),
            dismissButton.widthAnchor.constraint(equalToConstant: 44),
            dismissButton.heightAnchor.constraint(equalToConstant: 44)
        ])
    }

    // Allow taps on the dismiss button even though it's outside the accessory bounds
    public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let buttonFrame = dismissButton.frame
        if buttonFrame.contains(point) {
            return dismissButton
        }
        return super.hitTest(point, with: event)
    }

    public override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        // Extend hit area to include the dismiss button
        let buttonFrame = dismissButton.frame
        if buttonFrame.contains(point) {
            return true
        }
        return super.point(inside: point, with: event)
    }

    private func setupAccessibility() {
        dismissButton.accessibilityLabel = "Dismiss Keyboard"
        dismissButton.accessibilityHint = "Hides the keyboard"
        dismissButton.accessibilityTraits = .button
    }

    // MARK: - Actions

    @objc private func dismissButtonTapped() {
        targetResponder?.resignFirstResponder()
        onDismiss?()
    }

    // MARK: - Overrides

    /// Returns the natural size for the receiving view.
    public override var intrinsicContentSize: CGSize {
        return CGSize(width: UIView.noIntrinsicMetric, height: baseHeight)
    }
}
