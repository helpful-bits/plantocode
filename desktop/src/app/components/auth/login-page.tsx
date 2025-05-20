/**
 * Login Page Component for Vibe Manager Desktop
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/auth-context";

export default function LoginPage() {
  const { signIn, loading, error } = useAuth();
  const appName = "Vibe Manager";
  const [authInProgress, setAuthInProgress] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Effect to update the local error state when the auth error changes
  useEffect(() => {
    if (error) {
      setLastError(error);
      // Auto-clear auth in progress state if there's an error
      setAuthInProgress(false);
    }
  }, [error]);

  // Handle sign-in with a specific provider
  const handleSignIn = async (provider: "google" | "github" | "microsoft" | "apple") => {
    // Clear any previous errors
    setLastError(null);
    setAuthInProgress(true);
    
    try {
      console.log(`[LoginPage] Initiating sign in with ${provider}`);
      await signIn(provider);
      // We don't immediately set authInProgress to false since we're waiting for a callback
      // The external browser will be opened and we expect a deep link later
      console.log(`[LoginPage] Sign in with ${provider} initiated, waiting for redirect`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LoginPage] Sign in with ${provider} failed:`, error);
      setLastError(`Sign in failed: ${errorMessage}`);
      setAuthInProgress(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-10 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {appName}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to continue to your workspace
          </p>
        </div>

        {(error || lastError) && (
          <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 p-3 rounded-md text-sm">
            {error || lastError}
          </div>
        )}

        {authInProgress && !loading && (
          <div className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 p-3 rounded-md text-sm">
            Authentication in progress. Please complete the sign-in in your browser.
            You'll be redirected back to the app automatically after signing in.
          </div>
        )}

        <div className="mt-8 space-y-4">
          <button
            onClick={() => handleSignIn("google")}
            disabled={loading || authInProgress}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with Google"}
          </button>

          <button
            onClick={() => handleSignIn("github")}
            disabled={loading || authInProgress}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with GitHub"}
          </button>

          <button
            onClick={() => handleSignIn("microsoft")}
            disabled={loading || authInProgress}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with Microsoft"}
          </button>

          <button
            onClick={() => handleSignIn("apple")}
            disabled={loading || authInProgress}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-900 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in with Apple"}
          </button>

          <div className="text-sm text-center mt-6">
            <p className="text-gray-500 dark:text-gray-400">
              By signing in, you agree to our Terms of Service and Privacy
              Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
