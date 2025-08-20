'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { H1, P } from '@/ui/typography';
import { CheckCircle } from 'lucide-react';
import { usePlausible } from '@/hooks/use-plausible';

interface WelcomeStepProps {
  onGetStarted: () => void;
}

export function WelcomeStep({ onGetStarted }: WelcomeStepProps) {
  const { trackEvent } = usePlausible();

  const handleGetStarted = () => {
    trackEvent('desktop_onboarding_started');
    onGetStarted();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted px-4">
      <Card className="w-full max-w-md p-8 text-center bg-card/95 backdrop-blur-sm shadow-lg border-border/30 rounded-xl">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-success/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>
            <H1 className="text-center text-foreground text-2xl font-semibold">
              Welcome to Vibe Manager
            </H1>
            <P className="text-muted-foreground text-center text-sm leading-relaxed">
              You're all set! Vibe Manager is ready to supercharge your AI development workflow with secure credential storage.
            </P>
          </div>
          
          <div className="space-y-2">
            <Button onClick={handleGetStarted} className="w-full h-11">
              Continue to Login
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}