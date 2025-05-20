/**
 * Firebase Client for Vibe Manager Desktop
 * Manages Firebase authentication for the desktop application
 */

import { initializeApp, getApp, type FirebaseApp } from "firebase/app";
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
// Remove unused imports

// Firebase app singleton
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firebaseInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize Firebase with configuration
 * Uses a singleton promise to prevent multiple parallel initialization attempts
 */
const initFirebase = async (): Promise<void> => {
  // If already initialized, just return
  if (firebaseInitialized && app && auth) {
    console.log("[Firebase] Already initialized, skipping");
    return;
  }
  
  // If initialization is in progress, return the existing promise
  if (initializationPromise) {
    console.log("[Firebase] Initialization already in progress, awaiting completion");
    return initializationPromise;
  }
  
  // Create a new initialization promise
  initializationPromise = new Promise<void>(async (resolve, reject) => {
    // Set a timeout to avoid hanging indefinitely
    const timeoutId = setTimeout(() => {
      console.error("[Firebase] Initialization timed out");
      reject(new Error("Firebase initialization timed out after 10 seconds"));
    }, 10000);
    
    try {
      // Using hard-coded configuration for simplicity
      // This is just for demonstration and should be replaced with a secure method in production
      const firebaseConfig = {
        apiKey: "AIzaSyAmxCdBIVk5YqcByceVq0v9LR2_Il7fBS4",
        authDomain: "vibe-manager-1dce5.firebaseapp.com",
        projectId: "vibe-manager-1dce5",
        storageBucket: "vibe-manager-1dce5.firebasestorage.app",
        messagingSenderId: "459340587829",
        appId: "1:459340587829:web:7939e9b5b3628b54a1a27c",
        measurementId: "G-B4B6RC5Z8H"
      };

      console.log("[Firebase] Initializing with config:", JSON.stringify({
        apiKey: "***HIDDEN***",
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId
      }));
      
      // Handle the case where Firebase might already be initialized (from a previous attempt)
      try {
        app = initializeApp(firebaseConfig);
      } catch (initErr: any) {
        // If Firebase is already initialized, get the existing app
        if (initErr.code === 'app/duplicate-app') {
          console.log("[Firebase] App already exists, getting existing instance");
          app = getApp();
        } else {
          throw initErr;
        }
      }
      
      auth = getAuth(app);
      firebaseInitialized = true;
      console.log("[Firebase] Initialized successfully");
      
      clearTimeout(timeoutId);
      resolve();
    } catch (error) {
      console.error("[Firebase] Failed to initialize:", error);
      clearTimeout(timeoutId);
      reject(error);
    } finally {
      initializationPromise = null;
    }
  });
  
  return initializationPromise;
};

/**
 * Ensure Firebase is initialized and return the auth object
 * Includes retry logic for more reliable initialization
 */
const getFirebaseAuth = async (retryAttempts: number = 2): Promise<Auth> => {
  const attemptGetAuth = async (attemptsLeft: number): Promise<Auth> => {
    try {
      console.log(`[Firebase] Getting Firebase auth (attempts left: ${attemptsLeft})`);
      
      // Attempt to initialize Firebase
      await initFirebase();
      
      // Check if auth is available
      if (!auth) {
        console.warn("[Firebase] Auth is still not initialized after initFirebase");
        
        // If we have attempts left, retry after a short delay
        if (attemptsLeft > 0) {
          console.log(`[Firebase] Retrying initialization in 500ms, ${attemptsLeft} attempts left`);
          await new Promise(resolve => setTimeout(resolve, 500));
          return attemptGetAuth(attemptsLeft - 1);
        }
        
        // No more attempts, throw error
        throw new Error("Firebase auth is not initialized after multiple attempts");
      }
      
      console.log("[Firebase] Auth instance obtained successfully");
      return auth;
    } catch (error) {
      // If we have attempts left, retry
      if (attemptsLeft > 0) {
        console.warn(`[Firebase] Error getting Firebase auth, retrying in 500ms: ${error}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return attemptGetAuth(attemptsLeft - 1);
      }
      
      // No more attempts, propagate the error
      console.error("[Firebase] All attempts to get Firebase auth failed:", error);
      throw error;
    }
  };
  
  return attemptGetAuth(retryAttempts);
};

/**
 * Sign in with Google using OAuth
 */
const signInWithGoogle = async () => {
  await initFirebase();
  
  const auth = await getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with GitHub using OAuth
 */
const signInWithGithub = async () => {
  await initFirebase();
  
  const auth = await getFirebaseAuth();
  const provider = new GithubAuthProvider();
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with Microsoft using OAuth
 */
const signInWithMicrosoft = async () => {
  await initFirebase();
  
  const auth = await getFirebaseAuth();
  const provider = new OAuthProvider("microsoft.com");
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with Apple using OAuth
 */
const signInWithApple = async () => {
  await initFirebase();
  
  const auth = await getFirebaseAuth();
  const provider = new OAuthProvider("apple.com");
  await signInWithRedirect(auth, provider);
};

/**
 * Handle redirect result with retries
 * This function now includes retry logic to ensure the redirect result is properly captured
 */
const handleRedirectResult = async (): Promise<UserCredential | null> => {
  // Maximum number of retries
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // If not the first attempt, add a delay to allow Firebase auth to settle
      if (attempt > 0) {
        const delayMs = 500 * attempt; // Increasing backoff
        console.log(`[FirebaseClient] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      // Get Firebase auth with its own retry mechanism
      const auth = await getFirebaseAuth();
      
      // Log the current auth state for debugging
      const currentUser = auth.currentUser;
      console.log(`[FirebaseClient] Current auth state before getRedirectResult: User ${currentUser ? 'present' : 'absent'}`);
      
      // Get the redirect result
      const result = await getRedirectResult(auth);
      
      // result is null if no redirect operation was pending or if the page was reloaded.
      console.log("[FirebaseClient] getRedirectResult outcome:", result ? "Credential received" : "No credential/pending redirect");
      
      // If we got a result or this is our last attempt, return the result (null is valid if no redirect pending)
      if (result || attempt === maxRetries) {
        return result;
      }
      
      // Otherwise continue to the next retry
      console.log("[FirebaseClient] No result from getRedirectResult, will retry");
    } catch (error: any) {
      lastError = error;
      
      // Certain errors are expected and shouldn't be retried
      if (error.code === 'auth/no-auth-event') {
        console.log("[FirebaseClient] No auth event was in progress (normal)");
        return null;
      }
      
      // If this is our last attempt, throw the error
      if (attempt === maxRetries) {
        console.error(`[FirebaseClient] Final attempt ${attempt}/${maxRetries} failed:`, error);
        throw error;
      }
      
      // Otherwise log and continue to the next retry
      console.warn(`[FirebaseClient] Attempt ${attempt}/${maxRetries} failed:`, error);
    }
  }
  
  // This should not be reached due to the return in the last iteration above
  throw lastError || new Error('Unexpected redirect result handling failure');
};

/**
 * Sign out
 */
const signOut = async (): Promise<void> => {
  try {
    const auth = await getFirebaseAuth();
    await fbSignOut(auth);
    console.log("[FirebaseClient] User signed out successfully");
  } catch (error) {
    console.error("[FirebaseClient] Error signing out:", error);
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

// processAuthCallback is removed as we now use standard Firebase handleRedirect

/**
 * Set up deep link handler for Tauri
 * The callback should trigger handleRedirectResult to process Firebase auth redirects
 */
const setupDeepLinkHandler = async (callback: () => void) => {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    
    // Add a log to confirm we're entering the handler setup
    console.log("[FirebaseClient] Setting up deep link handler");
    
    // First ensure Firebase is initialized to avoid issues during the callback
    try {
      await initFirebase();
      console.log("[FirebaseClient] Firebase initialized before setting up deep link handler");
    } catch (error) {
      console.warn("[FirebaseClient] Firebase pre-initialization failed, will retry during callback:", error);
    }
    
    // Set up the actual listener
    const unlisten = await listen("deep-link", async (event: { payload: string | { url: string } }) => {
      // Check if event contains a URL
      if (event && event.payload) {
        const url = typeof event.payload === 'string' 
          ? event.payload 
          : 'url' in event.payload ? event.payload.url : '';
        
        if (url) {
          console.log("[FirebaseClient] Received deep link:", url);
          
          // Make sure Firebase is initialized before processing the callback
          try {
            await initFirebase();
            console.log("[FirebaseClient] Firebase initialized in deep link handler");
            
            // The URL may be an OAuth callback - trigger the callback
            // which should call handleRedirectResult() to let Firebase SDK
            // process the auth state
            callback();
          } catch (error) {
            console.error("[FirebaseClient] Error initializing Firebase in deep link handler:", error);
            // Try to call callback anyway as a fallback
            callback();
          }
        } else {
          console.warn("[FirebaseClient] Received deep link event with empty URL");
        }
      } else {
        console.warn("[FirebaseClient] Received invalid deep link event:", event);
      }
    });

    console.log("[FirebaseClient] Deep link handler set up successfully");
    return unlisten;
  } catch (error) {
    console.error("[FirebaseClient] Failed to set up deep link handler:", error);
    return () => {
      console.log("[FirebaseClient] Called no-op unlisten function from failed deep link handler");
    };
  }
};

/**
 * Debug function to get Firebase Auth status
 */
const getAuthStatus = async (): Promise<string> => {
  try {
    if (!app) {
      return "Firebase app not initialized";
    }
    if (!auth) {
      return "Firebase auth not initialized";
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return "No user signed in";
    }
    return `User signed in: ${currentUser.email || currentUser.uid}`;
  } catch (error) {
    return `Error getting auth status: ${error}`;
  }
};

// Export Firebase functions
export const firebaseAuth = {
  signIn,
  signOut,
  handleRedirect: handleRedirectResult,
  getCurrentUser,
  setupDeepLinkHandler,
  getAuth: getFirebaseAuth,
  getAuthStatus,
};