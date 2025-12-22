import SwiftUI
import Core

public struct SubscriptionSettingsView: View {
    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            SubscriptionPaywallView(
                configuration: .init(
                    context: .settings,
                    allowsDismiss: false,
                    showsCloseIcon: false,
                    showsSkipButton: false,
                    primaryActionTitle: nil,
                    onPrimaryAction: nil,
                    onSkip: nil,
                    useOwnBackground: true
                )
            )

            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("About Account Deletion")
                    .small()
                    .fontWeight(.semibold)
                    .foregroundColor(Color.mutedForeground)

                Text("Deleting your PlanToCode account removes your usage data and linked devices from our servers. App Store subscriptions must be managed separately in your Apple ID settings.")
                    .small()
                    .foregroundColor(Color.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Theme.Spacing.lg)
            .background(Color.card)
        }
        .navigationTitle("Subscription")
        .navigationBarTitleDisplayMode(.inline)
    }
}
