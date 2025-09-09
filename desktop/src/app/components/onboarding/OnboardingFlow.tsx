'use client';

import { useState } from 'react';
import { WelcomeStep } from './WelcomeStep';
import { usePlausible } from '@/hooks/use-plausible';

type OnboardingState = 'welcome';

interface OnboardingFlowProps {
  onOnboardingComplete: () => void;
}

export function OnboardingFlow({ onOnboardingComplete }: OnboardingFlowProps) {
  const { trackEvent } = usePlausible();
  const [state] = useState<OnboardingState>('welcome');

  const handleGetStarted = () => {
    // Track completion
    trackEvent('desktop_onboarding_completed', {
      location: 'onboarding_flow'
    });
    // Complete onboarding immediately after welcome
    onOnboardingComplete();
  };

  switch (state) {
    case 'welcome':
      return <WelcomeStep onGetStarted={handleGetStarted} />;

    default:
      return <WelcomeStep onGetStarted={handleGetStarted} />;
  }
}