'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface OnboardingErrorStepProps {
  errorMessage: string;
  onRetry: () => void;
}

export function OnboardingErrorStep({ errorMessage, onRetry }: OnboardingErrorStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
            <h1 className="text-2xl font-bold">Keychain Access Required</h1>
            <p className="text-muted-foreground">
              Vibe Manager could not set up secure storage because access to the Keychain was denied or an error occurred.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive">
                <strong>Error:</strong> {errorMessage}
              </p>
            </div>
            
            <div className="bg-info/10 border border-info/20 rounded-lg p-4">
              <p className="text-sm text-info">
                <strong>This is needed to securely save your login.</strong><br />
                When you try again, please choose "Always Allow" in the macOS dialog to avoid future prompts.
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
            <Button onClick={onRetry} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <p className="text-xs text-muted-foreground">
              If you continue to experience issues, please check your system's Keychain Access settings.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}