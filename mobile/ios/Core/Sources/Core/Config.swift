import Foundation

/// Configuration manager for Auth0 and API settings
public struct Config {
    // MARK: - Feature Flags

    /// Feature flags for experimental features
    public struct Flags {
        /// Enable API versioning (v1 prefix in paths)
        public static let apiVersioning: Bool = false

        /// Enable strict relay envelope format
        public static let strictRelayEnvelope: Bool = false
    }

    /// Shared flags instance
    public static let flags = Flags()

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
    // Server-issued app JWT includes read write rpc; no need to add server scopes here
    public static var authScope: String {
        return Bundle.main.infoDictionary?["AUTH_SCOPE"] as? String ?? "openid profile email"
    }

    /// Callback scheme from Info.plist with default fallback
    public static var callbackScheme: String {
        return Bundle.main.infoDictionary?["AUTH_CALLBACK_SCHEME"] as? String ?? "plantocode"
    }

    // MARK: - Server Configuration

    /// Dynamic server URL based on region selection
    /// Reads from RegionSettingsRepository for current active region
    public static var serverURL: String {
        #if DEBUG
        // Force local development server for DEBUG builds
        // return "http://192.168.0.38:8080"
        // Use production server URL for now
        return RegionSettingsRepository.shared.getActive().baseURL
        #else
        return RegionSettingsRepository.shared.getActive().baseURL
        #endif
    }

    /// Auth server URL - use dev server in DEBUG builds
    public static var authServerURL: String {
        #if DEBUG
        // Use local development server for DEBUG builds
        // return "http://192.168.0.38:8080"
        // Use production server URL for now
        return "https://api-eu.plantocode.com"
        #else
        // Use production EU server for Auth0 authentication
        return "https://api-eu.plantocode.com"
        #endif
    }

    /// WebSocket events path from Info.plist
    public static let wsEventsPath: String = Bundle.main.object(forInfoDictionaryKey: "WS_EVENTS_PATH") as? String ?? "/ws/events"

    /// WebSocket device-link path from Info.plist
    public static let wsDeviceLinkPath: String = Bundle.main.object(forInfoDictionaryKey: "WS_DEVICE_LINK_PATH") as? String ?? "/ws/device-link"

    /// Construct WebSocket URL from base URL and path
    public static func websocketURL(base: String, path: String) -> URL {
        guard let baseURL = URL(string: base) else {
            fatalError("Invalid base URL: \(base)")
        }

        // Convert http -> ws and https -> wss
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        if components.scheme == "http" {
            components.scheme = "ws"
        } else if components.scheme == "https" {
            components.scheme = "wss"
        }
        components.path = path

        guard let wsURL = components.url else {
            fatalError("Failed to construct WebSocket URL")
        }
        return wsURL
    }

    /// Events WebSocket URL computed from server URL and events path
    public static var eventsWebSocketURL: URL {
        return websocketURL(base: serverURL, path: wsEventsPath)
    }

    /// Device-link WebSocket URL computed from server URL and device-link path
    public static var deviceLinkWebSocketURL: URL {
        return websocketURL(base: serverURL, path: wsDeviceLinkPath)
    }

    // MARK: - In-App Purchase Configuration

    /// In-App Purchase product identifiers for subscription tiers.
    ///
    /// Configuration Requirements (App Store Connect):
    /// - All product IDs must be in the same subscription group
    /// - All must have a 7-day free trial configured as the introductory offer
    /// - Reference pricing (US): Weekly $4.99/week, Monthly $15/month, Annual $108/year (≈$9/month billed annually)
    /// - UI displays localized prices fetched from StoreKit with static clarifying copy
    public enum IAP {
        /// Weekly subscription product identifier
        public static let weeklyProductId = "com.plantocode.pro.weekly"

        /// Monthly subscription product identifier
        public static let monthlyProductId = "com.plantocode.pro.monthly"

        /// Annual subscription product identifier
        public static let annualProductId = "com.plantocode.pro.yearly"
    }

    // MARK: - Auth0 Scope

    /// OAuth2 scope for Auth0 authentication
    public static let scope = "openid profile email"

    // MARK: - Helper Functions

    /// Generates Auth0 callback URL that matches desktop - uses server callback
    /// - Returns: Server callback URL for Auth0 to redirect to
    public static func callbackURL() -> String {
        // Always use production server for Auth0 callbacks
        // Auth0 is configured to redirect to the production server
        return "\(authServerURL)/auth/auth0/callback"
    }

    /// Generates Auth0 logout URL for the current app
    /// - Parameter serverURL: The server URL to redirect to after logout
    /// - Returns: Formatted logout URL string matching server expectations
    public static func loggedOutURL(serverURL: URL) -> String {
        // Use auth server for logout callbacks
        let authURL = URL(string: authServerURL)!
        return authURL.appendingPathComponent("auth/auth0/logged-out").absoluteString
    }

    /// URL encodes a string for safe URL usage
    /// - Parameter string: The string to encode
    /// - Returns: URL encoded string
    public static func urlEncode(_ string: String) -> String {
        return string.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? string
    }
}