// Source of truth: shared/auth/types.rs
import Foundation

// MARK: - Authentication Request/Response Models

public struct AuthenticationRequest: Codable {
    /// The Auth0 ID token (access token)
    public let auth0IdToken: String

    /// Optional Auth0 refresh token
    public let auth0RefreshToken: String?

    /// Unique device identifier for token binding
    public let deviceId: String?

    public init(auth0IdToken: String, auth0RefreshToken: String?, deviceId: String?) {
        self.auth0IdToken = auth0IdToken
        self.auth0RefreshToken = auth0RefreshToken
        self.deviceId = deviceId
    }

    enum CodingKeys: String, CodingKey {
        case auth0IdToken = "auth0_id_token"
        case auth0RefreshToken = "auth0_refresh_token"
        case deviceId = "device_id"
    }
}

public struct AuthenticationResponse: Codable {
    /// JWT token for API access
    public let token: String

    /// Token expiration time in seconds
    public let expiresIn: Int64

    /// User information
    public let user: FrontendUser

    public init(token: String, expiresIn: Int64, user: FrontendUser) {
        self.token = token
        self.expiresIn = expiresIn
        self.user = user
    }

    enum CodingKeys: String, CodingKey {
        case token
        case expiresIn = "expires_in"
        case user
    }
}

public struct FrontendUser: Codable {
    /// User ID (UUID)
    public let id: String

    /// User email address
    public let email: String

    /// User full name
    public let name: String?

    /// User role
    public let role: String

    public init(id: String, email: String, name: String?, role: String) {
        self.id = id
        self.email = email
        self.name = name
        self.role = role
    }
}

// MARK: - Login Flow Models

public struct InitiateLoginRequest: Codable {
    /// Polling ID for status checks
    public let pid: String

    /// CSRF token for Tauri/desktop clients
    public let csrfTauri: String

    /// PKCE code challenge
    public let challenge: String

    /// PKCE code challenge method (usually "S256")
    public let challengeMethod: String

    /// Auth0 client ID
    public let clientId: String

    /// Auth0 API audience
    public let audience: String

    /// OAuth scopes requested
    public let scope: String

    /// Redirect URI after Auth0 authentication
    public let redirectUri: String

    /// Optional connection hint (e.g., "github" for GitHub login)
    public let connection: String?

    public init(pid: String, csrfTauri: String, challenge: String, challengeMethod: String, clientId: String, audience: String, scope: String, redirectUri: String, connection: String?) {
        self.pid = pid
        self.csrfTauri = csrfTauri
        self.challenge = challenge
        self.challengeMethod = challengeMethod
        self.clientId = clientId
        self.audience = audience
        self.scope = scope
        self.redirectUri = redirectUri
        self.connection = connection
    }

    enum CodingKeys: String, CodingKey {
        case pid
        case csrfTauri = "csrf_tauri"
        case challenge
        case challengeMethod = "challenge_method"
        case clientId = "client_id"
        case audience
        case scope
        case redirectUri = "redirect_uri"
        case connection
    }
}

public struct PollStatusRequest: Codable {
    /// Polling ID to check status for
    public let pid: String

    public init(pid: String) {
        self.pid = pid
    }
}

public struct PollStatusResponse: Codable {
    /// Status of the authentication request
    public let status: String // "ready" | "pending"

    /// Authorization code if ready
    public let authorizationCode: String?

    /// CSRF token returned from server
    public let tauriCsrfToken: String?

    public init(status: String, authorizationCode: String?, tauriCsrfToken: String?) {
        self.status = status
        self.authorizationCode = authorizationCode
        self.tauriCsrfToken = tauriCsrfToken
    }

    enum CodingKeys: String, CodingKey {
        case status
        case authorizationCode = "authorizationCode"
        case tauriCsrfToken = "tauriCsrfToken"
    }
}

public struct FinalizeLoginRequest: Codable {
    /// Authorization code from Auth0
    public let code: String

    /// PKCE code verifier
    public let codeVerifier: String

    /// Polling ID for status tracking
    public let pid: String

    /// CSRF token for validation
    public let csrfToken: String

    public init(code: String, codeVerifier: String, pid: String, csrfToken: String) {
        self.code = code
        self.codeVerifier = codeVerifier
        self.pid = pid
        self.csrfToken = csrfToken
    }

    enum CodingKeys: String, CodingKey {
        case code
        case codeVerifier = "code_verifier"
        case pid
        case csrfToken = "csrf_token"
    }
}

// MARK: - Utility Models

public struct LogoutResponse: Codable {
    /// Logout success message
    public let message: String

    public init(message: String) {
        self.message = message
    }
}

public struct AuthErrorResponse: Codable {
    /// Error type
    public let type: String

    /// Human-readable error message
    public let message: String

    /// Optional error details
    public let details: String?

    public init(type: String, message: String, details: String?) {
        self.type = type
        self.message = message
        self.details = details
    }
}

public struct AuthConfig: Codable {
    /// Auth0 domain
    public let auth0Domain: String

    /// Auth0 client ID for native apps
    public let auth0NativeClientId: String

    /// Auth0 API audience
    public let auth0ApiAudience: String

    /// Server base URL
    public let serverUrl: String

    public init(auth0Domain: String, auth0NativeClientId: String, auth0ApiAudience: String, serverUrl: String) {
        self.auth0Domain = auth0Domain
        self.auth0NativeClientId = auth0NativeClientId
        self.auth0ApiAudience = auth0ApiAudience
        self.serverUrl = serverUrl
    }

    enum CodingKeys: String, CodingKey {
        case auth0Domain = "auth0_domain"
        case auth0NativeClientId = "auth0_native_client_id"
        case auth0ApiAudience = "auth0_api_audience"
        case serverUrl = "server_url"
    }
}

public struct AuthDeviceInfo: Codable {
    /// Unique device identifier
    public let deviceId: String

    /// Platform identifier ("desktop" | "ios")
    public let platform: String

    /// App version
    public let appVersion: String?

    public init(deviceId: String, platform: String, appVersion: String?) {
        self.deviceId = deviceId
        self.platform = platform
        self.appVersion = appVersion
    }

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case platform
        case appVersion = "app_version"
    }
}

public struct PKCEChallenge: Codable {
    /// PKCE code challenge
    public let codeChallenge: String

    /// PKCE code challenge method
    public let codeChallengeMethod: String

    /// PKCE code verifier (keep secret)
    public let codeVerifier: String

    public init(codeChallenge: String, codeChallengeMethod: String, codeVerifier: String) {
        self.codeChallenge = codeChallenge
        self.codeChallengeMethod = codeChallengeMethod
        self.codeVerifier = codeVerifier
    }

    enum CodingKeys: String, CodingKey {
        case codeChallenge = "code_challenge"
        case codeChallengeMethod = "code_challenge_method"
        case codeVerifier = "code_verifier"
    }
}

public struct TokenExchangeRequest: Codable {
    /// Authorization code from Auth0
    public let code: String

    /// PKCE code verifier
    public let codeVerifier: String

    /// OAuth2 grant type
    public let grantType: String // "authorization_code"

    /// Auth0 client ID
    public let clientId: String

    /// Redirect URI used in initial request
    public let redirectUri: String

    public init(code: String, codeVerifier: String, grantType: String, clientId: String, redirectUri: String) {
        self.code = code
        self.codeVerifier = codeVerifier
        self.grantType = grantType
        self.clientId = clientId
        self.redirectUri = redirectUri
    }

    enum CodingKeys: String, CodingKey {
        case code
        case codeVerifier = "code_verifier"
        case grantType = "grant_type"
        case clientId = "client_id"
        case redirectUri = "redirect_uri"
    }
}

public struct TokenExchangeResponse: Codable {
    /// Auth0 access token
    public let accessToken: String

    /// Token type (usually "Bearer")
    public let tokenType: String

    /// Token expiration time in seconds
    public let expiresIn: Int64?

    /// Auth0 refresh token
    public let refreshToken: String?

    /// OAuth scopes granted
    public let scope: String?

    public init(accessToken: String, tokenType: String, expiresIn: Int64?, refreshToken: String?, scope: String?) {
        self.accessToken = accessToken
        self.tokenType = tokenType
        self.expiresIn = expiresIn
        self.refreshToken = refreshToken
        self.scope = scope
    }

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case refreshToken = "refresh_token"
        case scope
    }
}

public struct ServerRegion: Codable {
    /// Region identifier
    public let id: String

    /// Human-readable region name
    public let name: String

    /// Server base URL for this region
    public let url: String

    /// Whether this region is recommended
    public let recommended: Bool?

    public init(id: String, name: String, url: String, recommended: Bool?) {
        self.id = id
        self.name = name
        self.url = url
        self.recommended = recommended
    }
}

// MARK: - Authentication State

public enum AuthenticationState: Codable {
    case notAuthenticated
    case authenticating(pollingId: String)
    case authenticated(user: FrontendUser, token: String)
    case error(AuthError)

    enum CodingKeys: String, CodingKey {
        case type
        case pollingId = "polling_id"
        case user
        case token
        case error
    }

    enum StateType: String, Codable {
        case notAuthenticated = "not_authenticated"
        case authenticating = "authenticating"
        case authenticated = "authenticated"
        case error = "error"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(StateType.self, forKey: .type)

        switch type {
        case .notAuthenticated:
            self = .notAuthenticated
        case .authenticating:
            let pollingId = try container.decode(String.self, forKey: .pollingId)
            self = .authenticating(pollingId: pollingId)
        case .authenticated:
            let user = try container.decode(FrontendUser.self, forKey: .user)
            let token = try container.decode(String.self, forKey: .token)
            self = .authenticated(user: user, token: token)
        case .error:
            let error = try container.decode(AuthError.self, forKey: .error)
            self = .error(error)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .notAuthenticated:
            try container.encode(StateType.notAuthenticated, forKey: .type)
        case .authenticating(let pollingId):
            try container.encode(StateType.authenticating, forKey: .type)
            try container.encode(pollingId, forKey: .pollingId)
        case .authenticated(let user, let token):
            try container.encode(StateType.authenticated, forKey: .type)
            try container.encode(user, forKey: .user)
            try container.encode(token, forKey: .token)
        case .error(let error):
            try container.encode(StateType.error, forKey: .type)
            try container.encode(error, forKey: .error)
        }
    }
}

// MARK: - Constants

public struct AuthConstants {
    public static let pkceChallengeMethod = "S256"
    public static let oauthResponseType = "code"
    public static let oauthGrantType = "authorization_code"
    public static let defaultScopes = "openid profile email"

    public static let pollingIntervalMs: UInt64 = 1000 // Poll every second
    public static let pollingTimeoutMs: UInt64 = 120000 // 2 minute timeout
    public static let authTokenRefreshThresholdMs: UInt64 = 300000 // Refresh when 5 minutes left

    public struct StorageKeys {
        public static let deviceId = "vibe_manager_device_id"
        public static let authToken = "vibe_manager_auth_token"
        public static let auth0RefreshToken = "vibe_manager_auth0_refresh_token"
        public static let userInfo = "vibe_manager_user_info"
        public static let serverUrl = "vibe_manager_server_url"
        public static let onboardingCompleted = "vibe_manager_onboarding_completed"
    }

    public struct HTTPHeaders {
        public static let authorization = "Authorization"
        public static let clientId = "X-Client-ID"
        public static let contentType = "Content-Type"
        public static let applicationJson = "application/json"
    }

    public struct Endpoints {
        // Public Auth0 endpoints (no auth required)
        public static let initiateLogin = "/auth/auth0/initiate-login"
        public static let authCallback = "/auth/auth0/callback"
        public static let pollStatus = "/auth0/poll-status"
        public static let finalizeLogin = "/auth0/finalize-login"
        public static let loggedOut = "/auth/auth0/logged-out"

        // Protected API endpoints (auth required)
        public static let refreshToken = "/api/auth0/refresh-app-token"
        public static let logout = "/api/auth/logout"
        public static let userInfo = "/api/auth/userinfo"

        // Config endpoints
        public static let regions = "/config/regions"
    }

    public struct ErrorTypes {
        public static let unauthorized = "unauthorized"
        public static let invalidToken = "invalid_token"
        public static let networkError = "network_error"
        public static let validationError = "validation_error"
        public static let serverError = "server_error"
        public static let timeoutError = "timeout_error"
        public static let csrfError = "csrf_error"
        public static let keychainError = "keychain_error"
    }

    public struct Platforms {
        public static let desktop = "desktop"
        public static let ios = "ios"
        public static let android = "android"
    }

    public struct Timeouts {
        public static let networkRequest: UInt64 = 30000 // 30 seconds
        public static let tokenExchange: UInt64 = 15000 // 15 seconds
        public static let keychainOperation: UInt64 = 10000 // 10 seconds
        public static let userInfoFetch: UInt64 = 10000 // 10 seconds
    }
}