## Enhanced Hybrid Authentication Flow for Tauri & Rust with Automated Firebase Web SDK Redirects

This document outlines the refined step-by-step implementation plan for a hybrid authentication flow. This flow enables a Tauri desktop application to authenticate users via OAuth providers (Google, GitHub, Microsoft, Apple) using the Firebase JavaScript SDK on a webpage hosted by a Rust backend. The key enhancement is the automatic initiation of the `signInWithRedirect` flow on the webpage.

-----

### Key Goals of this Flow:

* Leverage the official Firebase JavaScript SDK for robust OAuth provider interactions.
* Minimize complex OAuth logic within the Rust backend.
* Provide a streamlined user experience with automatic redirection to the identity provider.
* Enable the Rust server to manage Firebase sessions (ID and refresh tokens) securely.

-----

### Core Components:

1.  **Tauri Desktop Application:** Initiates the login, passes parameters, and polls for the Firebase ID token.
2.  **Rust Web Server:**
    * Serves the HTML login webpage.
    * Provides API endpoints for capturing the provider's token and exchanging it for Firebase tokens.
    * Provides an API endpoint for the Tauri app to retrieve the Firebase ID token.
3.  **Login Webpage (HTML/JavaScript):**
    * Includes Firebase JS SDK.
    * Automatically initiates `signInWithRedirect` based on URL parameters.
    * Handles the redirect result from the OAuth provider.
    * Sends the OAuth provider's ID token to the Rust server.

-----

### Detailed Implementation Steps:

#### 1\. Tauri Application: Initiating Login

* **User Action:** The user clicks a provider-specific "Login" button (e.g., "Login with Google") within the Tauri app.
* **Parameter Generation:**
    * Generate a unique, cryptographically strong `polling_id`. This ID will link the browser session back to this specific login attempt in the Tauri app.
    * Generate a cryptographically strong `state` parameter (CSRF token) to ensure the integrity of the flow.
* **Open Browser:**
    * The Tauri app constructs a URL and opens it in the system's default web browser.
    * The URL will point to your Rust server's login webpage and include the generated parameters:
      ```
      http://<your-rust-server-address>/login-via-web?pid={polling_id}&state={state}&provider={simple_provider_name}
      ```
        * `{polling_id}`: The unique ID generated.
        * `{state}`: The CSRF token.
        * `{simple_provider_name}`: A short string identifying the provider (e.g., "google", "github", "microsoft", "apple").
* **Start Polling:**
    * Simultaneously, the Tauri app begins polling a specific endpoint on your Rust server, expecting to eventually receive a Firebase ID token.
    * Polling Endpoint: `http://<your-rust-server-address>/api/auth/get-token?pid={polling_id}`
    * The polling request should be made at reasonable intervals (e.g., every 2-3 seconds) and should have a timeout mechanism.

-----

#### 2\. Rust Server: Serving the Login Webpage (`/login-via-web`)

* **Endpoint Definition:** Create an HTTP GET endpoint (using Actix) at `/login-via-web`.
* **Parameter Reception:** This endpoint will receive `pid` (polling\_id), `state`, and `provider` as URL query parameters.
* **Serve HTML Page:**
    * The endpoint serves an HTML page. This page will contain the Firebase JS SDK and the logic to handle the authentication.
    * **Crucially, the `pid`, `state`, and `provider` query parameters must be accessible to the JavaScript on this page.** This can be achieved by:
        * Embedding them directly into the JavaScript code when rendering the HTML template on the server.
        * Having the client-side JavaScript read them from `window.location.search`.

-----

#### 3\. Login Webpage: Firebase JS SDK & Automated Redirect Flow

This webpage is responsible for orchestrating the Firebase authentication.

* **Include Firebase SDK:**

  ```html
  <script src="https://www.gstatic.com/firebasejs/9.X.Y/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.X.Y/firebase-auth.js"></script>
  ```

  *(Replace `9.X.Y` with the desired Firebase SDK version)*

* **JavaScript Logic (executed on page load):**

  ```javascript
  // Your Firebase project configuration
  const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    // ... other config properties
  };

  // Initialize Firebase
  const app = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app); // Or: const auth = getAuth(app); for v9 modular

  // Function to extract query parameters
  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  // Function to map simple provider name to Firebase AuthProvider
  function getFirebaseProvider(providerName) {
    switch (providerName) {
      case "google":
        return new firebase.auth.GoogleAuthProvider(); // Or: new GoogleAuthProvider(); for v9
      case "github":
        return new firebase.auth.GithubAuthProvider(); // Or: new GithubAuthProvider(); for v9
      case "microsoft":
        // For Microsoft, ensure you've configured it as a generic OAuth provider in Firebase
        // and use the correct provider ID (e.g., 'microsoft.com')
        const microsoftProvider = new firebase.auth.OAuthProvider("microsoft.com"); // Or: new OAuthProvider("microsoft.com");
        // microsoftProvider.addScope('email'); // Add scopes if needed
        // microsoftProvider.addScope('profile');
        return microsoftProvider;
      case "apple":
        // Similar for Apple, ensure 'apple.com' is configured
        const appleProvider = new firebase.auth.OAuthProvider("apple.com"); // Or: new OAuthProvider("apple.com");
        // appleProvider.addScope('email');
        // appleProvider.addScope('name');
        return appleProvider;
      default:
        console.error("Unsupported provider:", providerName);
        // Display error to user or redirect to an error page
        return null;
    }
  }

  async function handleAuth() {
    try {
      // Attempt to get the redirect result as the page might be loading after redirect from IdP
      const result = await firebase.auth().getRedirectResult(); // Or: await getRedirectResult(auth);

      if (result && result.credential) {
        // User has successfully signed in via redirect
        // This block executes AFTER the user returns from the OAuth provider

        document.getElementById("status").innerText = "Authentication successful with provider. Processing...";

        const providerIdToken = result.credential.idToken; // OAuth provider's ID token
        const oauthProviderId = result.providerId; // e.g., 'google.com', 'github.com'

        // Retrieve the original polling_id and state from sessionStorage
        const pollingId = sessionStorage.getItem("app_polling_id");
        const clientState = sessionStorage.getItem("app_client_state");

        if (!pollingId || !clientState) {
          console.error("Polling ID or state missing from session storage.");
          document.getElementById("status").innerText = "Error: Critical session information missing. Please try again.";
          return;
        }

        // Send the provider's ID token, provider ID, polling_id, and state to your Rust backend
        const response = await fetch("/api/auth/capture-provider-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider_id_token: providerIdToken,
            oauth_provider_id: oauthProviderId,
            polling_id: pollingId,
            state: clientState, // Send the original state from Tauri
          }),
        });

        if (response.ok) {
          document.getElementById("status").innerText = "Authentication complete! You can now close this window and return to the application.";
          // Optionally, try to close the window if allowed by the browser
          // window.close();
        } else {
          const errorData = await response.json();
          console.error("Error sending token to backend:", errorData);
          document.getElementById("status").innerText = `Error processing authentication: ${errorData.message || response.statusText}. Please try again or contact support.`;
        }
        // Clear sessionStorage items after use
        sessionStorage.removeItem("app_polling_id");
        sessionStorage.removeItem("app_client_state");

      } else {
        // This block executes on the FIRST load of the page, OR if getRedirectResult found nothing (e.g., user navigated back)
        const providerName = getQueryParam("provider");
        const pollingId = getQueryParam("pid");
        const clientState = getQueryParam("state");

        if (providerName && pollingId && clientState) {
          const provider = getFirebaseProvider(providerName);
          if (provider) {
            // Store pollingId and clientState in sessionStorage to survive the redirect
            sessionStorage.setItem("app_polling_id", pollingId);
            sessionStorage.setItem("app_client_state", clientState);

            document.getElementById("status").innerText = `Redirecting to ${providerName} for authentication...`;
            // Start the redirect flow automatically
            await firebase.auth().signInWithRedirect(provider); // Or: await signInWithRedirect(auth, provider);
          } else {
            document.getElementById("status").innerText = `Error: Provider "${providerName}" is not supported.`;
          }
        } else if (!pollingId && !clientState && !providerName && sessionStorage.getItem("app_polling_id")) {
          // This case might happen if getRedirectResult was null but we previously initiated a redirect.
          // It could indicate the user manually navigated away and back, or an issue with the redirect.
          document.getElementById("status").innerText = "Awaiting redirect result or authentication cancelled.";
          // Clear potentially stale session storage if no result is ever processed.
          // Consider a timeout or user action to clear this.
        } else if (!providerName && !pollingId && !clientState) {
          // Page loaded without expected parameters and no ongoing redirect
          document.getElementById("status").innerText = "Error: Missing necessary parameters to initiate login.";
        }
      }
    } catch (error) {
      console.error("Firebase Auth Error:", error);
      document.getElementById("status").innerText = `Authentication Error: ${error.message}. Please try again.`;
      // Ensure polling_id and state are cleared from session storage on error to prevent reuse
      sessionStorage.removeItem("app_polling_id");
      sessionStorage.removeItem("app_client_state");
    }
  }

  // Run the auth handler when the page loads
  window.onload = handleAuth;
  ```

    * **HTML Structure (example):**
      ```html
      <!DOCTYPE html>
      <html>
      <head>
          <title>Authenticating...</title>
          <style> /* Basic styling for feedback */
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f4; }
              #status { padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          </style>
      </head>
      <body>
          <div id="status">Initializing authentication...</div>
          <script src="YOUR_FIREBASE_CONFIG_AND_LOGIC.js"></script> 
      </body>
      </html>
      ```

  **Explanation of JavaScript Logic:**

    1.  **Initialization:** Firebase app and auth are initialized.
    2.  **`getQueryParam`:** Utility to get URL parameters.
    3.  **`getFirebaseProvider`:** Maps the simple `provider` string (e.g., "google") to the corresponding Firebase `AuthProvider` object. This is where your mapping logic resides.
    4.  **`handleAuth` (Core Logic):**
        * **`getRedirectResult()`:** Called immediately. If the page is loading after a redirect from an OAuth provider, this promise will resolve with the `UserCredential`.
        * **If `result.credential` exists (Post-Redirect):**
            * The user has successfully signed in with the provider.
            * Extract the OAuth provider's `idToken` and `providerId`.
            * Retrieve the `polling_id` and original `state` from `sessionStorage` (they were stored before the redirect).
            * Make a `POST` request to your Rust server's `/api/auth/capture-provider-token` endpoint, sending `provider_id_token`, `oauth_provider_id`, `polling_id`, and the original `state`.
            * Display a success message and (optionally) attempt `window.close()`.
            * Clear the items from `sessionStorage`.
        * **Else (Initial Load or No Redirect Result):**
            * Extract `provider`, `pid` (polling\_id), and `state` from the current URL (passed by Tauri).
            * If these parameters are present:
                * Store `polling_id` and `state` in `sessionStorage`. This is crucial because the redirect to the OAuth provider will cause the current page context to be lost. `sessionStorage` persists for the life of the tab.
                * Call `signInWithRedirect(auth, provider)` using the mapped provider object. This navigates the user's browser to the OAuth provider's sign-in page.
            * Handle cases where parameters are missing or if a redirect was expected but no result was found.
    5.  **`window.onload = handleAuth;`**: Ensures the `handleAuth` logic runs as soon as the page is ready.

-----

#### 4\. Rust Server: Token Capture & Firebase Exchange (`/api/auth/capture-provider-token`)

* **Endpoint Definition:** Create an HTTP POST endpoint (e.g., `/api/auth/capture-provider-token`).
* **Request Body:** Expects a JSON body with:
    * `provider_id_token`: The ID token from the OAuth provider (e.g., Google's ID token).
    * `oauth_provider_id`: The identifier for the OAuth provider (e.g., `google.com`, `github.com`). This is the `result.providerId` from Firebase JS.
    * `polling_id`: The unique ID linking back to the Tauri app's request.
    * `state`: The original `state` parameter sent by the Tauri app.
* **Logic:**
    1.  **Deserialize Request:** Parse the incoming JSON.
    2.  **(Security Check) Validate `state`:**
        * If your server stored the `state` (from Tauri) associated with the `polling_id` when `/login-via-web` was first hit, retrieve and compare it.
        * Alternatively, if `state` can be validated independently (e.g., if it's a JWT or has a verifiable structure tied to `polling_id`), perform that validation. This confirms that the request to capture the token legitimately follows the initial request from Tauri.
        * If validation fails, return an error (e.g., `403 Forbidden` or `400 Bad Request`).
    3.  **Call Firebase Auth REST API (`accounts:signInWithIdp`):**
        * **URL:** `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=[YOUR_FIREBASE_WEB_API_KEY]`
        * **Method:** `POST`
        * **Headers:** `Content-Type: application/json`
        * **Body (JSON):**
          ```json
          {
            "postBody": "id_token={PROVIDER_ID_TOKEN_FROM_REQUEST}&providerId={OAUTH_PROVIDER_ID_FROM_REQUEST}",
            "requestUri": "http://localhost", // Or your app's domain, less critical for server-to-server
            "returnSecureToken": true,
            "returnIdpCredential": true // Optional: If you want to also get the original IdP credential back
          }
          ```
            * Replace `{PROVIDER_ID_TOKEN_FROM_REQUEST}` and `{OAUTH_PROVIDER_ID_FROM_REQUEST}` with the values received.
            * Ensure `YOUR_FIREBASE_WEB_API_KEY` is correctly set.
    4.  **Handle Firebase Response:**
        * **On Success:** Firebase will return:
            * `idToken`: The **Firebase ID token** (JWT).
            * `refreshToken`: The **Firebase refresh token**.
            * `expiresIn`: Lifetime of the Firebase ID token (in seconds).
            * Other user information.
        * **Store Tokens:** Securely associate the Firebase `idToken` and `refreshToken` with the `polling_id`. Use a temporary store (e.g., an in-memory `HashMap<String, Tokens>`, Redis cache with TTL). **The refresh token is highly sensitive.**
        * **On Failure:** Firebase will return an error. Log this error and prepare to signal failure to the polling Tauri app.
    5.  **Return Success/Failure to Webpage:** Send a simple `200 OK` or an error response back to the webpage's `Workspace` call.

-----

#### 5\. Tauri App: Receiving Tokens via Polling (`/api/auth/get-token`)

* **Rust Server Endpoint (`/api/auth/get-token`):**
    * This is a GET endpoint that takes `pid` (polling\_id) as a query parameter.
    * It checks the temporary store for tokens associated with the given `pid`.
    * If tokens are found:
        * Return the Firebase `idToken` and `firebase_uid` in the response body (e.g., as JSON).
        * **Crucially, remove the tokens (and `polling_id` entry) from the temporary store** to prevent the token from being retrieved again for the same `polling_id`.
    * If tokens are not yet found (because the web flow isn't complete): Return a status indicating "pending" or "not ready" (e.g., `202 Accepted` or `204 No Content`).
    * If an error occurred during the web flow and was flagged for this `pid`: Return an appropriate error status.
* **Tauri App Polling Logic:**
    * When a polling request to `/api/auth/get-token` receives a successful response containing the Firebase `idToken`:
        * Store the Firebase `idToken` securely within the Tauri app (e.g., in memory, or using secure storage if needed for persistence across app restarts, though typically ID tokens are short-lived).
        * Stop polling.
        * The user is now authenticated in the Tauri app. The `idToken` can be used in `Authorization: Bearer <idToken>` headers for requests to your Rust backend or other Firebase-aware services.
    * Handle polling timeouts and errors gracefully.

-----

#### 6\. Session Management & Token Refresh (Rust Server)

* **Firebase ID Token Expiry:** Firebase ID tokens are short-lived (typically 1 hour).
* **Rust Server Responsibility:** The Rust server, holding the Firebase `refreshToken`, is responsible for obtaining new Firebase `idToken`s.
* **Refresh Endpoint (Rust Server):**
    * Create a secure endpoint (e.g., `/api/auth/refresh-firebase-token`) that the Tauri app can call.
    * This endpoint should require the *expired or soon-to-expire Firebase ID token* for user identification (and to locate the corresponding refresh token if you have many users' refresh tokens).
    * Alternatively, if the Tauri app has its own session with the Rust server (e.g., via a secure cookie after initial login), that session could be used to identify the user for token refresh.
    * Use the stored Firebase `refreshToken` to call the Firebase Auth REST API's token refresh endpoint:
        * **URL:** `https://securetoken.googleapis.com/v1/token?key=[YOUR_FIREBASE_WEB_API_KEY]`
        * **Method:** `POST`
        * **Body (form-urlencoded):** `grant_type=refresh_token&refresh_token={USER_FIREBASE_REFRESH_TOKEN}`
    * Firebase will return a new `id_token` (Firebase ID token), `refresh_token` (potentially a new one, always use the latest returned), `expires_in`, etc.
    * Update the stored refresh token (if a new one is provided) and return only the new Firebase `idToken` to the Tauri app.
* **Tauri App Token Refresh Logic:**
    * The Tauri app should be aware of the ID token's expiry.
    * Proactively request a new ID token from the Rust server's refresh endpoint before the current one expires.
    * Or, if an API call from Tauri to the Rust backend (or another service) fails due to an expired token, the Tauri app should then request a new token and retry the failed API call.

-----

### Security Considerations:

* **HTTPS:** All communication (Tauri \<-\> Rust Server, Browser \<-\> Rust Server) should be over HTTPS in production. For local development, `http://localhost` is generally acceptable.
* **State Parameter (`state`):** The `state` parameter generated by Tauri and validated by the Rust server at the `/api/auth/capture-provider-token` step is crucial for CSRF protection, ensuring the token capture request is tied to the original login initiation.
* **Polling ID (`pid`):** Must be unique and cryptographically strong. Make it single-use by clearing it from the store once the token is delivered.
* **Refresh Token Storage:** Firebase Refresh Tokens are extremely sensitive. On the Rust server, store them securely (e.g., encrypted at rest if persisted in a database, or managed carefully in a secure cache). **Never send the Firebase Refresh Token to the Tauri client application.** This applies to both the polling endpoint and the token refresh endpoint - only the Firebase ID token should be sent to the client.
* **Firebase Web API Key:** While it's a "Web" API key and generally considered public, restrict its usage in the Google Cloud Console to your specific domain(s) and `localhost` for development to mitigate abuse.
* **Redirect URI Configuration:**
    * In your Firebase project settings, ensure the authorized redirect URI exactly matches the URL of your login webpage (e.g., `http://<your-rust-server-address>/auth/hybrid/login-via-web`).
    * In each OAuth provider's console (Google, GitHub, etc.), configure the authorized redirect URI to point back to Firebase's handling URL (this is usually managed by Firebase when you enable the provider in the Firebase console, but double-check).
    * **Note**: The login.html page is served by the main backend server at the path `/auth/hybrid/login-via-web`.
* **Input Validation:** Validate all inputs on the server-side (polling ID format, provider names, etc.).
* **Rate Limiting:** Consider rate limiting on authentication endpoints to prevent abuse.

-----

### User Experience (UX) Notes:

* **Browser Window:** The user will see a browser window open and be redirected. The webpage should provide clear messages:
    * Initial: "Redirecting to [Provider] for authentication..."
    * Success: "Authentication successful\! You can close this window."
    * Error: Clear error messages and guidance.
* **Auto-Close Window:** `window.close()` has limitations and may not always work depending on browser security policies (often, only windows opened by script can be closed by script). Provide clear instructions for the user to manually close the window if auto-close fails.
* **Tauri App Feedback:** The Tauri app should show a loading/waiting state while polling and update the UI promptly upon successful login or error.

-----

This comprehensive plan provides a detailed roadmap for implementing the enhanced hybrid authentication flow. Remember to thoroughly test each step and pay close attention to security best practices.

## Implementation Note

The authentication flow has been fully implemented with the following components:

1. **Main Server**: Hosts the login webpage, serves it at `/auth/hybrid/login-via-web`, and handles the token exchange and polling.
2. **Tauri Desktop**: Initiates the authentication flow, opens the browser with the login URL, polls for the token, and refreshes tokens as needed.
3. **Token Persistence**: Firebase refresh tokens are stored securely on the server side, while application JWTs are stored in the Tauri app's secure keyring.
4. **Token Refresh**: The desktop app uses the server's `/api/auth/refresh-firebase-id-token` endpoint to get a new Firebase ID token when needed, then exchanges it for a new application JWT.

The existing `/api/auth/firebase/token` endpoint on the server is still used for exchanging Firebase ID tokens for application JWTs, maintaining compatibility with both the new web-based flow and any legacy code that might still be using the old approach.