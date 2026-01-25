import SwiftUI
import Combine

/// ViewModifier that adjusts view padding based on keyboard visibility
/// Listens to UIKeyboardWillShow/Hide notifications and applies bottom padding
/// with smooth animation to prevent keyboard from covering input fields
public struct KeyboardAwareModifier: ViewModifier {
    @State private var keyboardHeight: CGFloat = 0
    @State private var willShowObserver: NSObjectProtocol?
    @State private var willHideObserver: NSObjectProtocol?

    public init() {}

    public func body(content: Content) -> some View {
        content
            .padding(.bottom, keyboardHeight)
            .onAppear {
                willShowObserver = NotificationCenter.default.addObserver(
                    forName: UIResponder.keyboardWillShowNotification,
                    object: nil,
                    queue: .main
                ) { notification in
                    guard let keyboardFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
                        return
                    }

                    let animationDuration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25

                    withAnimation(.easeOut(duration: animationDuration)) {
                        // Use keyboard height directly since accessory is now minimal (1pt)
                        keyboardHeight = keyboardFrame.height
                    }
                }

                willHideObserver = NotificationCenter.default.addObserver(
                    forName: UIResponder.keyboardWillHideNotification,
                    object: nil,
                    queue: .main
                ) { notification in
                    let animationDuration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double ?? 0.25

                    withAnimation(.easeOut(duration: animationDuration)) {
                        keyboardHeight = 0
                    }
                }
            }
            .onDisappear {
                if let observer = willShowObserver {
                    NotificationCenter.default.removeObserver(observer)
                    willShowObserver = nil
                }
                if let observer = willHideObserver {
                    NotificationCenter.default.removeObserver(observer)
                    willHideObserver = nil
                }
            }
    }
}

// MARK: - View Extension

public extension View {
    /// Applies keyboard-aware padding that adjusts when keyboard appears/disappears
    /// - Returns: Modified view with dynamic bottom padding based on keyboard height
    func keyboardAware() -> some View {
        self.modifier(KeyboardAwareModifier())
    }
}

// MARK: - Advanced Keyboard Observer (for more control)

/// Publisher-based keyboard observer for reactive keyboard handling
public class KeyboardObserver: ObservableObject {
    @Published public var keyboardHeight: CGFloat = 0
    @Published public var keyboardFrame: CGRect = .zero
    @Published public var isKeyboardVisible: Bool = false

    private var cancellables = Set<AnyCancellable>()

    public init() {
        let center = NotificationCenter.default

        // Listen for keyboard show / frame changes
        center.publisher(for: UIResponder.keyboardWillShowNotification)
            .merge(with: center.publisher(for: UIResponder.keyboardWillChangeFrameNotification))
            .compactMap { notification -> (frame: CGRect, duration: Double)? in
                guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
                    return nil
                }
                let duration = (notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
                return (frame, duration)
            }
            .sink { [weak self] value in
                withAnimation(.easeOut(duration: value.duration)) {
                    self?.keyboardFrame = value.frame
                    self?.keyboardHeight = value.frame.height
                    self?.isKeyboardVisible = value.frame.height > 0
                }
            }
            .store(in: &cancellables)

        // Listen for keyboard hide
        center.publisher(for: UIResponder.keyboardWillHideNotification)
            .sink { [weak self] notification in
                let duration = (notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
                withAnimation(.easeOut(duration: duration)) {
                    self?.keyboardFrame = .zero
                    self?.keyboardHeight = 0
                    self?.isKeyboardVisible = false
                }
            }
            .store(in: &cancellables)
    }
}

// MARK: - Environment Key for Keyboard Height

private struct KeyboardHeightKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

public extension EnvironmentValues {
    var keyboardHeight: CGFloat {
        get { self[KeyboardHeightKey.self] }
        set { self[KeyboardHeightKey.self] = newValue }
    }
}
