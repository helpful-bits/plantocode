'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WelcomeStep } from './WelcomeStep';
import { KeychainExplanationStep } from './KeychainExplanationStep';
import { KeychainActionStep } from './KeychainActionStep';
import { OnboardingErrorStep } from './OnboardingErrorStep';
import { LoadingScreen } from '@/ui';

type OnboardingState = 'checking_storage' | 'welcome' | 'keychain_explanation' | 'keychain_action' | 'error';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const [state, setState] = useState<OnboardingState>('checking_storage');
  const [isKeychainMode, setIsKeychainMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const handleGetStarted = () => {
    if (isKeychainMode) {
      setState('keychain_explanation');
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