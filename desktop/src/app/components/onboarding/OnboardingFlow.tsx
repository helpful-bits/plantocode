'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WelcomeStep } from './WelcomeStep';
import { KeychainExplanationStep } from './KeychainExplanationStep';
import { KeychainActionStep } from './KeychainActionStep';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';
import { OnboardingErrorStep } from './OnboardingErrorStep';

type OnboardingState = 'welcome' | 'keychainExplanation' | 'keychainAction' | 'completed' | 'error';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const [currentState, setCurrentState] = useState<OnboardingState>('welcome');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [useSessionStorage, setUseSessionStorage] = useState<boolean>(false);

  // Check storage mode on component mount
  useEffect(() => {
    const checkStorageMode = async () => {
      try {
        const sessionStorageMode = await invoke('get_storage_mode');
        setUseSessionStorage(Boolean(sessionStorageMode));
      } catch (error) {
        console.error('Failed to get storage mode:', error);
        // Default to false (use keychain) if we can't determine the mode
        setUseSessionStorage(false);
      }
    };
    
    checkStorageMode();
  }, []);

  const handleWelcomeNext = () => {
    // Skip keychain steps if using session storage
    if (useSessionStorage) {
      setCurrentState('completed');
    } else {
      setCurrentState('keychainExplanation');
    }
  };

  const handleKeychainExplanationProceed = () => {
    setCurrentState('keychainAction');
  };

  const handleKeychainActionSuccess = () => {
    setCurrentState('completed');
  };

  const handleKeychainActionError = (error: string) => {
    setErrorMessage(error);
    setCurrentState('error');
  };

  const handleErrorRetry = () => {
    setCurrentState('keychainAction');
  };

  const handleOnboardingFinish = async () => {
    try {
      await invoke('set_onboarding_completed_command');
      onOnboardingComplete();
    } catch (e) {
      console.error('Error saving onboarding completion status:', e);
      // Still call onOnboardingComplete even if store fails
      onOnboardingComplete();
    }
  };

  switch (currentState) {
    case 'welcome':
      return <WelcomeStep onNext={handleWelcomeNext} />;
    
    case 'keychainExplanation':
      return <KeychainExplanationStep onProceed={handleKeychainExplanationProceed} />;
    
    case 'keychainAction':
      return (
        <KeychainActionStep
          onSuccess={handleKeychainActionSuccess}
          onError={handleKeychainActionError}
        />
      );
    
    case 'completed':
      return <OnboardingCompleteStep onFinish={handleOnboardingFinish} />;
    
    case 'error':
      return (
        <OnboardingErrorStep
          errorMessage={errorMessage}
          onRetry={handleErrorRetry}
        />
      );
    
    default:
      return null;
  }
}