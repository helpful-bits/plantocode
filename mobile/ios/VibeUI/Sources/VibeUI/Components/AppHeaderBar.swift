import SwiftUI

public struct AppHeaderBar: View {
    let title: String
    let subtitle: String?
    let breadcrumb: [String]
    let actions: AnyView?

    public init(
        title: String,
        subtitle: String? = nil,
        breadcrumb: [String] = [],
        actions: AnyView? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.breadcrumb = breadcrumb
        self.actions = actions
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Breadcrumb
            if !breadcrumb.isEmpty {
                Text(breadcrumb.joined(separator: " › "))
                    .small()
                    .foregroundColor(Color.mutedForeground)
            }

            // Title
            Text(title)
                .h2()
                .foregroundColor(Color.cardForeground)

            // Subtitle
            if let subtitle = subtitle {
                Text(subtitle)
                    .paragraph()
                    .foregroundColor(Color.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            actions,
            alignment: .trailing
        )
        .padding(.vertical, 8)
        .background(Color.card)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.border),
            alignment: .bottom
        )
    }
}

#Preview {
    VStack {
        AppHeaderBar(
            title: "Plans",
            subtitle: "Manage your implementation plans",
            breadcrumb: [],
            actions: nil
        )

        AppHeaderBar(
            title: "Plan Details",
            subtitle: nil,
            breadcrumb: ["Plans", "Implementation Plan"],
            actions: AnyView(
                Button("Done") {}
                    .buttonStyle(PrimaryButtonStyle())
            )
        )
    }
}
