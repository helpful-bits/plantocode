'use client';

import { useState } from 'react';
import { Store } from '@tauri-apps/plugin-store';
import { WelcomeStep } from './WelcomeStep';
import { KeychainExplanationStep } from './KeychainExplanationStep';
import { KeychainActionStep } from './KeychainActionStep';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';
import { OnboardingErrorStep } from './OnboardingErrorStep';
import { APP_SETTINGS_STORE } from '@/utils/constants';

type OnboardingState = 'welcome' | 'keychainExplanation' | 'keychainAction' | 'completed' | 'error';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const [currentState, setCurrentState] = useState<OnboardingState>('welcome');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleWelcomeNext = () => {
    setCurrentState('keychainExplanation');
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
      const settingsStore = await Store.load(APP_SETTINGS_STORE);
      await settingsStore.set('hasCompletedOnboarding', true);
      await settingsStore.save();
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