import SwiftUI

public struct PrimaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.primary)
            .foregroundColor(Color.primaryForeground)
            .cornerRadius(8)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

public struct SecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.muted.opacity(0.5))
            .foregroundColor(Color.foreground)
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

public struct CompactButtonStyle: ButtonStyle {
    let backgroundColor: Color
    let foregroundColor: Color

    public init(backgroundColor: Color = Color.muted, foregroundColor: Color = Color.foreground) {
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(backgroundColor)
            .foregroundColor(foregroundColor)
            .cornerRadius(6)
            .opacity(configuration.isPressed ? 0.9 : 1.0)
    }
}

public struct SelectableCardButtonStyle: ButtonStyle {
    let isSelected: Bool

    public init(isSelected: Bool = false) {
        self.isSelected = isSelected
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(16)
            .background(isSelected ? Color.primary.opacity(0.1) : Color.card)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.primary : Color.border, lineWidth: 1)
            )
            .cornerRadius(8)
            .opacity(configuration.isPressed ? 0.95 : 1.0)
    }
}
