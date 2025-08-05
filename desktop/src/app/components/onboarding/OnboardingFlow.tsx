'use client';

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WelcomeStep } from './WelcomeStep';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';

type OnboardingState = 'welcome' | 'completed';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const [currentState, setCurrentState] = useState<OnboardingState>('welcome');

  const handleWelcomeNext = () => {
    // Skip directly to completed state - no keychain setup needed
    setCurrentState('completed');
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
    
    case 'completed':
      return <OnboardingCompleteStep onFinish={handleOnboardingFinish} />;
    
    default:
      return null;
  }
}