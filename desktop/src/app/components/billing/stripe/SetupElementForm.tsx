"use client";

import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
 
  Loader2, 
  Shield, 
  CheckCircle,
  AlertCircle,
  Clock,
  Star
} from 'lucide-react';

import { Button } from '@/ui/button';
import { Alert, AlertDescription } from '@/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';

interface SetupElementFormProps {
  clientSecret: string;
  subscriptionDetails?: {
    planName: string;
    monthlyPrice: number;
    currency: string;
    trialDays: number;
    features: string[];
  };
  onSuccess?: (setupIntentId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export function SetupElementForm({
  subscriptionDetails,
  onSuccess,
  onError,
  onCancel,
}: SetupElementFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { showNotification } = useNotification();

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'error' | 'success' | 'info'>('error');
  const [isComplete, setIsComplete] = useState(false);

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setMessage('Stripe not initialized. Please refresh the page.');
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // Confirm the setup intent
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/subscription-complete`,
        },
        redirect: 'if_required', // Only redirect for 3D Secure if needed
      });

      if (error) {
        if (error.type === 'card_error' || error.type === 'validation_error') {
          setMessage(error.message || 'Your card was declined.');
        } else {
          setMessage('An unexpected error occurred.');
        }
        setMessageType('error');
        onError?.(error.message || 'Setup failed');
      } else if (setupIntent) {
        // Setup succeeded
        if (setupIntent.status === 'succeeded') {
          setMessage('Payment method saved! Your trial has started.');
          setMessageType('success');
          
          showNotification({
            title: 'Trial Started',
            message: `Your ${subscriptionDetails?.trialDays}-day trial has begun!`,
            type: 'success',
          });

          onSuccess?.(setupIntent.id);
        } else if (setupIntent.status === 'processing') {
          setMessage('Your payment method is being verified. This may take a moment.');
          setMessageType('info');
        } else if (setupIntent.status === 'requires_action') {
          setMessage('Your payment method requires additional authentication. Please follow the instructions.');
          setMessageType('info');
        } else {
          setMessage('Something went wrong while saving your payment method. Please try again.');
          setMessageType('error');
        }
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setMessage(errorMessage);
      setMessageType('error');
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentElementChange = (event: any) => {
    setIsComplete(event.complete);
    
    if (event.error) {
      setMessage(event.error.message);
      setMessageType('error');
    } else {
      setMessage(null);
    }
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Start Your Free Trial
        </CardTitle>
        
        {subscriptionDetails && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-4">
            <div className="text-center">
              <div className="font-semibold text-lg text-blue-600">
                {subscriptionDetails.planName}
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800 mt-2">
                <Clock className="h-3 w-3 mr-1" />
                {subscriptionDetails.trialDays}-day free trial
              </Badge>
            </div>
            
            <div className="text-center space-y-2">
              <div className="text-2xl font-bold">
                {formatCurrency(subscriptionDetails.monthlyPrice, subscriptionDetails.currency)}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </div>
              <div className="text-xs text-muted-foreground">
                No charge during trial • Cancel anytime
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-center">Plan Features:</div>
              <div className="grid grid-cols-1 gap-1">
                {subscriptionDetails.features.slice(0, 3).map((feature, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
                {subscriptionDetails.features.length > 3 && (
                  <div className="text-xs text-muted-foreground text-center mt-1">
                    +{subscriptionDetails.features.length - 3} more features
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Payment Method for After Trial
            </label>
            <div className="text-xs text-muted-foreground mb-2">
              We'll save your payment method securely. You won't be charged until your {subscriptionDetails?.trialDays}-day trial ends.
            </div>
            <div className="border rounded-lg p-4 bg-gray-50">
              <PaymentElement 
                onChange={handlePaymentElementChange}
                options={{
                  layout: 'tabs',
                  paymentMethodOrder: ['card', 'apple_pay', 'google_pay'],
                }}
              />
            </div>
          </div>

          <div className="bg-green-50 p-3 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-green-700">
              <Shield className="h-4 w-4" />
              <span>Your payment method will be securely saved. No charge until trial ends.</span>
            </div>
          </div>

          {message && (
            <Alert variant={messageType === 'error' ? 'destructive' : 'default'}>
              {messageType === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : messageType === 'error' ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!stripe || !elements || !isComplete || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Star className="h-4 w-4 mr-2" />
                  Start Free Trial
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-center text-muted-foreground space-y-2">
            <div className="flex items-center justify-center gap-1">
              <Shield className="h-3 w-3" />
              <span>Secure setup powered by Stripe</span>
            </div>
            <div className="bg-gray-50 p-2 rounded text-xs">
              By starting your trial, you agree to our terms of service and privacy policy
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default SetupElementForm;