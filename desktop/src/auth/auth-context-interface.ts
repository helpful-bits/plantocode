import { FrontendUser } from '../types';

// Local alias for User to maintain backward compatibility 
// while matching the backend FrontendUser structure
export type User = FrontendUser;

export interface AuthContextType {
  user?: User;
  loading: boolean;
  error?: string;
  token?: string;
  tokenExpiresAt?: number;
  signIn: (providerHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | undefined>;
}