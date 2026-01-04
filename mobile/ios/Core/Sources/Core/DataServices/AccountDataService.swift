import Foundation
import Combine
import OSLog

// Note: UserInfoResponse is defined in ServerDTOs.swift

@MainActor
public final class AccountDataService: ObservableObject {
    @Published public private(set) var isDeleting: Bool = false
    @Published public private(set) var isLoading: Bool = false
    @Published public private(set) var lastError: DataServiceError?

    private let serverAPIClient: ServerAPIClient
    private let logger = Logger(subsystem: "PlanToCode", category: "AccountDataService")

    public init(serverAPIClient: ServerAPIClient = ServerAPIClient.shared) {
        self.serverAPIClient = serverAPIClient
    }

    /// Clear any stored error state
    public func clearError() {
        lastError = nil
    }

    /// Fetch user info from the server
    public func fetchUserInfo() async throws -> UserInfoResponse {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            guard let token = await AuthService.shared.getValidAccessToken() else {
                throw DataServiceError.authenticationError("Missing authentication token")
            }

            let userInfo: UserInfoResponse = try await serverAPIClient.request(
                path: "api/auth/userinfo",
                method: .GET,
                body: nil as String?,
                token: token
            )

            logger.info("Successfully fetched user info for: \(userInfo.email)")
            return userInfo

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Failed to fetch user info: \(error.localizedDescription)")
            throw serviceError
        }
    }

    /// Logout the current user
    public func logout() async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            if let token = await AuthService.shared.getValidAccessToken() {
                let (_, response) = try await serverAPIClient.requestRaw(
                    path: "api/auth/logout",
                    method: .POST,
                    body: nil as String?,
                    token: token
                )

                guard (200...299).contains(response.statusCode) else {
                    throw DataServiceError.serverError("Logout failed with status: \(response.statusCode)")
                }
            }

            await performPostLogoutCleanup()
            logger.info("Successfully logged out user")

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Logout failed: \(error.localizedDescription)")
            throw serviceError
        }
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

    private func performPostDeletionCleanup() async {
        if let dsm = PlanToCodeCore.shared.dataServices {
            await dsm.resetAllState()
        }
        await AppState.shared.resetToLogin()
    }

    private func performPostLogoutCleanup() async {
        if let dsm = PlanToCodeCore.shared.dataServices {
            await dsm.resetAllState()
        }
        await AppState.shared.resetToLogin()
    }

    private func mapToDataServiceError(_ error: Error) -> DataServiceError {
        if let serviceError = error as? DataServiceError {
            return serviceError
        } else if let networkError = error as? NetworkError {
            switch networkError {
            case .invalidURL:
                return .invalidRequest("Invalid URL")
            case .requestFailed(let underlying):
                return .networkError(underlying)
            case .invalidResponse(let statusCode, _):
                return .serverError("HTTP \(statusCode)")
            case .decodingFailed(let underlying):
                return .invalidResponse("Decoding failed: \(underlying.localizedDescription)")
            case .serverError(let apiError):
                return .serverError(apiError.message)
            }
        } else if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut, .networkConnectionLost, .notConnectedToInternet:
                return .timeout
            default:
                return .networkError(urlError)
            }
        } else {
            return .networkError(error)
        }
    }
}
