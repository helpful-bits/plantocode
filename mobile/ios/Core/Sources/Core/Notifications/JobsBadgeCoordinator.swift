import UIKit
import Combine

/// Centralized coordinator for app badge management.
/// Single source of truth for applicationIconBadgeNumber - all badge updates flow through this coordinator.
@MainActor
public final class JobsBadgeCoordinator: ObservableObject {
    private var jobsDataService: JobsDataService?
    private var cancellables: Set<AnyCancellable> = []

    @Published public private(set) var badgeCount: Int = 0

    public init() {
        // JobsDataService will be configured later via configure()
    }

    /// Configure the coordinator with the jobs data service.
    /// Should be called once AppContainer/DataServicesManager is initialized.
    public func configure(jobsDataService: JobsDataService) {
        self.jobsDataService = jobsDataService

        // Subscribe to activeJobsCount - the canonical badge count derived from the reducer
        // Badge count is computed from JobTypeFilters.isBadgeCountable() in recomputeDerivedState()
        jobsDataService.$activeJobsCount
            .removeDuplicates()
            .sink { [weak self] count in
                self?.updateBadge(count: count)
            }
            .store(in: &cancellables)
    }

    private func updateBadge(count: Int) {
        badgeCount = count
        UIApplication.shared.applicationIconBadgeNumber = count
    }

    /// Manually update the badge count (e.g., when clearing notifications)
    public func setBadgeCount(_ count: Int) {
        updateBadge(count: count)
    }

    /// Clear the badge
    public func clearBadge() {
        updateBadge(count: 0)
    }
}
