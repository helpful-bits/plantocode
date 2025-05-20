import { useEffect } from "react";

import LoginPage from "@/app/components/auth/login-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useAuth } from "@/contexts/auth-context";
import { EmptyState, LoadingScreen } from "@/ui";

interface AuthFlowManagerProps {
  children: React.ReactNode;
}

export function AuthFlowManager({ children }: AuthFlowManagerProps) {
  const { user, loading, token } = useAuth();
  const {
    isLoading: configLoading,
    error: configError,
    loadConfig,
    clearError,
  } = useRuntimeConfigLoader();

  // Load runtime configuration after successful login
  useEffect(() => {
    if (user && token) {
      const initializeConfig = async () => {
        try {
          // Load runtime configuration (this also stores the token)
          await loadConfig(token);
        } catch (err) {
          console.error("Error during auth flow initialization:", err);
        }
      };

      void initializeConfig();
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
