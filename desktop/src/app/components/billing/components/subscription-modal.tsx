"use client";

import { useState, useEffect } from 'react';
import { 
  Loader2,
  Crown,
  Zap,
  Settings
} from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Alert, AlertDescription } from '@/ui/alert';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';
import { getAvailablePlans } from '@/actions/billing/plan.actions';
import { openBillingPortal } from '@/actions/billing/payment-method.actions';
import { createSubscriptionCheckoutSession } from '@/actions/billing/checkout.actions';
import { open } from '@/utils/shell-utils';
import { PlanSelectionCard } from './PlanSelectionCard';
import { PaymentPollingScreen } from './PaymentPollingScreen';
import type { SubscriptionPlan, BillingDashboardData } from '@/types/tauri-commands';




export interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscriptionComplete?: (subscriptionId: string, shouldStartPolling?: boolean) => void;
  dashboardData: BillingDashboardData | null;
}

export function SubscriptionModal({ 
  isOpen, 
  onClose, 
  onSubscriptionComplete,
  dashboardData
}: SubscriptionModalProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  
  const [subscriptionFlow, setSubscriptionFlow] = useState<'selection' | 'polling'>('selection');
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  
  const { showNotification } = useNotification();

  const fetchSubscriptionPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const fetchedPlans = await getAvailablePlans();
      const activePlans = fetchedPlans.filter(plan => plan.active);
      
      const planGroups = activePlans.reduce((groups, plan) => {
        if (!groups[plan.name]) {
          groups[plan.name] = [];
        }
        groups[plan.name].push(plan);
        return groups;
      }, {} as Record<string, SubscriptionPlan[]>);
      
      const deduplicatedPlans = Object.values(planGroups).map(group => {
        return group[0];
      });
      
      setPlans(deduplicatedPlans);
      
      const filteredPlans = deduplicatedPlans.filter(plan => plan.id !== dashboardData?.planDetails?.planId);
      const recommendedPlan = filteredPlans.find(plan => plan.recommended);
      setSelectedPlanId(recommendedPlan?.id || filteredPlans[0]?.id || null);
      
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to fetch subscription plans:', err);
      
      showNotification({
        title: 'Failed to Load Plans',
        message: 'Unable to fetch subscription plans. Please try again later.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handlePlanChange = async (plan: SubscriptionPlan) => {
    try {
      setIsCreating(true);
      setError(null);
      
      const response = await createSubscriptionCheckoutSession(plan.id);
      
      // Set session ID for polling
      setSessionId(response.sessionId);
      
      // Open checkout in browser
      await open(response.url);
      
      // Switch to polling view
      setSubscriptionFlow('polling');
      
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: 'Subscription Setup Failed',
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubscriptionSuccess = () => {
    showNotification({
      title: 'Subscription Updated!',
      message: 'Your subscription has been updated successfully!',
      type: 'success',
    });
    
    onClose();
    onSubscriptionComplete?.('', true);
  };

  const handleSubscriptionError = (error: string) => {
    setError(error);
    showNotification({
      title: 'Subscription Failed',
      message: error,
      type: 'error',
    });
    setSubscriptionFlow('selection');
    setSessionId(null);
  };

  const handleClose = () => {
    setSubscriptionFlow('selection');
    setSessionId(null);
    setError(null);
    onClose();
  };

  const handleBackToSelection = () => {
    setSubscriptionFlow('selection');
    setSessionId(null);
    setError(null);
  };

  useEffect(() => {
    if (isOpen) {
      fetchSubscriptionPlans();
    }
  }, [isOpen]);
  


  const selectedPlan = plans.find(plan => plan.id === selectedPlanId);
  const availablePlans = plans.filter(plan => plan.id !== dashboardData?.planDetails?.planId);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto" 
        role="dialog" 
        aria-labelledby="subscription-modal-title" 
        aria-describedby="subscription-modal-description"
      >
        {subscriptionFlow === 'selection' ? (
          <>
            <DialogHeader>
              <DialogTitle id="subscription-modal-title" className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                {dashboardData?.planDetails?.priceUsd && dashboardData.planDetails.priceUsd > 0 ? 'Manage Subscription' : 'Start Your Free Trial'}
              </DialogTitle>
              <DialogDescription id="subscription-modal-description">
                {dashboardData?.planDetails?.priceUsd && dashboardData.planDetails.priceUsd > 0 
                  ? 'Manage your subscription plan or visit the billing portal for detailed settings.'
                  : 'Choose a plan to start your free trial. You can manage your subscription anytime through your account settings.'}
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading subscription plans...
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {availablePlans.map((plan) => (
                    <PlanSelectionCard
                      key={plan.id}
                      plan={plan}
                      isSelected={plan.id === selectedPlanId}
                      isCurrentPlan={false}
                      onClick={() => setSelectedPlanId(plan.id)}
                    />
                  ))}
                </div>

                {selectedPlan && (
                  <div className="flex justify-center pt-4">
                    {selectedPlan.id === dashboardData?.planDetails?.planId ? (
                      <Button
                        onClick={async () => {
                          try {
                            const portalUrl = await openBillingPortal();
                            await open(portalUrl);
                            showNotification({
                              title: "Billing Portal Opened",
                              message: "Plan management is handled through Stripe's secure billing portal.",
                              type: "success",
                            });
                          } catch (err) {
                            const errorMessage = getErrorMessage(err);
                            showNotification({
                              title: "Portal Access Failed",
                              message: errorMessage,
                              type: "error",
                            });
                          }
                        }}
                        variant="outline"
                        className="transition-all duration-200 hover:scale-105 hover:shadow-md"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Manage in Portal
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          if (selectedPlan.id === 'free') {
                            return;
                          }
                          handlePlanChange(selectedPlan);
                        }}
                        disabled={isCreating || selectedPlan.id === 'free'}
                        className="transition-all duration-200 hover:scale-105 hover:shadow-md"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Setting up...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            {dashboardData?.planDetails?.priceUsd && dashboardData.planDetails.priceUsd > 0 ? `Switch to ${selectedPlan.name}` : `Upgrade to ${selectedPlan.name}`}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex justify-center pt-4">
                  <Button 
                    variant="outline" 
                    onClick={handleClose}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    Maybe Later
                  </Button>
                </div>

                <div className="text-xs text-center text-muted-foreground">
                  <p>
                    Your trial starts immediately with full access to all features.
                    Cancel anytime during the trial at no charge.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : subscriptionFlow === 'polling' && sessionId ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                Processing Subscription
              </DialogTitle>
              <DialogDescription>
                Please complete your subscription setup in the browser window.
              </DialogDescription>
            </DialogHeader>

            <PaymentPollingScreen
              sessionId={sessionId}
              onSuccess={handleSubscriptionSuccess}
              onError={handleSubscriptionError}
              onCancel={handleBackToSelection}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default SubscriptionModal;