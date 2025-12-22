import Foundation

/// Centralized source of truth for all subscription-related descriptive copy.
/// All marketing text, feature descriptions, and legal summaries should come from here.
public enum SubscriptionCopy {
    public static let title = "PlanToCode Pro"

    public static func subtitle(for context: SubscriptionPaywallView.Context) -> String {
        switch context {
        case .onboarding:
            return "Get unlimited AI-powered implementation plans, remote desktop agents, and synced mobile + desktop workflows."
        case .settings:
            return "Manage your PlanToCode Pro subscription and see what's included."
        }
    }

    public static let featureBullets: [(icon: String, text: String)] = [
        ("magnifyingglass", "AI-powered file finding across your codebase"),
        ("brain.head.profile", "Multi-LLM planning with council of AI architects"),
        ("arrow.triangle.merge", "Chief architect merge for unified architecture plans"),
        ("folder.fill", "Unlimited projects and planning runs"),
        ("desktopcomputer", "Remote desktop agent integration"),
        ("terminal.fill", "Terminal output and command execution"),
        ("bell.fill", "Notifications when plans and agents finish"),
        ("arrow.triangle.2.circlepath", "Real-time sync between mobile and desktop")
    ]

    public static let legalSummaryLines: [String] = [
        "Payment is charged to your Apple ID at confirmation",
        "Subscription automatically renews unless canceled at least 24 hours before the end of the current period",
        "Your account will be charged for renewal within 24 hours prior to the end of the current period",
        "Manage or cancel anytime in Settings → Apple ID → Subscriptions"
    ]
}
