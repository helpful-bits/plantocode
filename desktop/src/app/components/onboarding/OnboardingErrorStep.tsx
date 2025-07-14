'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { AlertCircle, RefreshCw, XCircle, HelpCircle } from 'lucide-react';
import { H1, P, Subtle } from '@/ui/typography';

interface OnboardingErrorStepProps {
  errorMessage: string;
  onRetry: () => void;
}

export function OnboardingErrorStep({ errorMessage, onRetry }: OnboardingErrorStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-lg p-8 bg-card/90 backdrop-blur-sm shadow-soft border-border/20 rounded-xl">
        <div className="space-y-6">
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <AlertCircle className="w-16 h-16 text-destructive" />
              <XCircle className="w-6 h-6 text-destructive absolute -bottom-1 -right-1 bg-card rounded-full" />
            </div>
            <H1 as="h2" className="text-center text-foreground">Setup Blocked</H1>
            <P className="text-muted-foreground text-center max-w-md mx-auto">
              We couldn't save your login credentials because Keychain access was denied.
            </P>
          </div>
          
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <P className="font-medium text-destructive text-sm">
                    What went wrong
                  </P>
                  <Subtle className="text-destructive/80 text-sm">
                    {errorMessage}
                  </Subtle>
                </div>
              </div>
            </div>
            
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <HelpCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <P className="font-medium text-warning text-sm">
                    Without Keychain access:
                  </P>
                  <ul className="space-y-1 ml-1">
                    <li className="text-sm text-warning/80 flex items-start">
                      <span className="mr-2">•</span>
                      <span>You'll need to log in every time you open Vibe Manager</span>
                    </li>
                    <li className="text-sm text-warning/80 flex items-start">
                      <span className="mr-2">•</span>
                      <span>Your session won't persist between app restarts</span>
                    </li>
                    <li className="text-sm text-warning/80 flex items-start">
                      <span className="mr-2">•</span>
                      <span>You may experience frequent authentication prompts</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <P className="text-sm text-primary font-medium mb-2">
                How to fix this:
              </P>
              <ol className="space-y-2 ml-1">
                <li className="text-sm text-primary/80 flex items-start">
                  <span className="mr-2 font-medium">1.</span>
                  <span>Click "Try Again" below</span>
                </li>
                <li className="text-sm text-primary/80 flex items-start">
                  <span className="mr-2 font-medium">2.</span>
                  <span>When macOS shows the dialog, click <strong>"Always Allow"</strong></span>
                </li>
                <li className="text-sm text-primary/80 flex items-start">
                  <span className="mr-2 font-medium">3.</span>
                  <span>If prompted for your Mac password, enter it to confirm</span>
                </li>
              </ol>
            </div>
          </div>
          
          <div className="space-y-3">
            <Button onClick={onRetry} className="w-full" size="lg">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Subtle className="text-xs text-muted-foreground text-center">
              Still having issues? Check System Settings → Privacy & Security → Files and Folders
            </Subtle>
          </div>
        </div>
      </Card>
    </div>
  );
}