import SwiftUI

// MARK: - Card State

public enum CardState {
    case normal
    case selected
    case currentContext
    case success
    case destructive
    case warning
}

// MARK: - Card Container Style

public struct CardContainerStyle: ViewModifier {
    let state: CardState
    let cornerRadius: CGFloat
    let addShadow: Bool

    public init(state: CardState, cornerRadius: CGFloat = Theme.Radii.base, addShadow: Bool = true) {
        self.state = state
        self.cornerRadius = cornerRadius
        self.addShadow = addShadow
    }

    public func body(content: Content) -> some View {
        content
            .background(backgroundColor)
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(borderColor, lineWidth: borderWidth)
            )
            .if(addShadow) { view in
                view.shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 1)
            }
    }

    private var backgroundColor: Color {
        switch state {
        case .normal:
            return Color.surfacePrimary
        case .selected:
            return Color.selectionBackground
        case .currentContext:
            return Color.subtleHighlight
        case .success:
            return Color.successBackground
        case .destructive:
            return Color.destructiveBackground
        case .warning:
            return Color.warningBackground
        }
    }

    private var borderColor: Color {
        switch state {
        case .normal:
            return Color.border
        case .selected:
            return Color.primary
        case .currentContext:
            return Color.border
        case .success:
            return Color.successBorder
        case .destructive:
            return Color.destructiveBorder
        case .warning:
            return Color.warningBorder
        }
    }

    private var borderWidth: CGFloat {
        switch state {
        case .normal, .currentContext:
            return 1
        case .selected, .success, .destructive, .warning:
            return 2
        }
    }
}

// MARK: - View Extensions

public extension View {
    func cardContainer(
        state: CardState = .normal,
        cornerRadius: CGFloat = Theme.Radii.base,
        addShadow: Bool = true
    ) -> some View {
        self.modifier(CardContainerStyle(state: state, cornerRadius: cornerRadius, addShadow: addShadow))
    }

    func selectableCard(
        isSelected: Bool = false,
        isCurrentContext: Bool = false,
        isSuccess: Bool = false,
        isDestructive: Bool = false,
        isWarning: Bool = false,
        cornerRadius: CGFloat = Theme.Radii.base,
        addShadow: Bool = true
    ) -> some View {
        let state: CardState
        if isCurrentContext {
            state = .currentContext
        } else if isSuccess {
            state = .success
        } else if isDestructive {
            state = .destructive
        } else if isWarning {
            state = .warning
        } else if isSelected {
            state = .selected
        } else {
            state = .normal
        }

        return self.modifier(CardContainerStyle(state: state, cornerRadius: cornerRadius, addShadow: addShadow))
    }
}

// Helper extension for conditional view modifiers
extension View {
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
