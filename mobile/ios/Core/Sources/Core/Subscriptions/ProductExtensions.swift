import Foundation
import StoreKit

public extension Product {
    /// Returns a user-friendly description of the subscription duration
    var subscriptionPeriodDescription: String? {
        guard let subscription = subscription else { return nil }

        let period = subscription.subscriptionPeriod
        let unit = period.unit
        let value = period.value

        switch unit {
        case .day:
            return value == 1 ? "Daily" : "\(value) days"
        case .week:
            return value == 1 ? "Weekly" : "\(value) weeks"
        case .month:
            return value == 1 ? "Monthly" : "\(value) months"
        case .year:
            return value == 1 ? "Annual" : "\(value) years"
        default:
            return nil
        }
    }

    /// Returns a user-friendly description of the introductory offer (e.g., "7-day free trial")
    var introductoryOfferDescription: String? {
        guard let intro = subscription?.introductoryOffer else { return nil }

        let period = intro.period
        let paymentMode = intro.paymentMode

        let duration: String = {
            switch period.unit {
            case .day:
                return period.value == 1 ? "1 day" : "\(period.value) days"
            case .week:
                return period.value == 1 ? "1 week" : "\(period.value) weeks"
            case .month:
                return period.value == 1 ? "1 month" : "\(period.value) months"
            case .year:
                return period.value == 1 ? "1 year" : "\(period.value) years"
            default:
                return ""
            }
        }()

        switch paymentMode {
        case .freeTrial:
            return "\(duration) free trial"
        case .payAsYouGo:
            return "\(intro.displayPrice) for \(duration)"
        case .payUpFront:
            return "\(intro.displayPrice) for \(duration)"
        default:
            return nil
        }
    }

    /// Returns true if the product has a free trial
    var hasFreeTrialOffer: Bool {
        subscription?.introductoryOffer?.paymentMode == .freeTrial
    }

    /// Returns the equivalent monthly price for annual subscriptions
    var monthlyEquivalentPrice: String? {
        guard let subscription = subscription else { return nil }

        // Check if this is an annual subscription
        guard subscription.subscriptionPeriod.unit == .year else { return nil }

        let yearlyPrice = price
        let monthlyEquivalent = yearlyPrice / 12

        // Format using the product's price formatter
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = priceFormatStyle.locale

        return formatter.string(from: monthlyEquivalent as NSDecimalNumber)
    }
}
