/**
 * Firebase Client for Vibe Manager Desktop
 * Manages Firebase authentication for the desktop application
 */

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithRedirect,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  getRedirectResult,
  signOut as fbSignOut,
  type User,
  type Auth,
  type UserCredential,
} from "firebase/auth";

// Firebase configuration loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

// Firebase app singleton
let app: FirebaseApp | undefined;
let auth: Auth;

/**
 * Initialize Firebase
 */
const initFirebase = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
    if (app) auth = getAuth(app);
  }
};

/**
 * Sign in with Google
 */
const signInWithGoogle = async () => {
  initFirebase();
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with GitHub
 */
const signInWithGithub = async () => {
  initFirebase();
  const provider = new GithubAuthProvider();
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with Microsoft
 */
const signInWithMicrosoft = async () => {
  initFirebase();
  const provider = new OAuthProvider("microsoft.com");
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with Apple
 */
const signInWithApple = async () => {
  initFirebase();
  const provider = new OAuthProvider("apple.com");
  await signInWithRedirect(auth, provider);
};

/**
 * Handle redirect result
 */
const handleRedirectResult = async (): Promise<UserCredential | null> => {
  initFirebase();
  try {
    const result = await getRedirectResult(auth);
    return result;
  } catch (err) {
    console.error("Error handling redirect:", err);
    throw err;
  }
};

/**
 * Sign out
 */
const signOut = async (): Promise<void> => {
  initFirebase();
  await fbSignOut(auth);
};

/**
 * Get current user
 */
const getCurrentUser = (): User | null => {
  initFirebase();
  return auth.currentUser;
};

/**
 * Sign in (default to Google)
 */
const signIn = async (
  providerName: "google" | "github" | "microsoft" | "apple" = "google"
): Promise<void> => {
  switch (providerName) {
    case "google":
      await signInWithGoogle();
      break;
    case "github":
      await signInWithGithub();
      break;
    case "microsoft":
      await signInWithMicrosoft();
      break;
    case "apple":
      await signInWithApple();
      break;
    default:
      await signInWithGoogle();
  }
};

/**
 * Set up deep link handler for Tauri
 */
const setupDeepLinkHandler = async (callback: (url: string) => void) => {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen("deep-link", (event: { payload: string | { url: string } }) => {
      // Check if event contains a URL
      if (event && event.payload) {
        const url = typeof event.payload === 'string' 
          ? event.payload 
          : 'url' in event.payload ? event.payload.url : '';
        
        if (url) {
          // Process the deep link URL through the provided callback
          callback(url);
        }
      }
    });

    return unlisten;
  } catch (_) {
    return () => {};
  }
};

/**
 * Process OAuth redirect with explicit code and state
 * This is used when deep linking provides the auth code and state directly
 */
const processRedirect = async (
  _code: string,
  _state: string
): Promise<UserCredential | null> => {
  initFirebase();

  // The Firebase SDK should handle the pending redirect automatically through getRedirectResult
  // when the app restarts, but we can manually check after receiving a deep link
  return await getRedirectResult(auth);
};

// Export Firebase functions
export const firebaseAuth = {
  signIn,
  signOut,
  handleRedirect: handleRedirectResult,
  processRedirect,
  getCurrentUser,
  setupDeepLinkHandler,
};
