"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { invoke } from '@tauri-apps/api/core';
import { getErrorMessage } from '@/utils/error-handling';
import { useNotification } from '@/contexts/notification-context';

// Stripe context
interface StripeContextType {
  stripe: Stripe | null;
  publishableKey: string | null;
  isLoading: boolean;
  error: string | null;
}

const StripeContext = createContext<StripeContextType>({
  stripe: null,
  publishableKey: null,
  isLoading: true,
  error: null,
});

export const useStripeContext = () => useContext(StripeContext);

interface StripeProviderProps {
  children: React.ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  useEffect(() => {
    let isMounted = true;

    const initializeStripe = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get publishable key from backend
        const key = await invoke<string>('get_stripe_publishable_key_command');
        
        if (!isMounted) return;

        if (!key) {
          throw new Error('Stripe publishable key not configured');
        }

        setPublishableKey(key);

        // Initialize Stripe
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
        
        showNotification({
          title: 'Stripe Initialization Failed',
          message: errorMessage,
          type: 'error',
        });
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
  }, [showNotification]);

  const contextValue: StripeContextType = {
    stripe,
    publishableKey,
    isLoading,
    error,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Initializing payment system...</span>
      </div>
    );
  }

  if (error || !stripe || !publishableKey) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 mb-2">Payment system unavailable</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <StripeContext.Provider value={contextValue}>
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
    </StripeContext.Provider>
  );
}

export default StripeProvider;