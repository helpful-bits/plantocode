"use client";

import { useState } from "react";
import { 
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Zap,
  Info
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { manageSubscription } from "@/actions/billing/subscription-lifecycle.actions";
import type { SubscriptionDetails } from "@/types/tauri-commands";

export interface SubscriptionReactivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSubscription: SubscriptionDetails | null;
}


export function SubscriptionReactivationModal({ 
  isOpen, 
  onClose, 
  currentSubscription 
}: SubscriptionReactivationModalProps) {
  const [isReactivating, setIsReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { showNotification } = useNotification();


  const handleReactivate = async () => {
    try {
      setIsReactivating(true);
      setError(null);

      // All subscription management is now handled through Stripe Customer Portal
      const portalUrl = await manageSubscription();
      window.open(portalUrl, '_blank');

      showNotification({
        title: "Billing Portal Opened",
        message: "Subscription management (resume/reactivate) is handled through Stripe's secure billing portal.",
        type: "success",
      });

      onClose();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: "Portal Access Failed",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setIsReactivating(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };


  // Check if subscription can be reactivated
  // Can reactivate if: status is 'canceled' (ended) OR cancelAtPeriodEnd is true (scheduled to cancel)
  const canReactivate = currentSubscription?.status === 'canceled' || 
                       currentSubscription?.cancelAtPeriodEnd === true;

  if (!canReactivate) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              Subscription Active
            </DialogTitle>
            <DialogDescription>
              Your subscription is currently active and doesn't need reactivation.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Subscription Status</AlertTitle>
            <AlertDescription>
              Your subscription is {currentSubscription?.status}{currentSubscription?.cancelAtPeriodEnd ? ' (scheduled to cancel)' : ''} and will continue until{' '}
              {currentSubscription?.currentPeriodEndsAt && 
                new Date(currentSubscription.currentPeriodEndsAt).toLocaleDateString()
              }.
            </AlertDescription>
          </Alert>

          <div className="flex justify-center pt-4">
            <Button onClick={handleClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-green-500" />
            Reactivate Subscription
          </DialogTitle>
          <DialogDescription>
            {currentSubscription?.status === 'canceled' 
              ? 'Your subscription was canceled but can be reactivated at any time.'
              : 'Your subscription is scheduled for cancellation but can be reactivated.'
            } Reactivation will restore your previous plan and billing cycle.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Reactivation Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Subscription Info */}
        {currentSubscription && (
          <Card className="bg-red-50 border-red-200">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-red-900">
                {currentSubscription?.status === 'canceled' ? 'Canceled Subscription' : 'Subscription Scheduled for Cancellation'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Previous Plan:</span>
                <span className="font-medium">{currentSubscription.planName || currentSubscription.plan}</span>
              </div>
              {currentSubscription.currentPeriodEndsAt && (
                <div className="flex justify-between text-sm">
                  <span>Access Until:</span>
                  <span className="font-medium">
                    {new Date(currentSubscription.currentPeriodEndsAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="text-xs text-red-700">
                {currentSubscription?.status === 'canceled' 
                  ? 'Reactivate to restore access to AI services.'
                  : 'Reactivate before your access period ends to continue using AI services without interruption.'
                }
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reactivation Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Reactivation Details</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>• Your previous subscription plan will be restored</p>
            <p>• Billing will resume based on your previous billing cycle</p>
            <p>• You'll regain full access to AI services immediately</p>
            <p>• No setup or activation fees apply</p>
          </AlertDescription>
        </Alert>

        {/* Actions */}
        <div className="flex justify-between pt-6">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          
          <Button
            onClick={handleReactivate}
            disabled={isReactivating}
            className="bg-green-600 hover:bg-green-700"
          >
            {isReactivating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reactivating...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Reactivate Subscription
              </>
            )}
          </Button>
        </div>

        {/* Footer Info */}
        <div className="text-xs text-center text-muted-foreground border-t pt-4">
          By reactivating, you agree to resume subscription billing according to your selected plan.
          You can cancel again at any time from your account settings.
        </div>
      </DialogContent>
    </Dialog>
  );
}