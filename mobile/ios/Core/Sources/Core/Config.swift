import Foundation

/// Configuration manager for Auth0 and API settings
public struct Config {
    // MARK: - Auth0 Configuration

    /// Auth0 domain from Info.plist
    public static var auth0Domain: String {
        guard let domain = Bundle.main.infoDictionary?["AUTH0_DOMAIN"] as? String,
              !domain.isEmpty else {
            fatalError("AUTH0_DOMAIN not found in Info.plist")
        }
        return domain
    }

    /// Auth0 native client ID from Info.plist
    public static var auth0NativeClientId: String {
        guard let clientId = Bundle.main.infoDictionary?["AUTH0_NATIVE_CLIENT_ID"] as? String,
              !clientId.isEmpty else {
            fatalError("AUTH0_NATIVE_CLIENT_ID not found in Info.plist")
        }
        return clientId
    }

    /// Auth0 API audience from Info.plist
    public static var auth0ApiAudience: String {
        guard let audience = Bundle.main.infoDictionary?["AUTH0_API_AUDIENCE"] as? String,
              !audience.isEmpty else {
            fatalError("AUTH0_API_AUDIENCE not found in Info.plist")
        }
        return audience
    }

    /// Auth scope from Info.plist with default fallback
    public static var authScope: String {
        return Bundle.main.infoDictionary?["AUTH_SCOPE"] as? String ?? "openid profile email"
    }

    /// Callback scheme from Info.plist with default fallback
    public static var callbackScheme: String {
        return Bundle.main.infoDictionary?["AUTH_CALLBACK_SCHEME"] as? String ?? "vibe-manager"
    }

    // MARK: - Server Configuration

    /// Dynamic server URL based on region selection
    /// Reads from RegionSettingsRepository for current active region
    public static var serverURL: String {
        return RegionSettingsRepository.shared.getActive().baseURL
    }

    // MARK: - Auth0 Scope

    /// OAuth2 scope for Auth0 authentication
    public static let scope = "openid profile email"

    // MARK: - Helper Functions

    /// Generates Auth0 callback URL that matches desktop - uses server callback
    /// - Returns: Server callback URL for Auth0 to redirect to
    public static func callbackURL() -> String {
        // Match desktop: Auth0 redirects to server, not to app directly
        // The app polls the server for the result
        return "\(serverURL)/auth/auth0/callback"
    }

    /// Generates Auth0 logout URL for the current app
    /// - Parameter serverURL: The server URL to redirect to after logout
    /// - Returns: Formatted logout URL string matching server expectations
    public static func loggedOutURL(serverURL: URL) -> String {
        return serverURL.appendingPathComponent("auth/auth0/logged-out").absoluteString
    }

    /// URL encodes a string for safe URL usage
    /// - Parameter string: The string to encode
    /// - Returns: URL encoded string
    public static func urlEncode(_ string: String) -> String {
        return string.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? string
    }
}