/**
 * Shared interfaces for authentication context
 *
 * These interfaces define the common shape of authentication contexts
 * across different platforms (web, desktop). They should be implemented
 * by platform-specific auth providers.
 */

export interface User {
  id: string;
  email: string | null;
  name?: string | null;
  photoURL?: string | null;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}