import SwiftUI
import StoreKit
import Core

/// Paywall view displaying subscription options with iOS 16+ compatibility
/// Complies with Apple's requirements for subscription presentation
public struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer
    @State private var isPurchasingWeekly = false
    @State private var isPurchasingMonthly = false
    @State private var isPurchasingAnnual = false

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 12) {
                        Image(systemName: "star.circle.fill")
                            .font(.system(size: 60))
                            .foregroundColor(Color.primary)

                        Text("Unlock Full Access")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(Color.cardForeground)

                        Text("Subscribe to access workspace and device features")
                            .font(.body)
                            .foregroundColor(Color.mutedForeground)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }
                    .padding(.top, 20)

                    // Subscription options - use iOS 17+ native view or iOS 16 fallback
                    if #available(iOS 17.0, *) {
                        nativeSubscriptionStoreView()
                    } else {
                        customSubscriptionView()
                    }

                    // Action buttons
                    VStack(spacing: 12) {
                        Button(action: {
                            Task {
                                await container.subscriptionManager.restorePurchases()
                            }
                        }) {
                            Text("Restore Purchases")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(Color.primary)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                        }
                        .buttonStyle(.bordered)

                        Button(action: {
                            Task {
                                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                                    await container.subscriptionManager.showManageSubscriptions(from: windowScene)
                                } else {
                                    await container.subscriptionManager.showManageSubscriptions(from: nil)
                                }
                            }
                        }) {
                            Text("Manage Subscription")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(Color.primary)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.horizontal, 20)

                    // Legal links - required for compliance
                    HStack(spacing: 16) {
                        if let termsURL = URL(string: "https://plantocode.com/terms") {
                            Link("Terms of Service", destination: termsURL)
                                .font(.footnote)
                                .foregroundColor(Color.primary)
                        }

                        Text("•")
                            .font(.footnote)
                            .foregroundColor(Color.mutedForeground)

                        if let privacyURL = URL(string: "https://plantocode.com/privacy") {
                            Link("Privacy Policy", destination: privacyURL)
                                .font(.footnote)
                                .foregroundColor(Color.primary)
                        }
                    }
                    .padding(.bottom, 20)
                }
            }
            .background(Color.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        dismiss()
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(Color.mutedForeground)
                    }
                    .accessibilityLabel("Close")
                    .frame(minWidth: 44, minHeight: 44) // Ensure minimum hit target
                }
            }
        }
        .onAppear {
            Task {
                try? await container.subscriptionManager.loadProducts()
                await container.subscriptionManager.refreshStatus()
            }
        }
    }

    // MARK: - iOS 17+ Native SubscriptionStoreView
    @available(iOS 17.0, *)
    @ViewBuilder
    private func nativeSubscriptionStoreView() -> some View {
        SubscriptionStoreView(productIDs: [
            Config.IAP.weeklyProductId,
            Config.IAP.monthlyProductId,
            Config.IAP.annualProductId
        ])
        .subscriptionStoreControlStyle(.picker)
        .subscriptionStoreButtonLabel(.multiline)
        .subscriptionStorePickerItemBackground(Color.card)
        .backgroundStyle(Color.background)
        .tint(Color.primary)
        .frame(minHeight: 280)
        .padding(.horizontal)
    }

    // MARK: - iOS 16 Custom Subscription View
    @ViewBuilder
    private func customSubscriptionView() -> some View {
        VStack(spacing: 16) {
            // Weekly Plan
            if let weekly = container.subscriptionManager.weeklyProduct {
                subscriptionCard(
                    product: weekly,
                    isPurchasing: $isPurchasingWeekly,
                    tier: .weekly
                )
            }

            // Monthly Plan
            if let monthly = container.subscriptionManager.monthlyProduct {
                subscriptionCard(
                    product: monthly,
                    isPurchasing: $isPurchasingMonthly,
                    tier: .monthly
                )
            }

            // Annual Plan
            if let annual = container.subscriptionManager.annualProduct {
                subscriptionCard(
                    product: annual,
                    isPurchasing: $isPurchasingAnnual,
                    tier: .annual
                )
            }
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private func subscriptionCard(
        product: Product,
        isPurchasing: Binding<Bool>,
        tier: SubscriptionManager.SubscriptionTier
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    if let periodDesc = product.subscriptionPeriodDescription {
                        Text(periodDesc)
                            .font(.headline)
                            .foregroundColor(Color.cardForeground)
                    }

                    if let introOffer = product.introductoryOfferDescription {
                        Text(introOffer)
                            .font(.footnote)
                            .foregroundColor(Color.mutedForeground)
                    }
                }
                Spacer()
                Text(product.displayPrice)
                    .font(.title3)
                    .bold()
                    .foregroundColor(Color.cardForeground)
            }

            Button {
                Task {
                    isPurchasing.wrappedValue = true
                    try? await container.subscriptionManager.purchase(tier: tier)
                    isPurchasing.wrappedValue = false
                }
            } label: {
                if isPurchasing.wrappedValue {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                } else {
                    Text("Subscribe")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isPurchasing.wrappedValue)
        }
        .padding(16)
        .background(Color.card)
        .cornerRadius(12)
    }
}

#Preview {
    PaywallView()
}
