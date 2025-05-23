'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Welcome to Vibe Manager</h1>
            <p className="text-muted-foreground">
              Let's get you set up with secure, seamless access to your AI-powered development tools.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">Secure credential storage</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">One-time setup</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">Seamless experience</span>
            </div>
          </div>
          
          <Button onClick={onNext} className="w-full">
            Get Started
          </Button>
        </div>
      </Card>
    </div>
  );
}