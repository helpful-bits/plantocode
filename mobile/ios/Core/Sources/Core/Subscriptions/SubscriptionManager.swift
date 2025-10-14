import Foundation
import StoreKit

// This is the complete StoreKit 2 subscription manager
@MainActor
public final class SubscriptionManager: ObservableObject {

    // MARK: - Types

    public enum SubscriptionTier {
        case none
        case monthly
        case annual
    }

    public struct SubscriptionStatus {
        public var isActive: Bool
        public var tier: SubscriptionTier
        public var willAutoRenew: Bool
        public var renewalDate: Date?
        public var trialEndDate: Date?
        public var currentProductId: String?

        public init(
            isActive: Bool,
            tier: SubscriptionTier,
            willAutoRenew: Bool,
            renewalDate: Date?,
            trialEndDate: Date?,
            currentProductId: String?
        ) {
            self.isActive = isActive
            self.tier = tier
            self.willAutoRenew = willAutoRenew
            self.renewalDate = renewalDate
            self.trialEndDate = trialEndDate
            self.currentProductId = currentProductId
        }
    }

    // MARK: - Published Properties

    @Published public private(set) var status: SubscriptionStatus
    @Published public private(set) var products: [Product] = []
    @Published public private(set) var configurationError: String?

    // MARK: - Computed Properties

    public var monthlyProduct: Product? {
        products.first(where: { $0.id == Config.IAP.monthlyProductId })
    }

    public var annualProduct: Product? {
        products.first(where: { $0.id == Config.IAP.annualProductId })
    }

    // MARK: - Initialization

    public init() {
        self.status = SubscriptionStatus(
            isActive: false,
            tier: .none,
            willAutoRenew: false,
            renewalDate: nil,
            trialEndDate: nil,
            currentProductId: nil
        )

        // Start observing transaction updates
        Task {
            await observeTransactionUpdates()
        }
    }

    // MARK: - Public API

    public func loadProducts() async throws {
        configurationError = nil

        // Fetch products from App Store
        let fetchedProducts = try await Product.products(
            for: [Config.IAP.monthlyProductId, Config.IAP.annualProductId]
        )

        // Validate both products exist
        guard fetchedProducts.count == 2 else {
            configurationError = "Missing subscription products in App Store Connect. Expected 2, found \(fetchedProducts.count)."
            products = fetchedProducts
            return
        }

        let monthly = fetchedProducts.first(where: { $0.id == Config.IAP.monthlyProductId })
        let annual = fetchedProducts.first(where: { $0.id == Config.IAP.annualProductId })

        guard let monthly = monthly, let annual = annual else {
            configurationError = "Could not find required subscription products."
            products = fetchedProducts
            return
        }

        // Validate same subscription group
        if let monthlyGroupID = monthly.subscription?.subscriptionGroupID,
           let annualGroupID = annual.subscription?.subscriptionGroupID {
            guard monthlyGroupID == annualGroupID else {
                configurationError = "Products are not in the same subscription group."
                products = fetchedProducts
                return
            }
        }

        // Validate 7-day introductory offer for monthly
        if let monthlyIntro = monthly.subscription?.introductoryOffer {
            if monthlyIntro.period.unit != .day || monthlyIntro.period.value != 7 {
                configurationError = "Monthly product does not have a 7-day free trial."
                products = fetchedProducts
                return
            }
        } else {
            configurationError = "Monthly product is missing introductory offer."
            products = fetchedProducts
            return
        }

        // Validate 7-day introductory offer for annual
        if let annualIntro = annual.subscription?.introductoryOffer {
            if annualIntro.period.unit != .day || annualIntro.period.value != 7 {
                configurationError = "Annual product does not have a 7-day free trial."
                products = fetchedProducts
                return
            }
        } else {
            configurationError = "Annual product is missing introductory offer."
            products = fetchedProducts
            return
        }

        // All validations passed
        products = fetchedProducts
    }

    public func refreshStatus() async {
        var activeTransaction: Transaction?
        var activeTier: SubscriptionTier = .none
        var activeProductId: String?

        // Iterate through current entitlements
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else {
                continue
            }

            // Check if this is one of our subscription products
            if transaction.productID == Config.IAP.monthlyProductId {
                activeTransaction = transaction
                activeTier = .monthly
                activeProductId = transaction.productID
                break
            } else if transaction.productID == Config.IAP.annualProductId {
                activeTransaction = transaction
                activeTier = .annual
                activeProductId = transaction.productID
                break
            }
        }

        if let transaction = activeTransaction {
            // User has an active subscription
            let willRenew = transaction.revocationDate == nil && transaction.expirationDate != nil
            let renewalDate = transaction.expirationDate

            // Trial end date tracking is complex in StoreKit 2
            // For now, we'll leave it as nil and rely on the transaction's expiration date
            let trialEnd: Date? = nil

            status = SubscriptionStatus(
                isActive: true,
                tier: activeTier,
                willAutoRenew: willRenew,
                renewalDate: renewalDate,
                trialEndDate: trialEnd,
                currentProductId: activeProductId
            )
        } else {
            // No active subscription
            status = SubscriptionStatus(
                isActive: false,
                tier: .none,
                willAutoRenew: false,
                renewalDate: nil,
                trialEndDate: nil,
                currentProductId: nil
            )
        }
    }

    public func purchase(tier: SubscriptionTier) async throws {
        guard configurationError == nil else {
            throw SubscriptionError.configurationError
        }

        let product: Product?
        switch tier {
        case .monthly:
            product = monthlyProduct
        case .annual:
            product = annualProduct
        case .none:
            return
        }

        guard let product = product else {
            throw SubscriptionError.productNotFound
        }

        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            switch verification {
            case .verified:
                await refreshStatus()
            case .unverified:
                throw SubscriptionError.verificationFailed
            }
        case .pending:
            break
        case .userCancelled:
            break
        @unknown default:
            break
        }
    }

    public func restorePurchases() async {
        do {
            try await AppStore.sync()
            await refreshStatus()
        } catch {
            // Silent failure - just refresh status
            await refreshStatus()
        }
    }

    public func showManageSubscriptions(from scene: UIWindowScene?) async {
        do {
            if let scene = scene {
                try await AppStore.showManageSubscriptions(in: scene)
            } else {
                // Fallback to opening App Store subscriptions URL
                if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                    await UIApplication.shared.open(url)
                }
            }
        } catch {
            // Fallback to opening App Store subscriptions URL
            if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                await UIApplication.shared.open(url)
            }
        }
    }

    public func hasActiveSubscription() -> Bool {
        return status.isActive
    }

    // MARK: - Private Methods

    private func observeTransactionUpdates() async {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else {
                continue
            }

            // Check if this transaction is for one of our products
            if transaction.productID == Config.IAP.monthlyProductId ||
               transaction.productID == Config.IAP.annualProductId {
                await refreshStatus()
            }

            // Finish the transaction
            await transaction.finish()
        }
    }
}

// MARK: - Errors

public enum SubscriptionError: Error {
    case configurationError
    case productNotFound
    case verificationFailed
}
