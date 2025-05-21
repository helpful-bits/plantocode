import { useEffect } from "react";
import type { ReactNode } from "react";

import LoginPage from "@/app/components/auth/login-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useAuth } from "@/contexts/auth-context";
import { EmptyState, LoadingScreen } from "@/ui";

interface AuthFlowManagerProps {
  children: ReactNode;
}

export function AuthFlowManager({ children }: AuthFlowManagerProps) {
  // Safe version - early return if not ready
  if (typeof window === 'undefined') {
    return null; // SSR guard
  }

  try {
    const { 
      user, 
      loading
    } = useAuth();
    
    const {
      isLoading: configLoading,
      error: configError,
      loadConfig,
      clearError,
    } = useRuntimeConfigLoader();


    // Load runtime configuration after successful login
    useEffect(() => {
      // Only load config if we have a user
      if (user) {
        const initializeConfig = async () => {
          try {
            // Load runtime configuration
            await loadConfig();
          } catch (err) {
            console.error("[AuthFlow] Error during auth flow initialization:", err);
            // We don't handle the error here because the loadConfig function
            // already updates the error state in the runtime config loader hook
          }
        };

        void initializeConfig();
      }
    }, [user, loadConfig]);

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
                void loadConfig();
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
  } catch (error) {
    console.error("[AuthFlow] Error initializing auth flow:", error);
    return <LoadingScreen loadingType="initializing" />;
  }
}
