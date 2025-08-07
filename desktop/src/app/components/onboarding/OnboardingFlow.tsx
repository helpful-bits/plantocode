'use client';

import { invoke } from '@tauri-apps/api/core';
import { WelcomeStep } from './WelcomeStep';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const handleGetStarted = async () => {
    try {
      await invoke('set_onboarding_completed_command');
      onOnboardingComplete();
    } catch (e) {
      console.error('Error saving onboarding completion status:', e);
      // Still call onOnboardingComplete even if store fails
      onOnboardingComplete();
    }
  };

  return <WelcomeStep onGetStarted={handleGetStarted} />;
}