// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(app);

// Function to extract query parameters
function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Function to map simple provider name to Firebase AuthProvider
function getFirebaseProvider(providerName) {
  switch (providerName) {
    case "google":
      return new firebase.auth.GoogleAuthProvider();
    case "github":
      return new firebase.auth.GithubAuthProvider();
    case "microsoft":
      const microsoftProvider = new firebase.auth.OAuthProvider("microsoft.com");
      microsoftProvider.addScope('email');
      microsoftProvider.addScope('profile');
      return microsoftProvider;
    case "apple":
      const appleProvider = new firebase.auth.OAuthProvider("apple.com");
      appleProvider.addScope('email');
      appleProvider.addScope('name');
      return appleProvider;
    default:
      console.error("Unsupported provider:", providerName);
      document.getElementById("status").innerText = `Error: Provider "${providerName}" is not supported.`;
      document.getElementById("status").classList.add("error");
      return null;
  }
}

async function handleAuth() {
  try {
    // Attempt to get the redirect result as the page might be loading after redirect from IdP
    const result = await firebase.auth().getRedirectResult();

    if (result && result.credential) {
      // User has successfully signed in via redirect
      // This block executes AFTER the user returns from the OAuth provider

      document.getElementById("status").innerText = "Authentication successful with provider. Processing...";
      document.getElementById("status").classList.add("success");

      const providerIdToken = result.credential.idToken; // OAuth provider's ID token
      const oauthProviderId = result.providerId; // e.g., 'google.com', 'github.com'

      // Retrieve the original polling_id and state from sessionStorage
      const pollingId = sessionStorage.getItem("app_polling_id");
      const clientState = sessionStorage.getItem("app_client_state");

      if (!pollingId || !clientState) {
        console.error("Polling ID or state missing from session storage.");
        document.getElementById("status").innerText = "Error: Critical session information missing. Please try again.";
        document.getElementById("status").classList.add("error");
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
        document.getElementById("status").classList.add("success");
        // Optionally, try to close the window if allowed by the browser
        setTimeout(() => {
          try {
            window.close();
          } catch (e) {
            // Browser might not allow programmatic window closing
          }
        }, 3000);
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        console.error("Error sending token to backend:", errorData);
        document.getElementById("status").innerText = `Error processing authentication: ${errorData.message || response.statusText}. Please try again or contact support.`;
        document.getElementById("status").classList.add("error");
      }
      // Clear sessionStorage items after use
      sessionStorage.removeItem("app_polling_id");
      sessionStorage.removeItem("app_client_state");

    } else {
      // This block executes on the FIRST load of the page, OR if getRedirectResult found nothing (e.g., user navigated back)
      const providerName = getQueryParam("provider");
      const pollingId = getQueryParam("pid");
      const clientState = getQueryParam("state");
      const storedPollingId = sessionStorage.getItem("app_polling_id");
      const storedClientState = sessionStorage.getItem("app_client_state");

      if (providerName && pollingId && clientState) {
        // URL parameters are present. This could be the initial load from Tauri,
        // or a return from the IdP where Firebase preserved original query params.
        if (storedPollingId === pollingId && storedClientState === clientState) {
          // We have already initiated this exact flow (pollingId and clientState match sessionStorage).
          // This means we are returning from the IdP (or user navigated back/refreshed after initiation)
          // and getRedirectResult() did not yield a credential.
          document.getElementById("status").innerText = "Awaiting redirect result, or authentication cancelled by user, or an issue with the redirect process. If you have authenticated, the app should update shortly.";
          // document.getElementById("status").classList.add("warning");
        } else {
          // This is an initial load from Tauri, or a new attempt (different pid/state).
          // Or, sessionStorage was cleared.
          const provider = getFirebaseProvider(providerName);
          if (provider) {
            sessionStorage.setItem("app_polling_id", pollingId);
            sessionStorage.setItem("app_client_state", clientState);
            document.getElementById("status").innerText = `Redirecting to ${providerName} for authentication...`;
            await firebase.auth().signInWithRedirect(provider);
          } else {
            document.getElementById("status").innerText = `Error: Provider "${providerName}" is not supported.`;
            document.getElementById("status").classList.add("error");
          }
        }
      } else if (storedPollingId) {
        // No URL parameters, but pollingId is in sessionStorage.
        // This means we previously initiated a redirect, and are now likely back from the IdP
        // (and Firebase cleaned the URL), but getRedirectResult() failed.
        document.getElementById("status").innerText = "Awaiting redirect result, or authentication cancelled by user, or an issue with the redirect process. If you have authenticated, the app should update shortly.";
        // document.getElementById("status").classList.add("warning");
      } else {
        // No URL parameters and no pollingId in sessionStorage.
        // This means the page was loaded without the necessary information.
        document.getElementById("status").innerText = "Error: Missing necessary parameters to initiate login.";
        document.getElementById("status").classList.add("error");
      }
    }
  } catch (error) {
    console.error("Firebase Auth Error:", error);
    document.getElementById("status").innerText = `Authentication Error: ${error.message}. Please try again.`;
    document.getElementById("status").classList.add("error");
    // Ensure polling_id and state are cleared from session storage on error to prevent reuse
    sessionStorage.removeItem("app_polling_id");
    sessionStorage.removeItem("app_client_state");
  }
}

// Run the auth handler when the page loads
window.onload = handleAuth;