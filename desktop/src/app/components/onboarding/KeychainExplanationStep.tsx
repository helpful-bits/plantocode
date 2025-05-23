'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { AlertTriangle, Shield, Lock } from 'lucide-react';

interface KeychainExplanationStepProps {
  onProceed: () => void;
}

export function KeychainExplanationStep({ onProceed }: KeychainExplanationStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-lg p-8">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 mx-auto text-blue-500" />
            <h1 className="text-2xl font-bold">Secure Your Session</h1>
            <p className="text-muted-foreground">
              Vibe Manager needs to securely store your login information so you don't have to sign in every time.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Keychain Permission Required
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    In the next step, your Mac will ask for permission with a dialog similar to this:
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Lock className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <div className="text-sm">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    "Vibe Manager wants to use your confidential information stored in 'vibe-manager' in your keychain."
                  </p>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    [Allow] [Always Allow] [Deny]
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Please choose "Always Allow"</strong> to ensure Vibe Manager works smoothly. 
                This is a one-time request for this application.
              </p>
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