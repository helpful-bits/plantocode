"use client";

import { useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Button } from "@/ui/button";
import { createSetupCheckoutSession } from "@/actions/billing";
import { PaymentPollingScreen } from "./PaymentPollingScreen";
import { getErrorMessage } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { open } from "@/utils/shell-utils";

export interface AddPaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type ViewState = 'initial' | 'polling';

export function AddPaymentMethodModal({
  isOpen,
  onClose,
  onComplete
}: AddPaymentMethodModalProps) {
  const [view, setView] = useState<ViewState>('initial');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { showNotification } = useNotification();

  const handleProceedToAddCard = async () => {
    try {
      setIsLoading(true);
      
      const response = await createSetupCheckoutSession();
      setSessionId(response.sessionId);
      
      await open(response.url);
      setView('polling');
      
      showNotification({
        title: 'Payment Setup Opened',
        message: 'Complete your payment method setup in the browser window.',
        type: 'success',
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: 'Failed to Open Payment Setup',
        message: errorMessage,
        type: 'error',
      });
      console.error('Failed to create setup checkout session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePollingSuccess = () => {
    onComplete();
    onClose();
    resetModalState();
  };

  const handlePollingError = () => {
    resetModalState();
  };

  const handlePollingCancel = () => {
    resetModalState();
  };

  const resetModalState = () => {
    setView('initial');
    setSessionId(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {view === 'initial' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Add Payment Method
              </DialogTitle>
              <DialogDescription>
                Add a new credit or debit card to your account for payments and credit purchases.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">What happens next:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• You'll be redirected to our secure payment processor</li>
                  <li>• Enter your card details safely</li>
                  <li>• Your card will be verified and saved for future use</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={handleProceedToAddCard}
                  disabled={isLoading}
                  className="flex-1 flex items-center gap-2"
                >
                  {isLoading ? (
                    "Opening..."
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Proceed to Add Card
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}

        {view === 'polling' && sessionId && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Adding Payment Method
              </DialogTitle>
            </DialogHeader>

            <PaymentPollingScreen
              sessionId={sessionId}
              onSuccess={handlePollingSuccess}
              onError={handlePollingError}
              onCancel={handlePollingCancel}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}