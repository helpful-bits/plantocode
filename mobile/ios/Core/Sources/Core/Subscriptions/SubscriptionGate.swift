import Foundation

@MainActor
public struct SubscriptionGate {
    private let manager: SubscriptionManager

    public init(manager: SubscriptionManager) {
        self.manager = manager
    }

    public var isActive: Bool {
        manager.status.isActive
    }

    public func shouldShowPaywallForWorkspaceEntry(
        bootstrapState: AppState.BootstrapState,
        authBootstrapCompleted: Bool
    ) -> Bool {
        guard authBootstrapCompleted else { return false }

        if case .needsConfiguration = bootstrapState {
            return false
        }

        if case .running = bootstrapState {
            return false
        }

        return !isActive
    }

    public func shouldShowPaywallForFeatureAccess() -> Bool {
        return !isActive
    }
}
