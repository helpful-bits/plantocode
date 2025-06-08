import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from '@tauri-apps/api/core';

import LoginPage from "@/app/components/auth/login-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useSystemPromptsLoader } from "@/auth/use-system-prompts-loader";
import { useAuth } from "@/contexts/auth-context";
import { useUILayout } from "@/contexts/ui-layout-context";
import { EmptyState, LoadingScreen } from "@/ui";
import { OnboardingFlow } from "@/app/components/onboarding";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
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

    const {
      isLoading: systemPromptsLoading,
      error: systemPromptsError,
      loadSystemPrompts,
      clearError: clearSystemPromptsError,
    } = useSystemPromptsLoader();

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
              const hasSetup = await Promise.race([
                invoke<boolean>('is_onboarding_completed_command'),
                new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('Onboarding check timeout')), 5000)
                )
              ]);
              setIsOnboardingNeeded(!hasSetup);
            } catch (storeError) {
              const errorInfo = extractErrorInfo(storeError);
              const userMessage = createUserFriendlyErrorMessage(errorInfo, "setup preferences");
              
              await logError(storeError, "AuthFlowManager.checkOnboardingStatus.storeAccess");
              // If we can't access settings store, assume onboarding is needed
              setIsOnboardingNeeded(true);
              showNotification({
                title: "Settings Access Failed",
                message: userMessage,
                type: "warning"
              });
            }
          } else {
            // If keyring is not required (debug mode), skip onboarding
            setIsOnboardingNeeded(false);
          }
        } catch (e) {
          const errorInfo = extractErrorInfo(e);
          const userMessage = createUserFriendlyErrorMessage(errorInfo, "setup status");
          
          await logError(e, "AuthFlowManager.checkOnboardingStatus");
          setIsOnboardingNeeded(true); // Default to needing onboarding if check fails
          showNotification({
            title: "Setup Check Failed",
            message: userMessage,
            type: "warning"
          });
        }
      };
      
      void checkOnboardingStatus();
    }, [showNotification]);

    const handleOnboardingComplete = async () => {
      try {
        await Promise.race([
          invoke('set_onboarding_completed_command'),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Onboarding save timeout')), 5000)
          )
        ]);
        setIsOnboardingNeeded(false);
        showNotification({
          title: "Setup Complete",
          message: "Vibe Manager is ready to use!",
          type: "success"
        });
      } catch (e) {
        const errorInfo = extractErrorInfo(e);
        const userMessage = createUserFriendlyErrorMessage(errorInfo, "setup preferences");
        
        await logError(e, "AuthFlowManager.handleOnboardingComplete");
        // Still proceed even if store fails
        setIsOnboardingNeeded(false);
        showNotification({
          title: "Setup Save Warning",
          message: `${userMessage} This won't affect functionality.`,
          type: "warning"
        });
      }
    };


    // Load runtime configuration and system prompts after successful login
    useEffect(() => {
      // Only load config and system prompts if we have a user
      if (user) {
        const initializeAfterAuth = async () => {
          try {
            // Load both runtime configuration and system prompts in parallel
            const [, systemPromptsResult] = await Promise.all([
              Promise.race([
                loadConfig(),
                new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('Configuration load timeout')), 30000)
                )
              ]),
              Promise.race([
                loadSystemPrompts(),
                new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error('System prompts load timeout')), 30000)
                )
              ])
            ]);

            if (!systemPromptsResult) {
              throw new Error('System prompts initialization failed');
            }
          } catch (err) {
            const errorInfo = extractErrorInfo(err);
            const userMessage = createUserFriendlyErrorMessage(errorInfo, "initialization");
            
            await logError(err, "AuthFlowManager.initializeAfterAuth", { userId: user?.id });
            showNotification({
              title: "Initialization Error",
              message: userMessage,
              type: "error"
            });
            // The individual loader hooks already update their error states
          }
        };

        void initializeAfterAuth();
      }
    }, [user, loadConfig, loadSystemPrompts]);

    // Set app initializing to false when all conditions for rendering main app are met
    useEffect(() => {
      const onboardingDone = !isOnboardingNeeded;
      const authResolved = !loading;
      const configResolved = !configLoading;
      const systemPromptsResolved = !systemPromptsLoading;
      const hasValidUser = !!user;
      const noConfigError = !configError;
      const noSystemPromptsError = !systemPromptsError;

      // Only mark initialization as complete when ALL conditions are satisfied
      if (onboardingDone && authResolved && configResolved && systemPromptsResolved && hasValidUser && noConfigError && noSystemPromptsError) {
        // All critical async operations before rendering main app are done
        setAppInitializing(false);
      } else {
        // If any condition is not met, ensure we're still in initializing state
        // This handles cases where dependencies change and we need to re-initialize
        setAppInitializing(true);
      }
    }, [
      isOnboardingNeeded,
      loading,
      configLoading,
      systemPromptsLoading,
      user,
      configError,
      systemPromptsError,
      setAppInitializing
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

    // Show loading screen while fetching system prompts
    if (systemPromptsLoading) {
      return <LoadingScreen loadingType="initializing" />;
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

    // Show error screen if system prompts failed
    if (systemPromptsError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <div className="max-w-md w-full p-8">
            <EmptyState
              variant="error"
              title="System Prompts Error"
              description={systemPromptsError}
              actionText="Retry"
              onAction={() => {
                clearSystemPromptsError();
                void loadSystemPrompts();
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
