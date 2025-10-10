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
    @Published public var isKeyboardVisible: Bool = false

    private var cancellables = Set<AnyCancellable>()

    public init() {
        // Listen for keyboard show
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .compactMap { notification -> CGFloat? in
                (notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect)?.height
            }
            .sink { [weak self] height in
                withAnimation(.easeOut(duration: 0.25)) {
                    self?.keyboardHeight = height
                    self?.isKeyboardVisible = true
                }
            }
            .store(in: &cancellables)

        // Listen for keyboard hide
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .sink { [weak self] _ in
                withAnimation(.easeOut(duration: 0.25)) {
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
