import Foundation

public enum BootstrapRepositoryError: Error {
    case rpcFailed(String)
}

public struct BootstrapRepository {
    public init() {}

    public func fetchProjectDirectory() async throws -> String? {
        let result = try await CommandRouter.appGetProjectDirectory()
        for try await response in result {
            if let error = response.error {
                throw BootstrapRepositoryError.rpcFailed(error.message)
            }
            if let dict = response.result?.value as? [String: Any],
               let dir = dict["projectDirectory"] as? String,
               !dir.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return dir.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if response.isFinal {
                return nil
            }
        }
        return nil
    }

    public func fetchActiveSessionId() async throws -> String? {
        let result = try await CommandRouter.appGetActiveSessionId()
        for try await response in result {
            if let error = response.error {
                throw BootstrapRepositoryError.rpcFailed(error.message)
            }
            if let dict = response.result?.value as? [String: Any],
               let sid = dict["sessionId"] as? String,
               !sid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return sid.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if response.isFinal {
                return nil
            }
        }
        return nil
    }

    public func fetchSessions(projectDirectory: String) async throws -> [Session] {
        return try await PlanToCodeCore.shared
            .dataServices?
            .sessionService
            .fetchSessions(projectDirectory: projectDirectory) ?? []
    }
}
