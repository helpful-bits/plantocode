'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '@/ui/card';
import { Spinner } from '@/ui/loading-indicators';
import { Settings } from 'lucide-react';

interface KeychainActionStepProps {
  onSuccess: () => void;
  onError: (errorMessage: string) => void;
}

export function KeychainActionStep({ onSuccess, onError }: KeychainActionStepProps) {
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const setupKeychain = async () => {
      try {
        await invoke('trigger_initial_keychain_access');
        onSuccess();
      } catch (error) {
        console.error('Keychain setup failed:', error);
        const errorMessage = typeof error === 'string' 
          ? error 
          : 'An unexpected error occurred while setting up secure storage.';
        onError(errorMessage);
      } finally {
        setIsProcessing(false);
      }
    };

    // Add a small delay to show the loading state
    const timer = setTimeout(setupKeychain, 1000);
    
    return () => clearTimeout(timer);
  }, [onSuccess, onError]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <Settings className="w-12 h-12 mx-auto text-primary animate-spin" />
            <h1 className="text-2xl font-bold">Configuring Secure Storage</h1>
            <p className="text-muted-foreground">
              Setting up your keychain access for secure credential storage...
            </p>
          </div>
          
          {isProcessing && (
            <div className="space-y-4">
              <Spinner size="lg" className="mx-auto" />
              <p className="text-sm text-muted-foreground">
                You may see a system dialog asking for keychain access. Please allow it to continue.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}