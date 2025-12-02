import SwiftUI
import Core

/// Paywall view displaying subscription options with iOS 16+ compatibility
/// Complies with Apple's requirements for subscription presentation
public struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer

    private let allowsDismiss: Bool

    public init(allowsDismiss: Bool = true) {
        self.allowsDismiss = allowsDismiss
    }

    public var body: some View {
        // On iOS 17+, use native SubscriptionStoreView which has its own close button
        // On iOS 16, wrap in NavigationStack with toolbar close button
        if #available(iOS 17.0, *) {
            SubscriptionPaywallView(
                configuration: .init(
                    context: .onboarding,
                    allowsDismiss: allowsDismiss,
                    showsCloseIcon: allowsDismiss, // Native view has its own, but we show ours in topBar for consistency
                    showsSkipButton: false,
                    primaryActionTitle: nil,
                    onPrimaryAction: { dismiss() },
                    onSkip: nil,
                    useOwnBackground: true
                )
            )
        } else {
            NavigationStack {
                SubscriptionPaywallView(
                    configuration: .init(
                        context: .onboarding,
                        allowsDismiss: allowsDismiss,
                        showsCloseIcon: false,
                        showsSkipButton: false,
                        primaryActionTitle: nil,
                        onPrimaryAction: { dismiss() },
                        onSkip: nil,
                        useOwnBackground: true
                    )
                )
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if allowsDismiss {
                        ToolbarItem(placement: .cancellationAction) {
                            Button {
                                dismiss()
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(Color.mutedForeground)
                            }
                        }
                    }
                }
            }
        }
    }
}
