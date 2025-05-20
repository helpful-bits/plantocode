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
  signIn: (provider?: "google" | "github" | "microsoft" | "apple") => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  initializeStrongholdAndResumeSession: () => Promise<void>;
}