"use client";

import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
  CreditCard, 
  Loader2, 
  Shield, 
  CheckCircle,
  AlertCircle,
  Lock
} from 'lucide-react';

import { Button } from '@/ui/button';
import { Alert, AlertDescription } from '@/ui/alert';
// Card components removed - parent component provides surrounding UI
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';

interface PaymentElementFormProps {
  clientSecret: string;
  amount: number;
  currency: string;
  description: string;
  onSuccess?: (paymentIntentId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  savePaymentMethod?: boolean;
}

export function PaymentElementForm({
  amount,
  currency,
  description,
  onSuccess,
  onError,
  onCancel,
  savePaymentMethod = false,
}: PaymentElementFormProps) {
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
      maximumFractionDigits: 4,
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
      // Confirm the payment
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-complete`,
          save_payment_method: savePaymentMethod,
        },
        redirect: 'if_required', // Only redirect for 3D Secure if needed
      });

      if (error) {
        if (error.type === 'card_error' || error.type === 'validation_error') {
          setMessage(error.message || 'Your payment was declined.');
        } else {
          setMessage('An unexpected error occurred.');
        }
        setMessageType('error');
        onError?.(error.message || 'Payment failed');
      } else if (paymentIntent) {
        // Payment succeeded
        if (paymentIntent.status === 'succeeded') {
          setMessage('Payment successful! Your credits have been added to your account.');
          setMessageType('success');
          
          showNotification({
            title: 'Payment Successful',
            message: `${description} completed successfully.`,
            type: 'success',
          });

          onSuccess?.(paymentIntent.id);
        } else if (paymentIntent.status === 'processing') {
          setMessage('Your payment is being processed. You will receive a confirmation email when complete.');
          setMessageType('info');
        } else if (paymentIntent.status === 'requires_action') {
          // This should not happen with redirect: 'if_required', but handle it
          setMessage('Your payment requires additional authentication. Please follow the instructions.');
          setMessageType('info');
        } else {
          setMessage('Something went wrong with your payment. Please try again.');
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
    <div className="w-full space-y-6">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(amount, currency)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {description}
          </div>
        </div>
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span>Secure payment via Stripe</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">
            Payment Information
          </label>
          <div className="text-xs text-muted-foreground mb-2">
            Enter your payment details to complete this purchase
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

        {savePaymentMethod && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-blue-700">
              <Shield className="h-4 w-4" />
              <span>Your payment method will be securely saved for future purchases</span>
            </div>
          </div>
        )}

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
                Processing...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Pay {formatCurrency(amount, currency)}
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-center text-muted-foreground">
          <div className="flex items-center justify-center gap-1">
            <Shield className="h-3 w-3" />
            <span>Secure payment powered by Stripe</span>
          </div>
          <div className="mt-1">
            Your payment information is encrypted and secure
          </div>
        </div>
      </form>
    </div>
  );
}

export default PaymentElementForm;