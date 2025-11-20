import SwiftUI
import Core
import StoreKit

public struct SubscriptionSettingsView: View {
    @EnvironmentObject var container: AppContainer
    @State private var subscriptionManager: SubscriptionManager?
    @State private var isPurchasingWeekly = false
    @State private var isPurchasingMonthly = false
    @State private var isPurchasingAnnual = false

    public init() {}

    public var body: some View {
        Form {
            if let manager = subscriptionManager {
                // Current Status Section
                Section("Your Subscription") {
                    HStack {
                        Text("Status")
                            .foregroundColor(Color.mutedForeground)
                        Spacer()
                        Text(manager.status.isActive ? "Active" : "Not Active")
                            .foregroundColor(manager.status.isActive ? Color.success : Color.mutedForeground)
                    }

                    if manager.status.isActive {
                        HStack {
                            Text("Plan")
                                .foregroundColor(Color.mutedForeground)
                            Spacer()
                            Text(tierDisplayName(manager.status.tier))
                        }

                        if manager.status.willAutoRenew {
                            HStack {
                                Text("Renews")
                                    .foregroundColor(Color.mutedForeground)
                                Spacer()
                                if let date = manager.status.renewalDate {
                                    Text(date, style: .date)
                                }
                            }
                        }

                        if let trialEnd = manager.status.trialEndDate {
                            HStack {
                                Text("Trial Ends")
                                    .foregroundColor(Color.mutedForeground)
                                Spacer()
                                Text(trialEnd, style: .date)
                            }
                        }
                    }
                }

                // Configuration Error
                if let error = manager.configurationError {
                    Section {
                        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                            Label("Configuration Error", systemImage: "exclamationmark.triangle.fill")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundColor(Color.warning)
                            Text(error)
                                .small()
                                .foregroundColor(Color.foreground)
                        }
                        .padding(.vertical, Theme.Spacing.sm)
                    }
                    .listRowBackground(Color.warningBackground)
                }

                // Plans Section - Use custom UI for full design system control
                customPlansSection(manager: manager)

                // Management Section
                Section("Manage") {
                    Button {
                        Task {
                            await manager.restorePurchases()
                        }
                    } label: {
                        Text("Restore Purchases")
                    }
                    .buttonStyle(LinkButtonStyle())

                    Button {
                        Task {
                            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                                await manager.showManageSubscriptions(from: windowScene)
                            } else {
                                await manager.showManageSubscriptions(from: nil)
                            }
                        }
                    } label: {
                        Text("Manage Subscription")
                    }
                    .buttonStyle(LinkButtonStyle())
                }

                // Legal Terms
                Section {
                    Text("Subscriptions auto-renew until canceled. Manage in App Store > Account > Subscriptions.")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: Theme.Spacing.sm) {
                        if let termsURL = URL(string: "https://plantocode.com/terms") {
                            Link("Terms", destination: termsURL)
                                .foregroundColor(Color.primary)
                        }
                        Text("•")
                            .foregroundColor(Color.mutedForeground)
                        if let privacyURL = URL(string: "https://plantocode.com/privacy") {
                            Link("Privacy", destination: privacyURL)
                                .foregroundColor(Color.primary)
                        }
                    }
                    .small()
                }
            } else {
                Section {
                    ProgressView("Loading...")
                }
            }
        }
        .navigationTitle("Subscription")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            subscriptionManager = container.subscriptionManager
        }
        .task {
            if let manager = subscriptionManager {
                try? await manager.loadProducts()
                await manager.refreshStatus()
            }
        }
    }

    @available(iOS 17.0, *)
    @ViewBuilder
    private func subscriptionStoreSection(manager: SubscriptionManager) -> some View {
        Section {
            SubscriptionStoreView(productIDs: [
                Config.IAP.monthlyProductId,
                Config.IAP.annualProductId
            ])
            .subscriptionStoreControlStyle(.picker)
            .subscriptionStoreButtonLabel(.multiline)
            .subscriptionStorePickerItemBackground(Color.card) // Use your design system color
            .backgroundStyle(Color.background) // Overall background
            .tint(Color.primary) // Accent color for buttons and selections
            .frame(minHeight: 200)
        } header: {
            Text("Choose a Plan")
        }
    }

    @ViewBuilder
    private func customPlansSection(manager: SubscriptionManager) -> some View {
        Section {
            // Weekly Plan
            if let weekly = manager.weeklyProduct {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    HStack {
                        VStack(alignment: .leading) {
                            if let periodDesc = weekly.subscriptionPeriodDescription {
                                Text(periodDesc)
                                    .font(.headline)
                            }
                            if let introOffer = weekly.introductoryOfferDescription {
                                Text(introOffer)
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                            }
                        }
                        Spacer()
                        Text(weekly.displayPrice)
                            .font(.title3)
                            .bold()
                    }

                    Button {
                        Task {
                            isPurchasingWeekly = true
                            try? await manager.purchase(tier: .weekly)
                            isPurchasingWeekly = false
                        }
                    } label: {
                        if isPurchasingWeekly {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Subscribe")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(manager.products.isEmpty || manager.configurationError != nil || isPurchasingWeekly)
                }
                .padding(.vertical, Theme.Spacing.xs)
            }

            // Monthly Plan
            if let monthly = manager.monthlyProduct {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    HStack {
                        VStack(alignment: .leading) {
                            if let periodDesc = monthly.subscriptionPeriodDescription {
                                Text(periodDesc)
                                    .font(.headline)
                            }
                            if let introOffer = monthly.introductoryOfferDescription {
                                Text(introOffer)
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                            }
                        }
                        Spacer()
                        Text(monthly.displayPrice)
                            .font(.title3)
                            .bold()
                    }

                    Button {
                        Task {
                            isPurchasingMonthly = true
                            try? await manager.purchase(tier: .monthly)
                            isPurchasingMonthly = false
                        }
                    } label: {
                        if isPurchasingMonthly {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Subscribe")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(manager.products.isEmpty || manager.configurationError != nil || isPurchasingMonthly)
                }
                .padding(.vertical, Theme.Spacing.xs)
            }

            // Annual Plan
            if let annual = manager.annualProduct {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    HStack {
                        VStack(alignment: .leading) {
                            if let periodDesc = annual.subscriptionPeriodDescription {
                                Text(periodDesc)
                                    .font(.headline)
                            }

                            // Build subtitle dynamically
                            let subtitleParts: [String] = [
                                annual.introductoryOfferDescription,
                                annual.monthlyEquivalentPrice.map { "\($0)/month" }
                            ].compactMap { $0 }

                            if !subtitleParts.isEmpty {
                                Text(subtitleParts.joined(separator: " • "))
                                    .small()
                                    .foregroundColor(Color.mutedForeground)
                            }
                        }
                        Spacer()
                        Text(annual.displayPrice)
                            .font(.title3)
                            .bold()
                    }

                    Button {
                        Task {
                            isPurchasingAnnual = true
                            try? await manager.purchase(tier: .annual)
                            isPurchasingAnnual = false
                        }
                    } label: {
                        if isPurchasingAnnual {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Subscribe")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(manager.products.isEmpty || manager.configurationError != nil || isPurchasingAnnual)
                }
                .padding(.vertical, Theme.Spacing.xs)
            }
        } header: {
            Text("Choose a Plan")
        }
    }

    private func tierDisplayName(_ tier: SubscriptionManager.SubscriptionTier) -> String {
        switch tier {
        case .none:
            return "None"
        case .weekly:
            return "Weekly"
        case .monthly:
            return "Monthly"
        case .annual:
            return "Annual"
        }
    }
}
