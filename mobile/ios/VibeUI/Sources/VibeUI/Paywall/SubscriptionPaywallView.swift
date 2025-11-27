import SwiftUI
import StoreKit
import Core

/// Unified subscription paywall view that can be used in onboarding, settings, and standalone contexts
public struct SubscriptionPaywallView: View {

    // MARK: - Context

    public enum Context {
        case onboarding
        case settings
    }

    // MARK: - Configuration

    public struct Configuration {
        public let context: Context
        public let allowsDismiss: Bool
        public let showsCloseIcon: Bool
        public let showsSkipButton: Bool
        public let primaryActionTitle: String?
        public let onPrimaryAction: (() -> Void)?
        public let onSkip: (() -> Void)?
        public let useOwnBackground: Bool

        public init(
            context: Context,
            allowsDismiss: Bool = true,
            showsCloseIcon: Bool = true,
            showsSkipButton: Bool = false,
            primaryActionTitle: String? = nil,
            onPrimaryAction: (() -> Void)? = nil,
            onSkip: (() -> Void)? = nil,
            useOwnBackground: Bool = true
        ) {
            self.context = context
            self.allowsDismiss = allowsDismiss
            self.showsCloseIcon = showsCloseIcon
            self.showsSkipButton = showsSkipButton
            self.primaryActionTitle = primaryActionTitle
            self.onPrimaryAction = onPrimaryAction
            self.onSkip = onSkip
            self.useOwnBackground = useOwnBackground
        }
    }

    // MARK: - Environment

    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    // MARK: - State

    @State private var selectedTier: SubscriptionManager.SubscriptionTier?
    @State private var isPurchasing = false
    @State private var isLoadingProducts = true
    @State private var hasLoadedOnce = false
    @State private var localConfigurationError: String?

    /// Whether we're using iOS 17+ native SubscriptionStoreView (which has its own UI)
    private var usesNativeStoreView: Bool {
        if #available(iOS 17.0, *) {
            return configuration.context == .onboarding
        }
        return false
    }

    // MARK: - Properties

    private let configuration: Configuration

    private var manager: SubscriptionManager {
        container.subscriptionManager
    }

    // MARK: - Initializers

    public init(configuration: Configuration) {
        self.configuration = configuration
    }

    public init(context: Context) {
        self.init(configuration: Configuration(context: context))
    }

    // MARK: - Body

    public var body: some View {
        Group {
            if configuration.useOwnBackground {
                ZStack {
                    LinearGradient(
                        colors: [
                            Color.background,
                            Color.background.opacity(0.96),
                            Color.card
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .ignoresSafeArea()

                    content
                }
            } else {
                content
            }
        }
        .task {
            await loadProductsIfNeeded()
        }
    }

    // MARK: - Content

    private var content: some View {
        VStack(spacing: Theme.Spacing.xl) {
            if configuration.showsSkipButton || configuration.showsCloseIcon {
                topBar
            }

            ScrollView {
                VStack(spacing: Theme.Spacing.xl) {
                    // Native StoreView has its own header, so skip ours
                    if !usesNativeStoreView {
                        headerSection
                        statusOrIntroSection
                    }
                    plansSection
                    // Native StoreView has its own subscribe button
                    if !usesNativeStoreView {
                        subscribeButtonSection
                    }
                    actionsAndLegalSection
                    primaryCTASection
                }
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.top, usesNativeStoreView ? Theme.Spacing.xl : 0)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            // Initialize selected tier to current plan
            if selectedTier == nil {
                selectedTier = manager.status.isActive ? manager.status.tier : .annual
            }
        }
    }

    // MARK: - Top Bar

    @ViewBuilder
    private var topBar: some View {
        HStack {
            if configuration.showsSkipButton {
                Button("Skip") {
                    if let onSkip = configuration.onSkip {
                        onSkip()
                    } else {
                        dismiss()
                    }
                }
                .buttonStyle(LinkButtonStyle())
            } else {
                Spacer(minLength: 0)
            }

            Spacer()

            if configuration.allowsDismiss && configuration.showsCloseIcon {
                Button {
                    if let onPrimary = configuration.onPrimaryAction, configuration.primaryActionTitle == nil {
                        onPrimary()
                    } else {
                        dismiss()
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(Color.mutedForeground)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Theme.Spacing.lg)
    }

    // MARK: - Header Section

    @ViewBuilder
    private var headerSection: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "sparkles")
                .font(.system(size: 44, weight: .regular))
                .foregroundColor(Color.primary)

            Text("PlanToCode Pro")
                .h2()
                .multilineTextAlignment(.center)

            if configuration.context == .onboarding {
                Text("Start with a 7-day free trial, then save with the yearly plan.")
                    .lead()
                    .multilineTextAlignment(.center)
                    .foregroundColor(Color.mutedForeground)
                    .padding(.horizontal, Theme.Spacing.lg)
            }
        }
    }

    // MARK: - Status/Intro Section

    @ViewBuilder
    private var statusOrIntroSection: some View {
        VStack(spacing: Theme.Spacing.md) {
            if isLoadingProducts {
                VStack(spacing: Theme.Spacing.sm) {
                    ProgressView()
                    Text("Loading subscription options…")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                }
            } else if configuration.context == .onboarding && !manager.status.isActive {
                Text("Includes a 7-day free trial. Cancel anytime in the App Store.")
                    .small()
                    .foregroundColor(Color.mutedForeground)
                    .multilineTextAlignment(.center)
            }

            if let error = localConfigurationError ?? manager.configurationError {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Label("Configuration Error", systemImage: "exclamationmark.triangle.fill")
                        .small()
                        .foregroundColor(Color.warning)
                    Text(error)
                        .small()
                        .foregroundColor(Color.cardForeground)
                }
                .padding(Theme.Spacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.warningBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radii.base)
                        .stroke(Color.warningBorder, lineWidth: 1)
                )
                .cornerRadius(Theme.Radii.base)
            }
        }
    }

    // MARK: - Plans Section

    @ViewBuilder
    private var plansSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            // Use native StoreView only for onboarding on iOS 17+ (better trust/UX)
            // For settings, always use custom cards for more control
            if #available(iOS 17.0, *), configuration.context == .onboarding {
                nativeStoreViewSection()
            } else {
                customPlansSection()
            }
        }
    }

    @available(iOS 17.0, *)
    @ViewBuilder
    private func nativeStoreViewSection() -> some View {
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
        .frame(minHeight: 260)
        .padding()
        .background(Color.card)
        .cornerRadius(Theme.Radii.lg)
    }

    @ViewBuilder
    private func customPlansSection() -> some View {
        VStack(spacing: Theme.Spacing.md) {
            if manager.products.isEmpty && manager.configurationError == nil {
                VStack(spacing: Theme.Spacing.sm) {
                    ProgressView()
                    Text("Loading subscription options…")
                        .small()
                        .foregroundColor(Color.mutedForeground)
                }
            } else {
                if let weekly = manager.weeklyProduct {
                    subscriptionRow(product: weekly, tier: .weekly)
                }
                if let monthly = manager.monthlyProduct {
                    subscriptionRow(product: monthly, tier: .monthly)
                }
                if let annual = manager.annualProduct {
                    subscriptionRow(product: annual, tier: .annual)
                }
            }
        }
    }

    // MARK: - Subscription Row

    @ViewBuilder
    private func subscriptionRow(
        product: Product,
        tier: SubscriptionManager.SubscriptionTier
    ) -> some View {
        let isCurrentPlan = manager.status.isActive && manager.status.tier == tier
        let isSelected = selectedTier == tier

        Button {
            selectedTier = tier
        } label: {
            HStack(spacing: Theme.Spacing.md) {
                // Selection indicator
                ZStack {
                    Circle()
                        .stroke(isSelected ? Color.primary : Color.border, lineWidth: 2)
                        .frame(width: 24, height: 24)

                    if isSelected {
                        Circle()
                            .fill(Color.primary)
                            .frame(width: 14, height: 14)
                    }
                }

                // Plan info
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack(spacing: Theme.Spacing.sm) {
                        Text(product.subscriptionPeriodDescription ?? product.displayName)
                            .h4()
                            .foregroundColor(Color.cardForeground)

                        if isCurrentPlan {
                            Text("Current")
                                .font(.caption2)
                                .fontWeight(.medium)
                                .foregroundColor(Color.success)
                                .padding(.horizontal, Theme.Spacing.sm)
                                .padding(.vertical, 2)
                                .background(Color.successBackground)
                                .cornerRadius(999)
                        }
                    }

                    if isCurrentPlan, let renewal = manager.status.renewalDate {
                        Text("Renews \(renewal.formatted(date: .abbreviated, time: .omitted))")
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    } else if tier == .annual {
                        let parts: [String] = [
                            product.introductoryOfferDescription,
                            product.monthlyEquivalentPrice.map { "\($0)/mo" }
                        ].compactMap { $0 }
                        if !parts.isEmpty {
                            Text(parts.joined(separator: " • "))
                                .small()
                                .foregroundColor(Color.success)
                        }
                    } else if let intro = product.introductoryOfferDescription {
                        Text(intro)
                            .small()
                            .foregroundColor(Color.mutedForeground)
                    }
                }

                Spacer()

                // Price
                Text(product.displayPrice)
                    .font(.title3).bold()
                    .foregroundColor(Color.cardForeground)
            }
            .padding(Theme.Spacing.md)
            .cardContainer(
                state: isSelected ? .selected : .normal,
                cornerRadius: Theme.Radii.lg,
                addShadow: isSelected
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Subscribe Button Section

    @ViewBuilder
    private var subscribeButtonSection: some View {
        let currentTier = manager.status.isActive ? manager.status.tier : nil
        let hasSelectedDifferentPlan = selectedTier != nil && selectedTier != currentTier

        if hasSelectedDifferentPlan {
            Button {
                Task {
                    await handlePurchase()
                }
            } label: {
                Group {
                    if isPurchasing {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(manager.status.isActive ? "Change Plan" : "Subscribe")
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 50)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isPurchasing || manager.products.isEmpty || manager.configurationError != nil)
        }
    }

    // MARK: - Actions and Legal Section

    @ViewBuilder
    private var actionsAndLegalSection: some View {
        VStack(spacing: Theme.Spacing.xl) {
            // "Maybe Later" skip option for onboarding (subtle ghost button)
            if configuration.context == .onboarding, let onSkip = configuration.onSkip {
                Button("Maybe Later") {
                    onSkip()
                }
                .buttonStyle(GhostButtonStyle())
            }

            // Restore purchases button
            Button("Restore Purchases") {
                Task {
                    await manager.restorePurchases()
                }
            }
            .buttonStyle(LinkButtonStyle())

            // Legal section with proper styling
            VStack(spacing: Theme.Spacing.sm) {
                Text("Subscriptions auto-renew until canceled. Manage in App Store > Account > Subscriptions.")
                    .small()
                    .multilineTextAlignment(.center)

                HStack(spacing: Theme.Spacing.lg) {
                    if let termsURL = URL(string: "https://plantocode.com/legal/us/terms") {
                        Link("Terms of Service", destination: termsURL)
                    }
                    Text("·")
                        .foregroundColor(Color.mutedForeground)
                    if let privacyURL = URL(string: "https://plantocode.com/legal/us/privacy") {
                        Link("Privacy Policy", destination: privacyURL)
                    }
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color.primary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Primary CTA Section

    @ViewBuilder
    private var primaryCTASection: some View {
        if let title = configuration.primaryActionTitle,
           let onTap = configuration.onPrimaryAction {
            Button(title) {
                onTap()
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.top, Theme.Spacing.lg)
        }
    }

    // MARK: - Helper Methods

    private func tierDisplayName(_ tier: SubscriptionManager.SubscriptionTier) -> String {
        switch tier {
        case .none: return "None"
        case .weekly: return "Weekly"
        case .monthly: return "Monthly"
        case .annual: return "Yearly"
        }
    }

    private func loadProductsIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        isLoadingProducts = true
        do {
            try await manager.loadProducts()
            await manager.refreshStatus()
        } catch {
            // configurationError will be set in manager if relevant
        }
        await MainActor.run {
            isLoadingProducts = false
            localConfigurationError = manager.configurationError
        }
    }

    private func handlePurchase() async {
        guard let tier = selectedTier, !isPurchasing else { return }
        isPurchasing = true
        defer { isPurchasing = false }

        try? await manager.purchase(tier: tier)
        if manager.status.isActive {
            configuration.onPrimaryAction?()
        }
    }

    private func showManageSubscriptionsFromCurrentScene() async {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else { return }
        await manager.showManageSubscriptions(from: scene)
    }
}

// MARK: - Preview

#if DEBUG
#Preview {
    SubscriptionPaywallView(context: .onboarding)
        .environmentObject(AppContainer.preview)
}
#endif
