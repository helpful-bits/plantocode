"use client";

import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, AlertTriangle } from 'lucide-react';
import { getErrorMessage } from '@/utils/error-handling';

interface StripeProviderProps {
  children: React.ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeStripe = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const key = await invoke<string>('get_stripe_publishable_key_command');
        
        if (!isMounted) return;

        if (!key) {
          throw new Error('Stripe publishable key not configured');
        }

        const stripePromise = await loadStripe(key);
        
        if (!isMounted) return;

        if (!stripePromise) {
          throw new Error('Failed to initialize Stripe');
        }

        setStripe(stripePromise);
      } catch (err) {
        if (!isMounted) return;
        
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeStripe();

    return () => {
      isMounted = false;
    };
  }, []);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <div className="font-medium">Initializing Payment System</div>
            <div className="text-sm text-muted-foreground">Setting up secure payment processing...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stripe) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <div>
            <div className="font-medium text-red-600">Payment System Unavailable</div>
            <div className="text-sm text-muted-foreground mt-1">
              {error || 'Unable to initialize payment processing'}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Please refresh the page or try again later
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripe}
      options={{
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#3b82f6',
            colorBackground: '#ffffff',
            colorText: '#1f2937',
            colorDanger: '#ef4444',
            fontFamily: 'Inter, system-ui, sans-serif',
            spacingUnit: '4px',
            borderRadius: '8px',
          },
          rules: {
            '.Label': {
              color: '#374151',
              fontSize: '14px',
              fontWeight: '500',
            },
            '.Input': {
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '16px',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            },
            '.Input:focus': {
              borderColor: '#3b82f6',
              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.1)',
            },
            '.Input--invalid': {
              borderColor: '#ef4444',
            },
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}

export default StripeProvider;