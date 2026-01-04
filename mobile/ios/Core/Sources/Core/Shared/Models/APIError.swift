import Foundation

public struct APIError: Codable, Error {
    public let code: Int
    public let message: String
    public let errorType: String
    public let errorDetails: AnyCodable?

    public init(code: Int, message: String, errorType: String, errorDetails: AnyCodable? = nil) {
        self.code = code
        self.message = message
        self.errorType = errorType
        self.errorDetails = errorDetails
    }
}
