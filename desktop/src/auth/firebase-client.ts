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
import { invoke } from "@tauri-apps/api/core";
import { isDesktopApp, isTauriEnvironment } from "@/utils/platform";
import { type FirebaseConfig } from "./types";
import { open } from '@tauri-apps/plugin-shell';

// Firebase app singleton
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firebaseInitialized = false;

/**
 * Initialize Firebase with configuration from the Tauri backend
 */
const initFirebase = async (): Promise<void> => {
  if (firebaseInitialized && app && auth) {
    return;
  }

  try {
    // Get Firebase configuration from the Tauri backend
    const firebaseConfig = await invoke<FirebaseConfig>("get_runtime_firebase_config");
    
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain) {
      console.error("Firebase configuration is incomplete", firebaseConfig);
      throw new Error("Firebase configuration is missing required fields");
    }

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    firebaseInitialized = true;
    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    throw error;
  }
};

/**
 * Ensure Firebase is initialized and return the auth object
 */
const getFirebaseAuth = async (): Promise<Auth> => {
  await initFirebase();
  if (!auth) {
    throw new Error("Firebase auth is not initialized");
  }
  return auth;
};

/**
 * Check if running in desktop mode
 */
const isDesktop = () => {
  return isDesktopApp() || isTauriEnvironment();
};

/**
 * Generate auth URL for OAuth provider
 */
const generateAuthUrl = async (provider: string): Promise<string> => {
  // Get server URL from backend
  const serverUrl = await invoke<string>("get_server_url");
  
  // Generate OAuth URL for the given provider with redirect protocol
  // The redirect_protocol parameter tells the server which custom protocol scheme to use
  // for the callback URL (vibe-manager://)
  return `${serverUrl}/auth/${provider}?redirect_protocol=vibe-manager&callback_type=id_token`;
};

/**
 * Sign in with Google using OAuth
 */
const signInWithGoogle = async () => {
  await initFirebase();
  
  if (isDesktop()) {
    // For desktop, open external browser with auth URL
    const authUrl = await generateAuthUrl('google');
    console.log("Opening external browser for Google auth:", authUrl);
    await open(authUrl);
  } else {
    // For web, use Firebase redirect
    const auth = await getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  }
};

/**
 * Sign in with GitHub using OAuth
 */
const signInWithGithub = async () => {
  await initFirebase();
  
  if (isDesktop()) {
    // For desktop, open external browser with auth URL
    const authUrl = await generateAuthUrl('github');
    console.log("Opening external browser for GitHub auth:", authUrl);
    await open(authUrl);
  } else {
    // For web, use Firebase redirect
    const auth = await getFirebaseAuth();
    const provider = new GithubAuthProvider();
    await signInWithRedirect(auth, provider);
  }
};

/**
 * Sign in with Microsoft using OAuth
 */
const signInWithMicrosoft = async () => {
  await initFirebase();
  
  if (isDesktop()) {
    // For desktop, open external browser with auth URL
    const authUrl = await generateAuthUrl('microsoft');
    console.log("Opening external browser for Microsoft auth:", authUrl);
    await open(authUrl);
  } else {
    // For web, use Firebase redirect
    const auth = await getFirebaseAuth();
    const provider = new OAuthProvider("microsoft.com");
    await signInWithRedirect(auth, provider);
  }
};

/**
 * Sign in with Apple using OAuth
 */
const signInWithApple = async () => {
  await initFirebase();
  
  if (isDesktop()) {
    // For desktop, open external browser with auth URL
    const authUrl = await generateAuthUrl('apple');
    console.log("Opening external browser for Apple auth:", authUrl);
    await open(authUrl);
  } else {
    // For web, use Firebase redirect
    const auth = await getFirebaseAuth();
    const provider = new OAuthProvider("apple.com");
    await signInWithRedirect(auth, provider);
  }
};

/**
 * Handle redirect result
 */
const handleRedirectResult = async (): Promise<UserCredential | null> => {
  try {
    const auth = await getFirebaseAuth();
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
  try {
    const auth = await getFirebaseAuth();
    await fbSignOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

/**
 * Get current user
 */
const getCurrentUser = async (): Promise<User | null> => {
  try {
    const auth = await getFirebaseAuth();
    return auth.currentUser;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
};

/**
 * Sign in with provider
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
 * Process deep link auth callback
 * Extracts the Firebase ID token from the callback URL
 * @returns The Firebase ID token or null if not found
 */
const processAuthCallback = async (url: string): Promise<string | null> => {
  console.log("Processing auth callback URL");
  
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const idToken = params.get("id_token");
    
    if (!idToken) {
      console.error("No ID token found in callback URL");
      return null;
    }
    
    console.log("Successfully extracted Firebase ID token from URL");
    return idToken;
  } catch (error) {
    console.error("Error parsing auth callback URL:", error);
    return null;
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
          console.log("Received deep link:", url);
          // Process the deep link URL through the provided callback
          callback(url);
        }
      }
    });

    return unlisten;
  } catch (error) {
    console.error("Failed to set up deep link handler:", error);
    return () => {};
  }
};

// Export Firebase functions
export const firebaseAuth = {
  signIn,
  signOut,
  handleRedirect: handleRedirectResult,
  processAuthCallback,
  getCurrentUser,
  setupDeepLinkHandler,
};