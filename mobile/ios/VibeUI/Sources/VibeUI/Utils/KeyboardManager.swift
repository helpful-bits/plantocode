import UIKit

public final class KeyboardManager {
    public static let shared = KeyboardManager()
    private init() {}

    public func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        UIApplication.shared.endEditing(true)
    }
}

public extension UIApplication {
    func endEditing(_ force: Bool) {
        // Prefer connected scenes for modern multi-window correctness
        let keyWindow = connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        keyWindow?.endEditing(force)
    }
}
