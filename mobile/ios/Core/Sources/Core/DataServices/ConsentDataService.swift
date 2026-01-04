import Foundation
import Combine
import OSLog

// Note: ConsentDocumentType, ConsentRegion, LegalDocument, ConsentStatusItem,
// and ConsentStatusResponse are defined in ServerDTOs.swift

public struct AcceptConsentRequest: Encodable {
    public let docType: String
    public let region: String
    public let metadata: [String: AnyCodable]?

    public init(docType: String, region: String, metadata: [String: AnyCodable]? = nil) {
        self.docType = docType
        self.region = region
        self.metadata = metadata
    }
}

public struct WithdrawConsentRequest: Encodable {
    public let docType: String
    public let region: String
    public let metadata: [String: AnyCodable]?

    public init(docType: String, region: String, metadata: [String: AnyCodable]? = nil) {
        self.docType = docType
        self.region = region
        self.metadata = metadata
    }
}

@MainActor
public final class ConsentDataService: ObservableObject {
    @Published public private(set) var isLoading: Bool = false
    @Published public private(set) var lastError: DataServiceError?

    private let serverAPIClient: ServerAPIClient
    private let logger = Logger(subsystem: "PlanToCode", category: "ConsentDataService")

    public init(serverAPIClient: ServerAPIClient = ServerAPIClient.shared) {
        self.serverAPIClient = serverAPIClient
    }

    public func clearError() {
        lastError = nil
    }

    public func getCurrentLegalDocuments(region: String) async throws -> [LegalDocument] {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            guard let token = await AuthService.shared.getValidAccessToken() else {
                throw DataServiceError.authenticationError("Missing authentication token")
            }

            let documents: [LegalDocument] = try await serverAPIClient.request(
                path: "api/consent/documents/current?region=\(region)",
                method: .GET,
                body: nil as String?,
                token: token
            )

            logger.info("Successfully fetched \(documents.count) legal documents for region: \(region)")
            return documents

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Failed to fetch legal documents: \(error.localizedDescription)")
            throw serviceError
        }
    }

    public func getConsentStatus(region: String) async throws -> ConsentStatusResponse {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            guard let token = await AuthService.shared.getValidAccessToken() else {
                throw DataServiceError.authenticationError("Missing authentication token")
            }

            let status: ConsentStatusResponse = try await serverAPIClient.request(
                path: "api/consent/status?region=\(region)",
                method: .GET,
                body: nil as String?,
                token: token
            )

            logger.info("Successfully fetched consent status for region: \(region)")
            return status

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Failed to fetch consent status: \(error.localizedDescription)")
            throw serviceError
        }
    }

    public func acceptConsent(docType: String, region: String, metadata: [String: AnyCodable]? = nil) async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            guard let token = await AuthService.shared.getValidAccessToken() else {
                throw DataServiceError.authenticationError("Missing authentication token")
            }

            let request = AcceptConsentRequest(docType: docType, region: region, metadata: metadata)

            let (_, response) = try await serverAPIClient.requestRaw(
                path: "api/consent/accept",
                method: .POST,
                body: request,
                token: token
            )

            guard response.statusCode == 204 || (200...299).contains(response.statusCode) else {
                throw DataServiceError.serverError("Accept consent failed with status: \(response.statusCode)")
            }

            logger.info("Successfully accepted consent for \(docType) in region: \(region)")

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Failed to accept consent: \(error.localizedDescription)")
            throw serviceError
        }
    }

    public func withdrawConsent(docType: String, region: String, metadata: [String: AnyCodable]? = nil) async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        do {
            guard let token = await AuthService.shared.getValidAccessToken() else {
                throw DataServiceError.authenticationError("Missing authentication token")
            }

            let request = WithdrawConsentRequest(docType: docType, region: region, metadata: metadata)

            let (_, response) = try await serverAPIClient.requestRaw(
                path: "api/consent/withdraw",
                method: .POST,
                body: request,
                token: token
            )

            guard response.statusCode == 204 || (200...299).contains(response.statusCode) else {
                throw DataServiceError.serverError("Withdraw consent failed with status: \(response.statusCode)")
            }

            logger.info("Successfully withdrew consent for \(docType) in region: \(region)")

        } catch {
            let serviceError = mapToDataServiceError(error)
            lastError = serviceError
            logger.error("Failed to withdraw consent: \(error.localizedDescription)")
            throw serviceError
        }
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
