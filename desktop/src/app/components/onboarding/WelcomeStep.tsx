'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { H1, P, Small } from '@/ui/typography';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-md p-8 text-center bg-card/90 backdrop-blur-sm shadow-soft border-border/20 rounded-xl">
        <div className="space-y-6">
          <div className="space-y-2">
            <H1 className="text-center text-foreground">Welcome to Vibe Manager</H1>
            <P className="text-muted-foreground text-center">
              Let's get you set up with secure, seamless access to your AI-powered development tools.
            </P>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <Small className="text-foreground">Secure credential storage</Small>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <Small className="text-foreground">One-time setup</Small>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <Small className="text-foreground">Seamless experience</Small>
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