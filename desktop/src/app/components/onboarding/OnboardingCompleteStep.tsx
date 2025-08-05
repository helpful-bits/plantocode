'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { CheckCircle } from 'lucide-react';

interface OnboardingCompleteStepProps {
  onFinish: () => void;
}

export function OnboardingCompleteStep({ onFinish }: OnboardingCompleteStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <CheckCircle className="w-16 h-16 mx-auto text-success" />
            <h1 className="text-3xl font-bold">You're All Set!</h1>
            <p className="text-muted-foreground">
              Vibe Manager is ready to supercharge your AI development workflow.
            </p>
          </div>
          
          <Button onClick={onFinish} className="w-full h-11">
            Continue to Login
          </Button>
        </div>
      </Card>
    </div>
  );
}