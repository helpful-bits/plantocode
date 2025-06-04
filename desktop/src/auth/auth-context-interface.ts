import { FrontendUser } from '../types';

export interface AuthContextType {
  user?: FrontendUser;
  loading: boolean;
  error?: string;
  token?: string;
  tokenExpiresAt?: number;
  signIn: (providerHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | undefined>;
}