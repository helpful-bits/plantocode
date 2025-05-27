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
            <h1 className="text-3xl font-bold">Setup Complete!</h1>
            <p className="text-muted-foreground">
              Your secure storage has been configured successfully. Vibe Manager is ready to use.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-success/10 border border-success/20 rounded-lg p-4">
              <p className="text-sm text-success">
                ✓ Keychain access configured<br />
                ✓ Secure credential storage enabled<br />
                ✓ Ready for seamless authentication
              </p>
            </div>
          </div>
          
          <Button onClick={onFinish} className="w-full">
            Continue to Login
          </Button>
        </div>
      </Card>
    </div>
  );
}