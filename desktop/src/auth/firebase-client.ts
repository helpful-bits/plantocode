/**
 * Firebase Client for Vibe Manager Desktop
 * Manages Firebase authentication for the desktop application
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithRedirect, 
  GoogleAuthProvider, 
  GithubAuthProvider,
  OAuthProvider,
  getRedirectResult,
  signOut as fbSignOut,
  User,
  Auth,
  UserCredential
} from 'firebase/auth';

// Firebase configuration loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Firebase app singleton
let app: any;
let auth: Auth;

/**
 * Initialize Firebase
 */
const initFirebase = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
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
  const provider = new OAuthProvider('microsoft.com');
  await signInWithRedirect(auth, provider);
};

/**
 * Sign in with Apple
 */
const signInWithApple = async () => {
  initFirebase();
  const provider = new OAuthProvider('apple.com');
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
  } catch (error) {
    console.error('Error handling redirect:', error);
    throw error;
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
const signIn = async (providerName: 'google' | 'github' | 'microsoft' | 'apple' = 'google'): Promise<void> => {
  switch (providerName) {
    case 'google':
      await signInWithGoogle();
      break;
    case 'github':
      await signInWithGithub();
      break;
    case 'microsoft':
      await signInWithMicrosoft();
      break;
    case 'apple':
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
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen('deep-link', (event: any) => {
      console.log('Received deep link event:', event);
      
      // Check if event contains a URL
      if (event && event.payload) {
        const url = event.payload.url || event.payload;
        console.log('Deep link URL:', url);
        
        // Process the deep link URL through the provided callback
        callback(url);
      }
    });
    
    console.log('Deep link handler setup complete');
    return unlisten;
  } catch (error) {
    console.error('Failed to set up deep link handler:', error);
    return () => {};
  }
};

// Export Firebase functions
export const firebaseAuth = {
  signIn,
  signOut,
  handleRedirect: handleRedirectResult,
  getCurrentUser,
  setupDeepLinkHandler
};