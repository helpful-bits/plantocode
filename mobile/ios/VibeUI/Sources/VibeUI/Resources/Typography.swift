import SwiftUI

public struct H1Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 36, weight: .heavy))
            .tracking(-0.5)
            .foregroundColor(.textPrimary)
    }
}

public struct H2Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 30, weight: .semibold))
            .foregroundColor(.textPrimary)
    }
}

public struct H3Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 24, weight: .semibold))
            .foregroundColor(.textPrimary)
    }
}

public struct H4Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 20, weight: .semibold))
            .foregroundColor(.textPrimary)
    }
}

public struct ParagraphStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.body)
            .lineSpacing(4)
            .foregroundColor(.textPrimary)
    }
}

public struct SmallStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.footnote)
            .foregroundColor(.textSecondary)
    }
}

public struct SubtleStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.subheadline)
            .foregroundColor(.textMuted)
    }
}

public struct LeadStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 18, weight: .regular))
            .foregroundColor(.textSecondary)
    }
}

public struct LargeStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 18, weight: .semibold))
            .foregroundColor(.textPrimary)
    }
}

public struct MediumTextStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.textPrimary)
    }
}

public struct BlockQuoteStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 16))
            .foregroundColor(.textSecondary)
            .padding(.leading, 16)
            .overlay(
                Rectangle()
                    .fill(Color.codeBorder)
                    .frame(width: 2),
                alignment: .leading
            )
    }
}

public struct CodeStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 14, design: .monospaced))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.inlineCodeBackground)
            .foregroundColor(Color.inlineCodeForeground)
            .cornerRadius(4)
    }
}

public extension View {
    func h1() -> some View {
        modifier(H1Style())
    }

    func h2() -> some View {
        modifier(H2Style())
    }

    func h3() -> some View {
        modifier(H3Style())
    }

    func h4() -> some View {
        modifier(H4Style())
    }

    func paragraph() -> some View {
        modifier(ParagraphStyle())
    }

    func small() -> some View {
        modifier(SmallStyle())
    }

    func subtle() -> some View {
        modifier(SubtleStyle())
    }

    func lead() -> some View {
        modifier(LeadStyle())
    }

    func largeText() -> some View {
        modifier(LargeStyle())
    }

    func mediumText() -> some View {
        modifier(MediumTextStyle())
    }

    func blockQuote() -> some View {
        modifier(BlockQuoteStyle())
    }

    func inlineCode() -> some View {
        modifier(CodeStyle())
    }
}
