'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { Shield, Lock, Key, CheckCircle2 } from 'lucide-react';
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
            <H1 as="h2" className="text-center text-foreground">Secure Your Login</H1>
            <P className="text-muted-foreground text-center">
              Vibe Manager needs to securely save your login credentials in macOS Keychain so you stay logged in between sessions.
            </P>
          </div>
          
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Key className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <P className="font-medium text-primary">
                    Why we need Keychain access
                  </P>
                  <Subtle className="text-primary/80">
                    Your login credentials will be encrypted and stored in macOS Keychain - the same secure system used by Safari, Mail, and other trusted apps.
                  </Subtle>
                </div>
              </div>
            </div>
            
            <div className="bg-muted border-2 border-border rounded-lg p-6 space-y-3">
              <div className="flex items-start space-x-3">
                <Lock className="w-6 h-6 text-muted-foreground mt-1" />
                <div className="space-y-3 flex-1">
                  <P className="font-medium text-foreground">
                    macOS will show this security dialog:
                  </P>
                  <div className="bg-background/50 rounded-md p-4 border border-border/50">
                    <P className="font-medium text-foreground text-sm italic">
                      "Vibe Manager wants to use your confidential information stored in 'vibe-manager' in your keychain."
                    </P>
                    <div className="mt-3 flex items-center space-x-2">
                      <div className="px-3 py-1 bg-muted/50 rounded text-xs font-medium text-muted-foreground">Allow</div>
                      <div className="px-3 py-1 bg-primary/20 rounded text-xs font-medium text-primary border-2 border-primary/50">Always Allow</div>
                      <div className="px-3 py-1 bg-muted/50 rounded text-xs font-medium text-muted-foreground">Deny</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-success/10 border border-success/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <P className="font-medium text-success">
                    Click "Always Allow" (recommended)
                  </P>
                  <Subtle className="text-success/80">
                    This ensures Vibe Manager can access your saved login without asking again. You'll only see this dialog once.
                  </Subtle>
                </div>
              </div>
            </div>
            
            <div className="bg-muted/50 border border-border/50 rounded-lg p-3">
              <Subtle className="text-muted-foreground text-xs">
                <strong>Note:</strong> If you click "Allow" instead of "Always Allow", macOS will ask for permission each time you open Vibe Manager.
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