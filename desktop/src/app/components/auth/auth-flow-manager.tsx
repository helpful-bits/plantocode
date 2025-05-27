import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Store } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';

import LoginPage from "@/app/components/auth/login-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useAuth } from "@/contexts/auth-context";
import { useUILayout } from "@/contexts/ui-layout-context";
import { EmptyState, LoadingScreen } from "@/ui";
import { OnboardingFlow } from "@/app/components/onboarding";
import { APP_SETTINGS_STORE } from "@/utils/constants";
import { logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { useAuthTokenRefresher } from "@/hooks/use-auth-token-refresher";

interface AuthFlowManagerProps {
  children: ReactNode;
}

export function AuthFlowManager({ children }: AuthFlowManagerProps) {
  const [isOnboardingNeeded, setIsOnboardingNeeded] = useState<boolean | null>(null);
  const { showNotification } = useNotification();
  
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

    const { setAppInitializing } = useUILayout();

    // Use the token refresher hook to keep the JWT fresh
    useAuthTokenRefresher(user);

    // Check onboarding status on mount
    useEffect(() => {
      const checkOnboardingStatus = async () => {
        try {
          // First check storage mode with timeout
          const storageMode = await Promise.race([
            invoke<string>('get_storage_mode'),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Storage mode check timeout')), 10000)
            )
          ]);
          
          const isKeyringRequired = storageMode === 'keyring';
          
          if (isKeyringRequired) {
            // If keyring is required, check if onboarding has been completed
            try {
              const settingsStore = await Promise.race([
                Store.load(APP_SETTINGS_STORE),
                new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('Store load timeout')), 5000)
                )
              ]);
              const hasSetup = await settingsStore.get<boolean>('hasCompletedOnboarding');
              setIsOnboardingNeeded(!hasSetup);
            } catch (storeError) {
              await logError(storeError, "Auth Flow - Settings Store Access Failed");
              // If we can't access settings store, assume onboarding is needed
              setIsOnboardingNeeded(true);
              showNotification({
                title: "Settings Access Failed",
                message: "Unable to check setup preferences. Starting fresh setup.",
                type: "warning"
              });
            }
          } else {
            // If keyring is not required (debug mode), skip onboarding
            setIsOnboardingNeeded(false);
          }
        } catch (e) {
          await logError(e, "Auth Flow - Onboarding Status Check Failed");
          setIsOnboardingNeeded(true); // Default to needing onboarding if check fails
          showNotification({
            title: "Setup Check Failed",
            message: "Unable to check setup status. Starting fresh setup for security.",
            type: "warning"
          });
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
        await logError(e, "Auth Flow - Onboarding Status Save Failed");
        // Still proceed even if store fails
        setIsOnboardingNeeded(false);
        showNotification({
          title: "Setup Save Warning",
          message: "Setup completed but preferences may not persist. This won't affect functionality.",
          type: "warning"
        });
      }
    };


    // Load runtime configuration after successful login
    useEffect(() => {
      // Only load config if we have a user
      if (user) {
        const initializeConfig = async () => {
          try {
            // Load runtime configuration with timeout protection
            await Promise.race([
              loadConfig(),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Configuration load timeout')), 30000)
              )
            ]);
          } catch (err) {
            await logError(err, "Auth Flow - Configuration Load Failed", { userId: user?.id });
            // Show user-friendly notification for configuration failures
            if (err instanceof Error && err.message.includes('timeout')) {
              showNotification({
                title: "Configuration Timeout",
                message: "Configuration loading is taking longer than expected. Please check your connection.",
                type: "error"
              });
            }
            // We don't handle the error here because the loadConfig function
            // already updates the error state in the runtime config loader hook
          }
        };

        void initializeConfig();
      }
    }, [user, loadConfig]);

    // Set app initializing to false when all conditions for rendering main app are met
    useEffect(() => {
      const onboardingDone = !isOnboardingNeeded;
      const authResolved = !loading;
      const configResolved = !configLoading;

      if (onboardingDone && authResolved && configResolved && user && !configError) {
        // All critical async operations before rendering main app are done
        setAppInitializing(false);
      }
    }, [
      isOnboardingNeeded,
      loading,
      configLoading,
      user,
      configError,
      setAppInitializing,
      loadConfig
    ]);

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

    // Main app is ready to render - children include ProjectProvider and other contexts
    return <>{children}</>;
  } catch (error) {
    logError(error, "Auth Flow - Critical Initialization Error").catch(() => {
      // Swallow logging errors to prevent recursive failures
    });
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="max-w-md w-full p-8">
          <EmptyState
            variant="error"
            title="Startup Error"
            description="Unable to initialize the application. Please restart and try again."
            actionText="Reload"
            onAction={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }
}
