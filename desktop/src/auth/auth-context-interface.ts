import { FrontendUser } from '../types';

export interface AuthContextType {
  user?: FrontendUser;
  loading: boolean;
  error?: string;
  token?: string;
  tokenExpiresAt?: number;
  isTokenExpired: boolean;
  setTokenExpired: (expired: boolean) => void;
  signIn: (providerHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | undefined>;
}