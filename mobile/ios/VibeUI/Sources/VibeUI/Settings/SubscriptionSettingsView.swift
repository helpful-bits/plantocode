import SwiftUI
import Core

public struct SubscriptionSettingsView: View {
    public init() {}

    public var body: some View {
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
        .navigationTitle("Subscription")
        .navigationBarTitleDisplayMode(.inline)
    }
}
