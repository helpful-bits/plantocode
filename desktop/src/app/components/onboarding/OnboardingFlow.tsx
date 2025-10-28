'use client';

import { useState } from 'react';
import { WelcomeStep } from './WelcomeStep';
import { TrayExplanationStep } from './TrayExplanationStep';
import { usePlausible } from '@/hooks/use-plausible';

type OnboardingState = 'welcome' | 'tray-explanation';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const { trackEvent } = usePlausible();
  const [state, setState] = useState<OnboardingState>('welcome');

  const handleGetStarted = () => {
    // Move to tray explanation step
    setState('tray-explanation');
  };

  const handleTrayExplanationContinue = () => {
    // Track completion
    trackEvent('desktop_onboarding_completed', {
      location: 'onboarding_flow'
    });
    // Complete onboarding after tray explanation
    onOnboardingComplete();
  };

  switch (state) {
    case 'welcome':
      return <WelcomeStep onGetStarted={handleGetStarted} />;

    case 'tray-explanation':
      return <TrayExplanationStep onContinue={handleTrayExplanationContinue} />;

    default:
      return <WelcomeStep onGetStarted={handleGetStarted} />;
  }
}