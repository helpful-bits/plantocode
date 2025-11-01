import Foundation
import KeychainAccess
import Combine
import AuthenticationServices
import CryptoKit
#if os(iOS)
#if canImport(UIKit)
#if canImport(UIKit)
import UIKit
#endif
#endif
#endif

private struct LoginAttempt {
  let pkceVerifier: String
  let csrfToken: String
}

@MainActor
public final class AuthService: NSObject, ObservableObject {
  public static let shared = AuthService()

  private let keychain = Keychain(service: "com.plantocode.mobile.auth")
  @Published public private(set) var isAuthenticated: Bool = false
  @Published public private(set) var currentUser: User? = nil
  @Published public private(set) var authError: String? = nil
  @Published public private(set) var tokenExpiresAt: Date?
  private var refreshTimer: Timer?
  private let lastRefreshKey = "vm_last_refresh_at"
  private var loginAttempts: [String: LoginAttempt] = [:]
  private var authSession: ASWebAuthenticationSession?

  private override init() {
    super.init()
    // Check for stored token on init
    Task {
      await checkStoredToken()
    }
  }

  // Check if we have a valid stored token
  private func checkStoredToken() async {
    defer {
      AppState.shared.markAuthBootstrapCompleted()
    }

    do {
      if let token = try keychain.get("app_jwt") {
        // Load persisted expiry
        if let expStr = try? keychain.get("app_jwt_exp"),
           let expDate = ISO8601DateFormatter().date(from: expStr) {
          await MainActor.run {
            self.tokenExpiresAt = expDate
            self.scheduleRefreshTimer()
          }
        }

        // Validate token by fetching user info
        if let user = await fetchUserInfo(token: token) {
          await MainActor.run {
            self.authError = nil
            self.isAuthenticated = true
            self.currentUser = user
          }
        } else {
          // Clear state if fetchUserInfo returns nil
          await MainActor.run {
            self.authError = nil
            self.isAuthenticated = false
            self.currentUser = nil
          }
        }
      }
    } catch {
    }
  }

  private func scheduleRefreshTimer(threshold: TimeInterval = 300) {
    refreshTimer?.invalidate()
    guard let exp = tokenExpiresAt else { return }
    let fireIn = max(exp.timeIntervalSinceNow - threshold, 5)
    refreshTimer = Timer.scheduledTimer(withTimeInterval: fireIn, repeats: false) { [weak self] _ in
      Task {
        try? await self?.refreshAppJWTAuth0()
      }
    }
  }

  // Start authentication flow using custom backend with PKCE
  public func login(providerHint: String? = nil) async throws {
    await MainActor.run {
      self.authError = nil
    }

    // Generate PKCE challenge
    let (codeVerifier, codeChallenge) = generatePKCEChallenge()
    let pollingId = UUID().uuidString
    let csrfToken = generateRandomToken()

    // Build auth URL with parameters matching desktop flow exactly
    // Always use production server for authentication
    var components = URLComponents(string: "\(Config.authServerURL)/auth/auth0/initiate-login")!
    var queryItems = [
      URLQueryItem(name: "pid", value: pollingId),
      URLQueryItem(name: "csrf_tauri", value: csrfToken),
      URLQueryItem(name: "challenge", value: codeChallenge),
      URLQueryItem(name: "challenge_method", value: "S256"),
      URLQueryItem(name: "client_id", value: Config.auth0NativeClientId),
      URLQueryItem(name: "audience", value: Config.auth0ApiAudience),
      URLQueryItem(name: "scope", value: Config.authScope),
      URLQueryItem(name: "redirect_uri", value: Config.callbackURL())
    ]

    // Add connection hint if provided
    if let providerHint = providerHint {
      queryItems.append(URLQueryItem(name: "connection", value: providerHint))
    }

    components.queryItems = queryItems

    guard let authURL = components.url else {
      throw APIError.invalidURL
    }

    // Store auth attempt locally
    loginAttempts[pollingId] = LoginAttempt(pkceVerifier: codeVerifier, csrfToken: csrfToken)

    do {
      // Start authentication session
      try await startAuthenticationSession(url: authURL, pollingId: pollingId)
    } catch {
      loginAttempts.removeValue(forKey: pollingId)
      throw error
    }
  }

  @MainActor
  private func startAuthenticationSession(url: URL, pollingId: String) async throws {
    // Create authentication session
    authSession = ASWebAuthenticationSession(
      url: url,
      callbackURLScheme: nil,  // Polling-based flow, no callback needed
      completionHandler: { [weak self] callbackURL, error in
        // Browser session ended - don't stop polling
        // User might have completed auth even if session closed
      }
    )

    authSession?.presentationContextProvider = self
    authSession?.prefersEphemeralWebBrowserSession = false

    // Start the browser
    guard authSession?.start() == true else {
      authSession = nil
      throw APIError.requestFailed(NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Unable to start authentication session"]))
    }

    // Start polling immediately after browser opens (like desktop does)
    // Use Task.detached to ensure polling continues independently
    Task.detached { [weak self] in
      await self?.pollForAuthResult(pollingId: pollingId)
    }
  }

  private func pollForAuthResult(pollingId: String) async {
    var attempts = 0
    let maxAttempts = 60 // 2 minutes with 2-second intervals

    while attempts < maxAttempts {
      attempts += 1

      // Check if login attempt still exists (user might have cancelled)
      guard loginAttempts[pollingId] != nil else {
        return
      }

      do {
        // Check auth status using APIClient
        // Use auth server for polling authentication status
        let (data, httpResponse) = try await ServerAPIClient.auth.requestRaw(
          path: "auth0/poll-status?pid=\(pollingId)",
          method: .GET,
          body: Optional<String>.none,
          token: nil
        )

        if httpResponse.statusCode == 204 {
          // Still pending
          try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
          continue
        }

        if httpResponse.statusCode == 200 {
          // Parse response
          let pollResponse = try JSONDecoder().decode(PollStatusResponse.self, from: data)

          if pollResponse.status == "ready",
             let authCode = pollResponse.authorizationCode,
             let serverCsrfToken = pollResponse.tauriCsrfToken {

            // Validate CSRF token
            guard let loginAttempt = loginAttempts[pollingId],
                  loginAttempt.csrfToken == serverCsrfToken else {
              return
            }

            // Perform token exchange and finalize login
            await performTokenExchangeAndFinalizeLogin(
              authCode: authCode,
              codeVerifier: loginAttempt.pkceVerifier,
              pollingId: pollingId
            )

            // Dismiss the authentication session browser
            await MainActor.run {
              authSession?.cancel()
              authSession = nil
            }

            return
          }
        } else {
          // Other status codes - throw error
          throw APIError.invalidResponse(statusCode: httpResponse.statusCode, data: data)
        }

      } catch {
        loginAttempts.removeValue(forKey: pollingId)
        await MainActor.run {
          self.authError = Self.userFacingMessage(for: error)
          self.isAuthenticated = false
          self.currentUser = nil
          self.authSession?.cancel()
          self.authSession = nil
        }
        return
      }

      try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
    }

    loginAttempts.removeValue(forKey: pollingId)
    await MainActor.run {
      self.authError = "Authentication timed out. Please close the browser tab and try again."
      self.isAuthenticated = false
      self.currentUser = nil
      self.authSession?.cancel()
      self.authSession = nil
    }
  }

  private func performTokenExchangeAndFinalizeLogin(authCode: String, codeVerifier: String, pollingId: String) async {
    defer {
      loginAttempts.removeValue(forKey: pollingId)
    }

    do {
      // Step 1: Exchange authorization code for Auth0 tokens
      var tokenComponents = URLComponents(string: "https://\(Config.auth0Domain)/oauth/token")!

      let tokenBody = [
        "grant_type": "authorization_code",
        "client_id": Config.auth0NativeClientId,
        "code": authCode,
        "code_verifier": codeVerifier,
        "redirect_uri": Config.callbackURL()
      ]

      var tokenRequest = URLRequest(url: tokenComponents.url!)
      tokenRequest.httpMethod = "POST"
      tokenRequest.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

      let formData = tokenBody.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
        .joined(separator: "&")
      tokenRequest.httpBody = formData.data(using: .utf8)

      let (tokenData, tokenResponse) = try await URLSession.shared.data(for: tokenRequest)

      guard let httpTokenResponse = tokenResponse as? HTTPURLResponse,
            httpTokenResponse.statusCode == 200 else {
        throw APIError.invalidResponse(
          statusCode: (tokenResponse as? HTTPURLResponse)?.statusCode ?? 0,
          data: tokenData
        )
      }

      let auth0TokenResponse = try JSONDecoder().decode(Auth0TokenResponse.self, from: tokenData)

      // Step 2: Get device ID and finalize login with backend using accessToken as id_token
      let deviceId = DeviceManager.shared.getOrCreateDeviceID()

      let finalizeRequest = AuthenticationRequest(
        auth0IdToken: auth0TokenResponse.accessToken, // Use accessToken as specified
        auth0RefreshToken: auth0TokenResponse.refreshToken,
        deviceId: deviceId
      )

      // Use auth server for finalizing login
      let authDataResponse: AuthDataResponse = try await ServerAPIClient.auth.request(
        path: "auth0/finalize-login",
        method: .POST,
        body: finalizeRequest as (any Encodable),
        token: nil,
        includeDeviceId: true
      )

      // Store token in keychain
      try keychain.set(authDataResponse.token, key: "app_jwt")

      // Calculate and store token expiry
      let computedExpiry = Date().addingTimeInterval(24 * 3600)
      try? keychain.set(ISO8601DateFormatter().string(from: computedExpiry), key: "app_jwt_exp")

      // Convert FrontendUser to User and update state
      let user = User(from: authDataResponse.user)
      await MainActor.run {
        self.authError = nil
        self.isAuthenticated = true
        self.currentUser = user
        self.tokenExpiresAt = computedExpiry
        self.scheduleRefreshTimer()
        NotificationCenter.default.post(name: NSNotification.Name("auth-token-refreshed"), object: nil)
      }

      // Kick orchestrator immediately after successful login finalization
      if PlanToCodeCore.shared.isInitialized {
        Task { @MainActor in
          await InitializationOrchestrator.shared.run()
        }
      }

      // Register push token after successful login
      Task { await PushNotificationManager.shared.registerPushTokenIfAvailable() }

      // Fire-and-forget device registration
      Task { [weak self] in
        guard let self = self else { return }
        let deviceId = DeviceManager.shared.getOrCreateDeviceID()
        try? await ServerAPIClient.shared.registerDevice(deviceId: deviceId)
      }

    } catch {
      await MainActor.run {
        self.authError = Self.userFacingMessage(for: error)
        self.isAuthenticated = false
        self.currentUser = nil
        self.authSession?.cancel()
        self.authSession = nil
      }
    }
  }

  private func fetchUserInfo(token: String) async -> User? {
    do {
      // Create custom request with timeout for userinfo endpoint
      // Use selected region server for user info
      var components = URLComponents(string: "\(Config.serverURL)/api/auth/userinfo")!
      var request = URLRequest(url: components.url!)
      request.httpMethod = "GET"
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.setValue(DeviceManager.shared.getOrCreateDeviceID(), forHTTPHeaderField: "X-Device-ID")
      request.setValue(DeviceManager.shared.getOrCreateDeviceID(), forHTTPHeaderField: "X-Token-Binding")
      request.timeoutInterval = 10.0 // 10 second timeout

      let (data, response) = try await URLSession.shared.data(for: request)

      guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse(statusCode: 0, data: data)
      }

      if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
        // 401/403 error - clear token
        try? keychain.remove("app_jwt")
        throw APIError.invalidResponse(statusCode: httpResponse.statusCode, data: data)
      }

      guard httpResponse.statusCode == 200 else {
        throw APIError.invalidResponse(statusCode: httpResponse.statusCode, data: data)
      }

      let user = try JSONDecoder().decode(User.self, from: data)
      return user

    } catch {
      if case APIError.invalidResponse(let code, _) = error, code == 401 || code == 403 {
        // 401/403 error - clear token
        try? keychain.remove("app_jwt")
      }
      return nil
    }
  }

  public func refreshAppJWTAuth0() async throws {
    guard let token = try keychain.get("app_jwt") else {
      throw APIError.invalidResponse(statusCode: 401, data: Data())
    }
    do {
      let authDataResponse: AuthDataResponse = try await ServerAPIClient.shared.request(
        path: "api/auth0/refresh-app-token",
        method: .POST,
        body: Optional<String>.none,
        token: token,
        includeDeviceId: true  // Include device-binding headers
      )

      // Update stored token
      try keychain.set(authDataResponse.token, key: "app_jwt")

      // Parse or extract expiry from response (if available) or calculate from current time + 24h
      let newExpiry = Date().addingTimeInterval(24 * 3600)
      try? keychain.set(ISO8601DateFormatter().string(from: newExpiry), key: "app_jwt_exp")

      await MainActor.run {
        self.authError = nil
        self.tokenExpiresAt = newExpiry
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: self.lastRefreshKey)
        self.scheduleRefreshTimer()
        NotificationCenter.default.post(name: NSNotification.Name("auth-token-refreshed"), object: nil)
      }
    } catch let apiError as APIError {
      switch apiError {
      case .invalidResponse(let statusCode, _) where statusCode == 401 || statusCode == 403:
        try? keychain.remove("app_jwt")
        await MainActor.run {
          self.authError = "Session expired. Please sign in again."
          self.isAuthenticated = false
          self.currentUser = nil
          self.refreshTimer?.invalidate()
          self.refreshTimer = nil
          NotificationCenter.default.post(name: NSNotification.Name("auth-logged-out"), object: nil)
        }
      default:
        await MainActor.run {
          self.authError = Self.userFacingMessage(for: apiError)
        }
      }
      throw apiError
    }
  }

  public func logout() async {
    // Update UI state on MainActor and post notification before clearing
    await MainActor.run {
      NotificationCenter.default.post(name: NSNotification.Name("auth-logged-out"), object: nil)
      self.refreshTimer?.invalidate()
      self.refreshTimer = nil
    }

    // Retrieve token from keychain
    if let token = try? keychain.get("app_jwt") {
      // Call server-side logout
      do {
        _ = try await ServerAPIClient.shared.requestRaw(
          path: "api/auth/logout",
          method: .POST,
          body: Optional<String>.none,
          token: token,
          includeDeviceId: true  // Include device-binding headers
        )
      } catch {
        // Ignore response - proceed with local logout
      }
    }

    // Clear keychain
    try? keychain.remove("app_jwt")

    // Update UI state on MainActor
    await MainActor.run {
      self.authError = nil
      self.isAuthenticated = false
      self.currentUser = nil
    }

    // Build Auth0 logout URL and start authentication session
    let logoutURL = buildAuth0LogoutURL()
    await startAuth0LogoutSession(url: logoutURL)
  }

  public func getValidAccessToken() async -> String? {
    try? keychain.get("app_jwt")
  }

  private func buildAuth0LogoutURL() -> URL {
    var components = URLComponents(string: "https://\(Config.auth0Domain)/v2/logout")!
    components.queryItems = [
      URLQueryItem(name: "client_id", value: Config.auth0NativeClientId),
      URLQueryItem(name: "returnTo", value: Config.loggedOutURL(serverURL: URL(string: Config.serverURL)!))
    ]
    return components.url!
  }

  @MainActor
  private func startAuth0LogoutSession(url: URL) async {
    let logoutSession = ASWebAuthenticationSession(
      url: url,
      callbackURLScheme: nil,
      completionHandler: { _, _ in
        // No callback handling needed for logout
      }
    )

    logoutSession.presentationContextProvider = self
    logoutSession.prefersEphemeralWebBrowserSession = false
    _ = logoutSession.start()
  }

  // PKCE Challenge generation
  private func generatePKCEChallenge() -> (verifier: String, challenge: String) {
    let verifier = generateRandomToken(length: 43)
    let challenge = base64URLEncode(sha256(verifier))
    return (verifier, challenge)
  }

  private func generateRandomToken(length: Int = 32) -> String {
    let letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return String((0..<length).map { _ in letters.randomElement()! })
  }

  private func sha256(_ string: String) -> Data {
    let data = Data(string.utf8)
    let hash = SHA256.hash(data: data)
    return Data(hash)
  }

  private func base64URLEncode(_ data: Data) -> String {
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private static func userFacingMessage(for error: Error) -> String {
    if let decodingError = error as? DecodingError {
      switch decodingError {
      case .dataCorrupted:
        return "We couldn't read the server response. Please try again."
      case .keyNotFound:
        return "The server response was missing data. Please try again."
      case .typeMismatch, .valueNotFound:
        return "The server response was unexpected. Please try again."
      @unknown default:
        return "An unexpected response was received. Please try again."
      }
    }

    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
      return "Network error: \(nsError.localizedDescription)"
    }

    return nsError.localizedDescription
  }
}

// MARK: - ASWebAuthenticationPresentationContextProviding
extension AuthService: ASWebAuthenticationPresentationContextProviding {
  public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    // Return the key window for presentation
    #if os(iOS)
    guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
          let window = windowScene.windows.first else {
      fatalError("No window found")
    }
    return window
    #else
    fatalError("Unsupported platform")
    #endif
  }
}
