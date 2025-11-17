import UIKit

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

    /// The default height for the accessory view.
    public static let defaultHeight: CGFloat = 44

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
    ///   - targetResponder: The responder that should resign first responder when dismissed.
    ///   - height: The height of the accessory view. Defaults to `defaultHeight`.
    public init(attachedTo targetResponder: UIResponder, height: CGFloat = defaultHeight, onDismiss: (() -> Void)? = nil) {
        self.targetResponder = targetResponder
        self.baseHeight = height
        self.onDismiss = onDismiss

        // Use .systemMaterial for automatic Dark/Light mode adaptation
        let blurEffect = UIBlurEffect(style: .systemMaterial)
        self.blurEffectView = UIVisualEffectView(effect: blurEffect)

        // Create dismiss button with SF Symbol
        self.dismissButton = UIButton(type: .system)

        // Initialize as UIInputView with keyboard style
        super.init(frame: .zero, inputViewStyle: .keyboard)

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
        // Add blur effect view as background
        blurEffectView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(blurEffectView)

        // Configure dismiss button
        if let image = UIImage(systemName: "keyboard.chevron.compact.down") {
            let templateImage = image.withRenderingMode(.alwaysTemplate)
            dismissButton.setImage(templateImage, for: .normal)
        }
        dismissButton.tintColor = .label
        dismissButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        dismissButton.translatesAutoresizingMaskIntoConstraints = false

        // Use target/action pattern to avoid retain cycles
        dismissButton.addTarget(self, action: #selector(dismissButtonTapped), for: .touchUpInside)

        addSubview(dismissButton)
    }

    private func setupConstraints() {
        NSLayoutConstraint.activate([
            // Blur effect view fills entire accessory view
            blurEffectView.topAnchor.constraint(equalTo: topAnchor),
            blurEffectView.leadingAnchor.constraint(equalTo: leadingAnchor),
            blurEffectView.trailingAnchor.constraint(equalTo: trailingAnchor),
            blurEffectView.bottomAnchor.constraint(equalTo: bottomAnchor),

            // Position button in top-right corner with safe area
            dismissButton.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 8),
            dismissButton.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -8),

            // Minimum 44x44 size for tap target (iOS Human Interface Guidelines)
            dismissButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44),
            dismissButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
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
    ///
    /// The intrinsic content size adjusts for accessibility text sizes to ensure
    /// the button remains tappable when the user has increased text size.
    public override var intrinsicContentSize: CGSize {
        let adjustedHeight = calculateAdjustedHeight()
        return CGSize(width: UIView.noIntrinsicMetric, height: adjustedHeight)
    }

    /// Called when the trait collection changes, typically for Dark Mode or Dynamic Type changes.
    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)

        // Invalidate intrinsic content size when content size category changes
        if previousTraitCollection?.preferredContentSizeCategory != traitCollection.preferredContentSizeCategory {
            invalidateIntrinsicContentSize()
        }
    }

    // MARK: - Private Methods

    /// Calculates the adjusted height based on the current content size category.
    ///
    /// For accessibility text sizes (larger than .extraExtraLarge), the height is increased
    /// to accommodate larger tap targets and maintain usability.
    private func calculateAdjustedHeight() -> CGFloat {
        let contentSizeCategory = traitCollection.preferredContentSizeCategory

        if contentSizeCategory.isAccessibilityCategory {
            // Increase height for accessibility sizes
            return baseHeight * 1.2
        } else if contentSizeCategory >= .extraExtraLarge {
            // Slightly increase for large non-accessibility sizes
            return baseHeight * 1.1
        } else {
            return baseHeight
        }
    }
}
