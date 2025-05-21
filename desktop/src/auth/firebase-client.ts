/**
 * Firebase Client for Vibe Manager Desktop
 * Simplified implementation following Firebase's canonical redirect flow
 */

import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithRedirect,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  getRedirectResult,
  signOut as fbSignOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  type User,
  type Auth,
} from "firebase/auth";
import { invoke } from "@tauri-apps/api/core";
import { FirebaseConfig } from "./types";

// Firebase auth and app references
let app: FirebaseApp | undefined;
let auth: Auth | undefined;

/**
 * Initialize Firebase with configuration fetched from Tauri backend
 * Returns the initialized auth and app objects
 */
const initFirebase = async (): Promise<{ auth: Auth, app: FirebaseApp }> => {
  // If already initialized, return existing instances
  if (app && auth) {
    return { auth, app };
  }
  
  try {
    // Fetch Firebase configuration from Tauri backend
    const firebaseConfig = await invoke<FirebaseConfig>('get_runtime_firebase_config');
    
    console.log("[Firebase] Initializing with config - authDomain:", firebaseConfig.authDomain);
    
    // Initialize or get existing app using the Firebase v12 pattern
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp(firebaseConfig);
    }
    
    // Get auth instance
    auth = getAuth(app);
    
    // Set persistence to browser local storage
    await setPersistence(auth, browserLocalPersistence);
    
    return { auth, app };
  } catch (error) {
    console.error("[Firebase] Failed to initialize:", error);
    throw error;
  }
};

// handleRedirectResult is removed in favor of a single call within awaitAuth

/**
 * Sign in with the selected provider
 */
const signIn = async (
  providerName: "google" | "github" | "microsoft" | "apple" = "google"
): Promise<void> => {
  // Initialize Firebase
  const { auth } = await initFirebase();
  
  // Select the appropriate provider
  let provider;
  switch (providerName) {
    case "google":
      provider = new GoogleAuthProvider();
      break;
    case "github":
      provider = new GithubAuthProvider();
      break;
    case "microsoft":
      provider = new OAuthProvider("microsoft.com");
      break;
    case "apple":
      provider = new OAuthProvider("apple.com");
      break;
    default:
      provider = new GoogleAuthProvider();
  }
  
  // Start the redirect flow
  await signInWithRedirect(auth, provider);
};

/**
 * Sign out the current user
 */
const signOut = async (): Promise<void> => {
  try {
    const { auth } = await initFirebase();
    await fbSignOut(auth);
  } catch (error) {
    console.error("[Firebase] Error signing out:", error);
    throw error;
  }
};

/**
 * Get the current authenticated user
 */
const getCurrentUser = async (): Promise<User | null> => {
  try {
    const { auth } = await initFirebase();
    return auth.currentUser;
  } catch (error) {
    console.error("[Firebase] Error getting current user:", error);
    return null;
  }
};

/**
 * Wait for authentication state to be resolved
 * Returns a promise that resolves when either:
 * 1. getRedirectResult returns a user, or
 * 2. onAuthStateChanged fires with a user
 * 
 * This follows the canonical Firebase authentication pattern
 * by checking for redirect result once and then listening for auth state
 */
const awaitAuth = async (): Promise<User | null> => {
  const { auth } = await initFirebase();
  
  // First check if redirect is completing
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[Firebase] User authenticated via redirect completion");
      return result.user;
    }
  } catch (error) {
    console.error("[Firebase] Error getting redirect result:", error);
    // Continue to onAuthStateChanged even if redirect fails
  }
  
  // If we already have a user, return it
  if (auth.currentUser) {
    console.log("[Firebase] User already signed in:", auth.currentUser.uid);
    return auth.currentUser;
  }
  
  // Wait for auth state to change
  return new Promise((resolve) => {
    // This will fire immediately if auth state is already determined
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("[Firebase] Auth state changed, user:", user?.uid ?? "null");
      unsubscribe(); // Clean up listener
      resolve(user);
    });
  });
};

// Export Firebase functions
export const firebaseAuth = {
  init: initFirebase,
  signIn,
  signOut,
  getCurrentUser,
  awaitAuth,
};