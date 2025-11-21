import SwiftUI

public struct ConnectionStatusPill: View {
    public enum Style {
        case reconnecting
        case success
    }

    let style: Style
    let text: String

    public init(style: Style, text: String) {
        self.style = style
        self.text = text
    }

    public var body: some View {
        HStack(spacing: 8) {
            if style == .reconnecting {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                    .scaleEffect(0.7)
            }
            Text(text)
                .font(.footnote.weight(.medium))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(backgroundColor)
        .foregroundColor(.primary)
        .clipShape(Capsule())
        .shadow(radius: 2)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private var backgroundColor: Color {
        switch style {
        case .reconnecting:
            return Color.yellow.opacity(0.2)
        case .success:
            return Color.green.opacity(0.2)
        }
    }
}
