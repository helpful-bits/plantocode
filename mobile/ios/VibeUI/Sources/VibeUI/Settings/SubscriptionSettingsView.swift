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

            VStack(alignment: .leading, spacing: 12) {
                Text("About Account Deletion")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.secondary)

                Text("Deleting your PlanToCode account removes your usage data and linked devices from our servers. App Store subscriptions must be managed separately in your Apple ID settings.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding()
            .background(Color.surfaceSecondary)
        }
        .navigationTitle("Subscription")
        .navigationBarTitleDisplayMode(.inline)
    }
}
