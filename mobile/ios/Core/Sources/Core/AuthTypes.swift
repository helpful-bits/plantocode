import Foundation

// MARK: - Auth0 Response Types

public struct Auth0TokenResponse: Codable {
    public let accessToken: String
    public let refreshToken: String?
    public let idToken: String?
    public let tokenType: String
    public let expiresIn: Int
    public let scope: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case idToken = "id_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case scope
    }
}

public struct AuthDataResponse: Codable {
    public let user: FrontendUser
    public let token: String
    public let refreshToken: String?
    public let expiresAt: Date?

    enum CodingKeys: String, CodingKey {
        case user
        case token
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
    }
}