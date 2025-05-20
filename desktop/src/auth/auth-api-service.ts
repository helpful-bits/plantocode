/**
 * Authentication API Service
 *
 * Provides functions for server-side authentication operations, including token validation.
 */

import { type User } from "./auth-context-interface";

/**
 * Validates a token with the server and returns user data
 * @param token The Firebase ID token to validate
 * @returns Promise resolving to user data after server validation
 */
export async function fetchValidatedUser(token: string): Promise<User> {
  // Get server URL from environment
  const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:8080";

  // Call server to validate token
  const response: Response = await fetch(`${serverUrl}/api/auth/validate`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Invalid token");
  }

  // Explicitly type the response to avoid unsafe assignment
  const userData: Record<string, unknown> = await response.json();
  
  // Access properties safely with type guard
  if (typeof userData === 'object' && userData !== null) {
    // Create user object with proper type safety
    return {
      id: typeof userData.id === 'string' ? userData.id : '',
      email: typeof userData.email === 'string' ? userData.email : '',
      name: typeof userData.name === 'string' ? userData.name : null,
      photoURL: typeof userData.photoURL === 'string' ? userData.photoURL : null,
    };
  }
  
  throw new Error("Invalid user data format");
}
