import Foundation
import Combine

@MainActor
public final class AccountDataService: ObservableObject {
    @Published public private(set) var isDeleting: Bool = false
    @Published public private(set) var lastError: DataServiceError?

    public init() {}

    /// Clear any stored error state
    public func clearError() {
        lastError = nil
    }

    /// Delete user account
    /// This will:
    /// 1. Check connectivity
    /// 2. Validate no active jobs or pending actions
    /// 3. Call account.deleteAccount RPC
    /// 4. On success: logout, reset data services, navigate to login
    public func deleteAccount() async throws {
        // Check if offline
        guard MultiConnectionManager.shared.activeDeviceId != nil else {
            let error = DataServiceError.offline
            await MainActor.run {
                self.lastError = error
            }
            throw error
        }

        // Validate preconditions if services are available
        if let dataServices = PlanToCodeCore.shared.dataServices {
            // Check for active jobs
            if dataServices.jobsService.hasActiveJobs {
                let error = DataServiceError.validation("Cannot delete account while jobs are in progress. Please wait for active jobs to complete.")
                await MainActor.run {
                    self.lastError = error
                }
                throw error
            }

            // Check for pending offline actions
            if dataServices.sessionService.hasPendingOfflineActions {
                let error = DataServiceError.validation("Cannot delete account while offline actions are pending. Please ensure all changes are synced.")
                await MainActor.run {
                    self.lastError = error
                }
                throw error
            }
        }

        // Set deleting flag
        await MainActor.run {
            self.isDeleting = true
            self.lastError = nil
        }

        defer {
            Task { @MainActor in
                self.isDeleting = false
            }
        }

        do {
            // Call CommandRouter.accountDeleteAccount()
            let stream = CommandRouter.accountDeleteAccount()

            var success = false
            for try await response in stream {
                if let error = response.error {
                    throw DataServiceError.serverError("Account deletion failed: \(error.message)")
                }

                if response.isFinal {
                    success = true
                    break
                }
            }

            guard success else {
                throw DataServiceError.serverError("Account deletion did not complete")
            }

            // On success: perform cleanup
            await performPostDeletionCleanup()

        } catch let error as DataServiceError {
            await MainActor.run {
                self.lastError = error
            }
            throw error
        } catch {
            let wrappedError = DataServiceError.networkError(error)
            await MainActor.run {
                self.lastError = wrappedError
            }
            throw wrappedError
        }
    }

    /// Perform cleanup after successful account deletion
    private func performPostDeletionCleanup() async {
        // Reset DataServicesManager state
        if let dsm = PlanToCodeCore.shared.dataServices {
            await dsm.resetAllState()
        }

        // Logout from AuthService (clears tokens, user state)
        await AuthService.shared.logout()

        // Reset AppState to login screen
        await AppState.shared.resetToLogin()

        // Clear any remaining device connections
        await MultiConnectionManager.shared.hardReset(
            reason: .authInvalidated,
            deletePersistedDevices: true
        )
    }
}
