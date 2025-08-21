'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WelcomeStep } from './WelcomeStep';
import { KeychainExplanationStep } from './KeychainExplanationStep';
import { KeychainActionStep } from './KeychainActionStep';
import { OnboardingErrorStep } from './OnboardingErrorStep';
import { LoadingScreen } from '@/ui';
import { usePlausible } from '@/hooks/use-plausible';

type OnboardingState = 'checking_storage' | 'welcome' | 'keychain_explanation' | 'keychain_action' | 'error';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const { trackEvent } = usePlausible();
  const [state, setState] = useState<OnboardingState>('checking_storage');
  const [isKeychainMode, setIsKeychainMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleOnboardingComplete = () => {
    trackEvent('desktop_onboarding_completed', {
      keychain_mode: isKeychainMode.toString(),
      location: 'onboarding_flow'
    });
    onOnboardingComplete();
  };

  // Check storage mode on mount
  useEffect(() => {
    const checkStorageMode = async () => {
      try {
        const sessionStorageMode = await invoke<boolean>('get_storage_mode');
        setIsKeychainMode(!sessionStorageMode);
        setState('welcome');
      } catch (e) {
        console.error('Error checking storage mode:', e);
        // Default to keychain mode if check fails
        setIsKeychainMode(true);
        setState('welcome');
      }
    };

    void checkStorageMode();
  }, []);

  const handleGetStarted = async () => {
    if (isKeychainMode) {
      try {
        // Check if we already have keychain access from a previous session
        const hasAccess = await invoke<boolean>('check_existing_keychain_access');
        
        if (hasAccess) {
          // User has already granted "Always Allow" in the past
          // Skip the explanation and go straight to completion
          console.log('Keychain access already granted, skipping onboarding explanation');
          handleOnboardingComplete();
        } else {
          // First time user or access was denied - show explanation
          setState('keychain_explanation');
        }
      } catch (error) {
        console.error('Error checking keychain access:', error);
        // If check fails, show explanation to be safe
        setState('keychain_explanation');
      }
    } else {
      // For session storage mode, complete onboarding immediately
      onOnboardingComplete();
    }
  };

  const handleKeychainProceed = () => {
    setState('keychain_action');
  };

  const handleKeychainSuccess = () => {
    onOnboardingComplete();
  };

  const handleKeychainError = (error: string) => {
    setErrorMessage(error);
    setState('error');
  };

  const handleRetry = () => {
    setState('keychain_action');
  };

  switch (state) {
    case 'checking_storage':
      return <LoadingScreen loadingType="initializing" />;

    case 'welcome':
      return <WelcomeStep onGetStarted={handleGetStarted} />;

    case 'keychain_explanation':
      return <KeychainExplanationStep onProceed={handleKeychainProceed} />;

    case 'keychain_action':
      return (
        <KeychainActionStep
          onSuccess={handleKeychainSuccess}
          onError={handleKeychainError}
        />
      );

    case 'error':
      return (
        <OnboardingErrorStep
          errorMessage={errorMessage}
          onRetry={handleRetry}
        />
      );

    default:
      return <LoadingScreen loadingType="initializing" />;
  }
}