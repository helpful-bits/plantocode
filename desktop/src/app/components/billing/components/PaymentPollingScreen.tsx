"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/ui/button";
import { Alert, AlertDescription } from "@/ui/alert";
import { getCheckoutSessionStatus } from "@/actions/billing/checkout.actions";
import { getErrorMessage } from "@/utils/error-handling";

interface PaymentPollingScreenProps {
  sessionId: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

const INITIAL_POLLING_INTERVAL = 1000;
const POLLING_BACKOFF_FACTOR = 1.5;
const MAX_POLLING_INTERVAL = 10000;
const TIMEOUT_DURATION = 300000;

export function PaymentPollingScreen({
  sessionId,
  onSuccess,
  onError,
  onCancel
}: PaymentPollingScreenProps) {
  const [status, setStatus] = useState<'polling' | 'success' | 'error' | 'timeout'>('polling');
  const [message, setMessage] = useState<string>("Waiting for payment confirmation...");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentPollingIntervalRef = useRef<number>(INITIAL_POLLING_INTERVAL);

  useEffect(() => {
    let isMounted = true;

    const pollPaymentStatus = async () => {
      try {
        const result = await getCheckoutSessionStatus(sessionId);
        
        if (!isMounted) return;

        if (result.status === 'complete' && (result.payment_status === 'paid' || result.payment_status === 'no_payment_required')) {
          setStatus('success');
          setMessage("Payment completed successfully!");
          cleanup();
          onSuccess();
        } else if (result.status === 'expired') {
          setStatus('error');
          setError("Payment session expired. Please try again.");
          cleanup();
          onError("Payment session expired");
        } else if (result.payment_status === 'unpaid' && result.status === 'complete') {
          setStatus('error');
          setError("Payment was not completed. Please try again.");
          cleanup();
          onError("Payment not completed");
        } else {
          scheduleNextPoll();
        }
      } catch (err) {
        if (!isMounted) return;
        
        const errorMessage = getErrorMessage(err);
        setStatus('error');
        setError(errorMessage);
        cleanup();
        onError(errorMessage);
      }
    };

    const scheduleNextPoll = () => {
      if (!isMounted) return;
      
      const currentInterval = currentPollingIntervalRef.current;
      intervalRef.current = setTimeout(pollPaymentStatus, currentInterval);
      
      const nextInterval = Math.min(
        currentInterval * POLLING_BACKOFF_FACTOR,
        MAX_POLLING_INTERVAL
      );
      currentPollingIntervalRef.current = nextInterval;
    };

    const cleanup = () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      if (isMounted) {
        setStatus('timeout');
        setError("Payment confirmation timed out. Please check your payment status or try again.");
        cleanup();
        onError("Payment confirmation timeout");
      }
    }, TIMEOUT_DURATION);

    // Initial poll
    pollPaymentStatus();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [sessionId, onSuccess, onError]);

  const handleCancel = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onCancel();
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'polling':
        return <Loader2 className="h-12 w-12 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-12 w-12 text-green-500" />;
      case 'error':
      case 'timeout':
        return <XCircle className="h-12 w-12 text-red-500" />;
      default:
        return <AlertCircle className="h-12 w-12 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'polling':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
      case 'timeout':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          {getStatusIcon()}
        </div>
        
        <div>
          <h2 className={`text-2xl font-bold ${getStatusColor()}`}>
            {status === 'polling' && "Processing Payment"}
            {status === 'success' && "Payment Successful"}
            {status === 'error' && "Payment Failed"}
            {status === 'timeout' && "Payment Timeout"}
          </h2>
          
          <p className="text-muted-foreground mt-2">
            {message}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status === 'polling' && (
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Please complete your payment in the browser window</span>
          </div>
          
          <div className="text-xs text-muted-foreground">
            This window will automatically update when payment is confirmed
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3">
        {status === 'polling' && (
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        )}
        
        {(status === 'error' || status === 'timeout') && (
          <Button variant="outline" onClick={handleCancel}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}