import Foundation

// MARK: - Error Details Types

/// Structured error details matching desktop ErrorDetails shape.
/// All fields are optional to maintain decoding tolerance.
public struct ErrorDetails: Codable, Equatable {
    public let code: String?
    public let message: String?
    public let providerError: ProviderError?
    public let fallbackAttempted: Bool?

    public init(
        code: String? = nil,
        message: String? = nil,
        providerError: ProviderError? = nil,
        fallbackAttempted: Bool? = nil
    ) {
        self.code = code
        self.message = message
        self.providerError = providerError
        self.fallbackAttempted = fallbackAttempted
    }
}

/// Provider-specific error information.
/// All fields are optional to maintain decoding tolerance.
public struct ProviderError: Codable, Equatable {
    public let provider: String?
    public let statusCode: Int?
    public let errorType: String?
    public let details: String?
    public let context: ProviderErrorContext?

    public init(
        provider: String? = nil,
        statusCode: Int? = nil,
        errorType: String? = nil,
        details: String? = nil,
        context: ProviderErrorContext? = nil
    ) {
        self.provider = provider
        self.statusCode = statusCode
        self.errorType = errorType
        self.details = details
        self.context = context
    }
}

/// Additional context for provider errors, particularly for token limit issues.
/// All fields are optional to maintain decoding tolerance.
public struct ProviderErrorContext: Codable, Equatable {
    public let requestedTokens: Int?
    public let modelLimit: Int?
    public let additionalInfo: String?

    public init(
        requestedTokens: Int? = nil,
        modelLimit: Int? = nil,
        additionalInfo: String? = nil
    ) {
        self.requestedTokens = requestedTokens
        self.modelLimit = modelLimit
        self.additionalInfo = additionalInfo
    }
}
