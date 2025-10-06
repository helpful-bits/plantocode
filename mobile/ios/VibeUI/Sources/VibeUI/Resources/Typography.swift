import SwiftUI

public struct H1Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 36, weight: .heavy))
            .tracking(-0.5)
    }
}

public struct H2Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 30, weight: .semibold))
    }
}

public struct H3Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 24, weight: .semibold))
    }
}

public struct H4Style: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 20, weight: .semibold))
    }
}

public struct ParagraphStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.body)
            .lineSpacing(4)
    }
}

public struct SmallStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.footnote)
    }
}

public struct SubtleStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.subheadline)
            .foregroundColor(.mutedForeground)
    }
}

public struct LeadStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 18, weight: .regular))
            .foregroundColor(.secondaryForeground)
    }
}

public struct LargeStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 18, weight: .semibold))
    }
}

public struct BlockQuoteStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .font(.system(size: 16))
            .padding(.leading, 16)
            .overlay(
                Rectangle()
                    .fill(Color.border)
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

    func blockQuote() -> some View {
        modifier(BlockQuoteStyle())
    }

    func inlineCode() -> some View {
        modifier(CodeStyle())
    }
}
