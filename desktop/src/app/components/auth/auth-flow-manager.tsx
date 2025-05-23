import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Store } from '@tauri-apps/plugin-store';

import LoginPage from "@/app/components/auth/login-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useAuth } from "@/contexts/auth-context";
import { EmptyState, LoadingScreen } from "@/ui";
import { OnboardingFlow } from "@/app/components/onboarding";
import { APP_SETTINGS_STORE } from "@/utils/constants";

interface AuthFlowManagerProps {
  children: ReactNode;
}

export function AuthFlowManager({ children }: AuthFlowManagerProps) {
  const [isOnboardingNeeded, setIsOnboardingNeeded] = useState<boolean | null>(null);
  
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

    // Check onboarding status on mount
    useEffect(() => {
      const checkOnboardingStatus = async () => {
        try {
          const settingsStore = await Store.load(APP_SETTINGS_STORE);
          const hasSetup = await settingsStore.get<boolean>('hasCompletedOnboarding');
          setIsOnboardingNeeded(!hasSetup);
        } catch (e) {
          console.error("Error checking onboarding status:", e);
          setIsOnboardingNeeded(true); // Default to needing onboarding if store fails
        }
      };
      checkOnboardingStatus();
    }, []);

    const handleOnboardingComplete = async () => {
      try {
        const settingsStore = await Store.load(APP_SETTINGS_STORE);
        await settingsStore.set('hasCompletedOnboarding', true);
        await settingsStore.save();
        setIsOnboardingNeeded(false);
      } catch (e) {
        console.error("Error saving onboarding status:", e);
        // Still proceed even if store fails
        setIsOnboardingNeeded(false);
      }
    };


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
    }, [user]); // Remove loadConfig from deps to prevent infinite loop

    // Show loading screen while checking onboarding status
    if (isOnboardingNeeded === null) {
      return <LoadingScreen loadingType="initializing" />;
    }

    // Show onboarding flow if needed
    if (isOnboardingNeeded) {
      return <OnboardingFlow onOnboardingComplete={handleOnboardingComplete} />;
    }

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
