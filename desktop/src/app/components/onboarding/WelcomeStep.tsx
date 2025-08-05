'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { H1, P } from '@/ui/typography';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted px-4">
      <Card className="w-full max-w-md p-8 text-center bg-card/95 backdrop-blur-sm shadow-lg border-border/30 rounded-xl">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg"></div>
            </div>
            <H1 className="text-center text-foreground text-2xl font-semibold">
              Welcome to Vibe Manager
            </H1>
            <P className="text-muted-foreground text-center text-sm leading-relaxed">
              Let's get you set up with secure credential storage for your AI development workflow.
            </P>
          </div>
          
          <div className="space-y-2">
            <Button onClick={onNext} className="w-full h-11">
              Get Started
            </Button>
            <P className="text-xs text-muted-foreground">
              Takes less than a minute
            </P>
          </div>
        </div>
      </Card>
    </div>
  );
}