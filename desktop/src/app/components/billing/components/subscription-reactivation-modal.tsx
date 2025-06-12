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
import { resumeSubscription } from "@/actions/billing/subscription-lifecycle.actions";
import type { SubscriptionDetails } from "@/types/tauri-commands";

export interface SubscriptionReactivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSubscription: SubscriptionDetails | null;
  onReactivationComplete?: (subscription: SubscriptionDetails) => void;
}


export function SubscriptionReactivationModal({ 
  isOpen, 
  onClose, 
  currentSubscription,
  onReactivationComplete 
}: SubscriptionReactivationModalProps) {
  const [isReactivating, setIsReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { showNotification } = useNotification();


  const handleReactivate = async () => {
    try {
      setIsReactivating(true);
      setError(null);

      const reactivatedSubscription = await resumeSubscription();

      showNotification({
        title: "Subscription Reactivated!",
        message: "Your subscription has been successfully reactivated and is now active.",
        type: "success",
      });

      onReactivationComplete?.(reactivatedSubscription);
      onClose();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: "Reactivation Failed",
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
  const canReactivate = currentSubscription?.status === 'canceled' || 
                       currentSubscription?.hasCancelled;

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
              Your subscription is {currentSubscription?.status} and will continue until{' '}
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
            Your subscription was canceled but can be reactivated at any time.
            Reactivation will restore your previous plan and billing cycle.
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
                Canceled Subscription
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
                Reactivate before your access period ends to continue using AI services without interruption.
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