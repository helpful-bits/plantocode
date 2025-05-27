'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { AlertTriangle, Shield, Lock } from 'lucide-react';
import { H1, P, Subtle } from '@/ui/typography';

interface KeychainExplanationStepProps {
  onProceed: () => void;
}

export function KeychainExplanationStep({ onProceed }: KeychainExplanationStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-lg p-8 bg-card/90 backdrop-blur-sm shadow-soft border-border/20 rounded-xl">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 mx-auto text-primary" />
            <H1 as="h2" className="text-center text-foreground">Secure Your Session</H1>
            <P className="text-muted-foreground text-center">
              Vibe Manager needs to securely store your login information so you don't have to sign in every time.
            </P>
          </div>
          
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <P className="font-medium text-primary">
                    Keychain Permission Required
                  </P>
                  <Subtle className="text-primary/80">
                    In the next step, your Mac will ask for permission with a dialog similar to this:
                  </Subtle>
                </div>
              </div>
            </div>
            
            <div className="bg-muted border-2 border-dashed border-border rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Lock className="w-6 h-6 text-muted-foreground" />
                <div className="text-sm">
                  <P className="font-medium text-foreground">
                    "Vibe Manager wants to use your confidential information stored in 'vibe-manager' in your keychain."
                  </P>
                  <Subtle className="text-muted-foreground mt-1">
                    [Allow] [Always Allow] [Deny]
                  </Subtle>
                </div>
              </div>
            </div>
            
            <div className="bg-success/10 border border-success/20 rounded-lg p-4">
              <Subtle className="text-success">
                <strong>Please choose "Always Allow"</strong> to ensure Vibe Manager works smoothly. 
                This is a one-time request for this application.
              </Subtle>
            </div>
          </div>
          
          <Button onClick={onProceed} className="w-full">
            Continue to Setup
          </Button>
        </div>
      </Card>
    </div>
  );
}