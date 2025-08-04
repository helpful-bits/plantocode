import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from '@tauri-apps/api/core';

import LoginPage from "@/app/components/auth/login-page";
import ServerSelectionPage from "@/app/components/auth/server-selection-page";
import { useRuntimeConfigLoader } from "@/auth/use-runtime-config-loader";
import { useAuth } from "@/contexts/auth-context";
import { useUILayout } from "@/contexts/ui-layout-context";
import { EmptyState, LoadingScreen } from "@/ui";
import { OnboardingFlow } from "@/app/components/onboarding";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { useAuthTokenRefresher } from "@/hooks/use-auth-token-refresher";
import type { ServerRegionInfo } from "@/types/tauri-commands";

interface AuthFlowManagerProps {
  children: ReactNode;
}

export function AuthFlowManager({ children }: AuthFlowManagerProps) {
  const [isOnboardingNeeded, setIsOnboardingNeeded] = useState<boolean | null>(null);
  const [availableRegions, setAvailableRegions] = useState<ServerRegionInfo[] | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null | undefined>(undefined);
  const { showNotification } = useNotification();
  
  // Safe version - early return if not ready
  if (typeof window === 'undefined') {
    return null; // SSR guard
  }

  try {
    const { 
      user, 
      loading,
      isTokenExpired
    } = useAuth();
    
    const {
      isLoading: configLoading,
      error: configError,
      loadConfig,
      clearError,
    } = useRuntimeConfigLoader();

    // System prompts functionality has been removed

    const { setAppInitializing } = useUILayout();

    // Use the token refresher hook to keep the JWT fresh
    useAuthTokenRefresher(user);

    // Check for selected server URL and get available regions
    useEffect(() => {
      const checkServerSelection = async () => {
        try {
          // First check if a server URL is already selected
          const currentUrl = await invoke<string | null>('get_selected_server_url_command', {});
          
          if (currentUrl) {
            setSelectedUrl(currentUrl);
          } else {
            // No URL selected, get available regions
            setSelectedUrl(null);
            try {
              const regions = await invoke<ServerRegionInfo[]>('get_available_regions_command', {});
              setAvailableRegions(regions);
            } catch (regionError) {
              const errorInfo = extractErrorInfo(regionError);
              const userMessage = createUserFriendlyErrorMessage(errorInfo, "available server regions");
              
              await logError(regionError, "AuthFlowManager.checkServerSelection.getRegions");
              showNotification({
                title: "Server Region Error",
                message: userMessage,
                type: "error"
              });
            }
          }
        } catch (e) {
          const errorInfo = extractErrorInfo(e);
          const userMessage = createUserFriendlyErrorMessage(errorInfo, "server selection");
          
          await logError(e, "AuthFlowManager.checkServerSelection");
          setSelectedUrl(null); // Default to no selection if check fails
          showNotification({
            title: "Server Check Failed",
            message: userMessage,
            type: "warning"
          });
        }
      };
      
      void checkServerSelection();
    }, [showNotification]);

    // Check onboarding status on mount
    useEffect(() => {
      const checkOnboardingStatus = async () => {
        try {
          // First check storage mode
          const sessionStorageMode = await invoke<boolean>('get_storage_mode');
          
          if (sessionStorageMode) {
            // If session storage is used, skip onboarding
            setIsOnboardingNeeded(false);
          } else {
            // If keychain is used, check if onboarding has been completed
            try {
              const hasSetup = await invoke<boolean>('is_onboarding_completed_command');
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
        await invoke('set_onboarding_completed_command');
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

    const handleServerSelection = async (url: string) => {
      try {
        await invoke('set_selected_server_url_command', { url });
        setSelectedUrl(url);
        showNotification({
          title: "Server Selected",
          message: "Server region has been updated successfully",
          type: "success"
        });
      } catch (e) {
        const errorInfo = extractErrorInfo(e);
        const userMessage = createUserFriendlyErrorMessage(errorInfo, "server selection");
        
        await logError(e, "AuthFlowManager.handleServerSelection");
        showNotification({
          title: "Server Selection Failed",
          message: userMessage,
          type: "error"
        });
      }
    };

    // Load runtime configuration after successful login
    useEffect(() => {
      // Only load config if we have a user
      if (user) {
        const initializeAfterAuth = async () => {
          try {
            // Load runtime configuration
            let configTimeoutId: ReturnType<typeof setTimeout>;
            
            const configTimeoutPromise = new Promise<never>((_, reject) => {
              configTimeoutId = setTimeout(() => reject(new Error('Configuration load timeout')), 30000);
            });

            try {
              await Promise.race([
                loadConfig(),
                configTimeoutPromise
              ]);
            } finally {
              clearTimeout(configTimeoutId!);
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
    }, [user, loadConfig]);

    // Set app initializing to false when all conditions for rendering main app are met
    useEffect(() => {
      const onboardingDone = !isOnboardingNeeded;
      const authResolved = !loading;
      const configResolved = !configLoading;
      const hasValidUser = !!user;
      const noConfigError = !configError;
      const tokenValid = !isTokenExpired;
      const serverSelected = selectedUrl !== null && selectedUrl !== undefined;

      // Only mark initialization as complete when ALL conditions are satisfied
      if (onboardingDone && authResolved && configResolved && hasValidUser && noConfigError && tokenValid && serverSelected) {
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
      user,
      configError,
      isTokenExpired,
      selectedUrl,
      setAppInitializing
    ]);

    // Show loading screen while checking onboarding status or server selection
    if (isOnboardingNeeded === null || selectedUrl === undefined) {
      return <LoadingScreen loadingType="initializing" />;
    }

    // Show onboarding flow if needed
    if (isOnboardingNeeded) {
      return <OnboardingFlow onOnboardingComplete={handleOnboardingComplete} />;
    }

    // Show server selection page if no URL is selected and regions are available
    if (selectedUrl === null && availableRegions) {
      return <ServerSelectionPage regions={availableRegions} onSelect={handleServerSelection} />;
    }

    // Show loading screen while authenticating
    if (loading) {
      return <LoadingScreen loadingType="login" />;
    }

    // Show loading screen while fetching configuration
    if (configLoading) {
      return <LoadingScreen loadingType="configuration" />;
    }

    // System prompts loading removed

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

    // System prompts error handling removed

    // Show login page if URL is selected but not authenticated or token is expired
    if ((!user || isTokenExpired) && selectedUrl) {
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
