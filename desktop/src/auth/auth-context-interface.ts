import { FrontendUser } from '../types';

// Local alias for User to maintain backward compatibility 
// while matching the backend FrontendUser structure
export type User = FrontendUser;

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  signIn: (provider?: "google" | "github" | "microsoft" | "apple") => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}