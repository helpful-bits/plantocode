import { useEffect } from "react";

import LoginPage from "@/app/components/auth/login-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useAuth } from "@/contexts/auth-context";
import { EmptyState, LoadingScreen } from "@/ui";

interface AuthFlowManagerProps {
  children: React.ReactNode;
}

export function AuthFlowManager({ children }: AuthFlowManagerProps) {
  const { 
    user, 
    loading, 
    token,
    initializeStrongholdAndResumeSession
  } = useAuth();
  
  const {
    isLoading: configLoading,
    error: configError,
    loadConfig,
    clearError,
  } = useRuntimeConfigLoader();

  // Initialize Stronghold and load runtime configuration
  useEffect(() => {
    // On mount, make sure Stronghold is initialized
    initializeStrongholdAndResumeSession().catch(error => 
      console.error("[AuthFlow] Failed to initialize Stronghold:", error)
    );
  }, [initializeStrongholdAndResumeSession]);

  // Load runtime configuration after successful login
  useEffect(() => {
    console.log("[AuthFlow] Effect triggered. User:", user, "Token:", !!token);
    
    // Only load config if we have a user and token
    if (user && token) {
      const initializeConfig = async () => {
        try {
          console.log("[AuthFlow] User authenticated, loading runtime configuration");
          // Load runtime configuration (this also stores the token in Rust backend)
          await loadConfig(token);
          console.log("[AuthFlow] Runtime configuration loaded successfully");
        } catch (err) {
          console.error("[AuthFlow] Error during auth flow initialization:", err);
          // We don't handle the error here because the loadConfig function
          // already updates the error state in the runtime config loader hook
        }
      };

      void initializeConfig();
    } else if (user && !token) {
      console.error("[AuthFlow] User authenticated but token unavailable. Waiting for resolution.");
    } else {
      console.log("[AuthFlow] No user or token, awaiting authentication.");
    }
  }, [user, token, loadConfig]);

  // Show loading screen while authenticating
  if (loading) {
    return <LoadingScreen loadingType="login" />;
  }

  // Show loading screen while fetching configuration
  if (configLoading) {
    return <LoadingScreen loadingType="configuration" />;
  }

  // Show error screen if configuration failed
  if (configError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="max-w-md w-full p-8">
          <EmptyState
            variant="error"
            title="Configuration Error"
            description={configError}
            actionText="Retry"
            onAction={() => {
              clearError();
              if (token) {
                void loadConfig(token);
              }
            }}
          />
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
