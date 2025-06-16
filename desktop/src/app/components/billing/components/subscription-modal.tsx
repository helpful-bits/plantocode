"use client";

import { useState, useEffect } from 'react';
import { 
  Star, 
  Check, 
  Loader2,
  ArrowLeft,
  Crown,
  Clock,
  Zap
} from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Alert, AlertDescription } from '@/ui/alert';
import { useNotification } from '@/contexts/notification-context';
import { getErrorMessage } from '@/utils/error-handling';
import StripeProvider from '../stripe/StripeProvider';
import SetupElementForm from '../stripe/SetupElementForm';
import { getAvailablePlans } from '@/actions/billing/plan.actions';
// Note: openBillingPortal removed as this component is now for new subscriptions only
import { invoke } from '@tauri-apps/api/core';
import type { SubscriptionPlan } from '@/types/tauri-commands';

interface SubscriptionIntentResponse {
  subscriptionId: string;
  clientSecret?: string; // For SetupIntent or PaymentIntent
  publishableKey: string;
  status: string;
  trialEnd?: string;
}

interface CreateSubscriptionIntentRequest {
  planId: string;
  trialDays?: number;
  [key: string]: unknown; // Add index signature for Tauri compatibility
}



export interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscriptionComplete?: (subscriptionId: string, shouldStartPolling?: boolean) => void;
  currentStatus?: string;
}

export function SubscriptionModal({ 
  isOpen, 
  onClose, 
  onSubscriptionComplete,
  currentStatus
}: SubscriptionModalProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  
  // New state for subscription flow
  const [subscriptionFlow, setSubscriptionFlow] = useState<'selection' | 'payment'>('selection');
  const [subscriptionIntent, setSubscriptionIntent] = useState<SubscriptionIntentResponse | null>(null);
  
  
  const { showNotification } = useNotification();

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const fetchSubscriptionPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch real subscription plans from the server
      const fetchedPlans = await getAvailablePlans();
      
      // Filter only active plans
      const activePlans = fetchedPlans.filter(plan => plan.active);
      
      setPlans(activePlans);
      
      // Auto-select recommended plan
      const recommendedPlan = activePlans.find(plan => plan.recommended);
      setSelectedPlanId(recommendedPlan?.id || activePlans[0]?.id || null);
      
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to fetch subscription plans:', err);
      
      // Show user-friendly error message
      showNotification({
        title: 'Failed to Load Plans',
        message: 'Unable to fetch subscription plans. Please try again later.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handleStartTrial = async (plan: SubscriptionPlan) => {
    try {
      setIsCreating(true);
      setError(null);
      
      // For new subscriptions
      const request: CreateSubscriptionIntentRequest = {
        planId: plan.id,
        trialDays: plan.trialDays,
      };
      
      const response = await invoke<SubscriptionIntentResponse>('create_subscription_intent_command', request);
      
      setSubscriptionIntent(response);
      setSubscriptionFlow('payment');
      
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

  const handleSubscriptionSuccess = (_setupIntentId: string) => {
    showNotification({
      title: 'Trial Started!',
      message: 'Your free trial has begun. Enjoy exploring all features!',
      type: 'success',
    });
    
    onClose();
    // Pass true to indicate polling should be started to monitor subscription activation
    onSubscriptionComplete?.(subscriptionIntent?.subscriptionId || '', true);
  };

  const handleSubscriptionError = (error: string) => {
    setError(error);
    showNotification({
      title: 'Setup Failed',
      message: error,
      type: 'error',
    });
  };

  const handleClose = () => {
    setSubscriptionFlow('selection');
    setSubscriptionIntent(null);
    setError(null);
    onClose();
  };

  const handleBackToSelection = () => {
    setSubscriptionFlow('selection');
    setSubscriptionIntent(null);
    setError(null);
  };

  useEffect(() => {
    if (isOpen) {
      fetchSubscriptionPlans();
    }
  }, [isOpen]);
  


  const selectedPlan = plans.find(plan => plan.id === selectedPlanId);
  const currentPrice = billingPeriod === 'monthly' 
    ? selectedPlan?.monthlyPrice 
    : selectedPlan?.yearlyPrice;
  const yearlyDiscount = selectedPlan 
    ? Math.round((1 - (selectedPlan.yearlyPrice / 12) / selectedPlan.monthlyPrice) * 100)
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto" 
        role="dialog" 
        aria-labelledby="subscription-modal-title" 
        aria-describedby="subscription-modal-description"
      >
        {subscriptionFlow === 'selection' ? (
          // Plan Selection Flow
          <>
            <DialogHeader>
              <DialogTitle id="subscription-modal-title" className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                Choose Your Plan
              </DialogTitle>
              <DialogDescription id="subscription-modal-description">
                Choose the plan that's right for you. Your new billing cycle will start after your trial ends.
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
                {/* Billing Period Toggle */}
                <div className="flex items-center justify-center">
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button
                      variant={billingPeriod === 'monthly' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setBillingPeriod('monthly')}
                      className="text-sm transition-all duration-200 hover:scale-105"
                    >
                      Monthly
                    </Button>
                    <Button
                      variant={billingPeriod === 'yearly' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setBillingPeriod('yearly')}
                      className="text-sm transition-all duration-200 hover:scale-105"
                    >
                      Yearly
                      {yearlyDiscount > 0 && (
                        <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-800">
                          Save {yearlyDiscount}%
                        </Badge>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Plan Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {plans.map((plan) => {
                    const price = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                    const pricePerMonth = billingPeriod === 'yearly' ? plan.yearlyPrice / 12 : plan.monthlyPrice;
                    
                    return (
                      <Card 
                        key={plan.id} 
                        className={`cursor-pointer transition-all duration-300 border-2 relative hover:shadow-lg ${
                          selectedPlanId === plan.id 
                            ? 'border-blue-500 shadow-lg scale-105 bg-blue-50/30' 
                            : 'border-border hover:border-blue-300 hover:scale-102'
                        } ${plan.recommended ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}`}
                        onClick={() => setSelectedPlanId(plan.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedPlanId(plan.id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-pressed={selectedPlanId === plan.id}
                        aria-label={`Select ${plan.name} plan - ${plan.description}`}
                      >
                        {plan.recommended && (
                          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                            <Badge className="bg-yellow-500 text-yellow-900">
                              <Star className="h-3 w-3 mr-1" />
                              Recommended
                            </Badge>
                          </div>
                        )}
                        
                        <CardHeader className="text-center">
                          <CardTitle className="text-lg">{plan.name}</CardTitle>
                          <div className="space-y-1">
                            <div className="text-3xl font-bold">
                              {formatCurrency(price, plan.currency)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {billingPeriod === 'yearly' ? (
                                <>
                                  per year ({formatCurrency(pricePerMonth, plan.currency)}/month)
                                </>
                              ) : (
                                'per month'
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                          
                          <div className="flex items-center justify-center gap-1 text-sm text-green-600">
                            <Clock className="h-4 w-4" />
                            <span>{plan.trialDays}-day free trial</span>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3">
                          <ul className="space-y-2">
                            {plan.features.map((feature, index) => (
                              <li key={index} className="flex items-start gap-2 text-sm">
                                <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                          
                          {selectedPlanId === plan.id && (
                            <div className="pt-3">
                              <Button
                                onClick={() => handleStartTrial(plan)}
                                disabled={isCreating}
                                className="w-full transition-all duration-200 hover:scale-105 hover:shadow-md"
                              >
                                {isCreating ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Setting up...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-4 w-4 mr-2" />
                                    {currentStatus === 'trialing' ? 'Upgrade to this Plan' : 'Start Free Trial'}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Bottom Actions */}
                <div className="flex justify-center pt-4">
                  <Button 
                    variant="outline" 
                    onClick={handleClose}
                    className="transition-all duration-200 hover:scale-105"
                  >
                    Maybe Later
                  </Button>
                </div>

                {/* Trial Info */}
                <div className="text-xs text-center text-muted-foreground">
                  <p>
                    Your trial starts immediately. We'll notify you before it ends.
                    Cancel anytime during the trial at no charge.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          // Payment Setup Flow with Stripe Elements
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                Setup Payment Method
              </DialogTitle>
              <DialogDescription>
                {selectedPlan ? `Complete your ${selectedPlan.name} plan setup by adding a payment method.` : 'Complete your plan setup by adding a payment method.'}
              </DialogDescription>
            </DialogHeader>

            <StripeProvider>
              <div className="space-y-4">
                {/* Back Button */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToSelection}
                    className="flex items-center gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to plans
                  </Button>
                </div>

                {/* Setup Form */}
                {subscriptionIntent && selectedPlan && (
                  <SetupElementForm
                    clientSecret={subscriptionIntent.clientSecret || ''}
                    subscriptionDetails={{
                      planName: selectedPlan.name,
                      monthlyPrice: currentPrice || 0,
                      currency: selectedPlan.currency,
                      trialDays: selectedPlan.trialDays,
                      features: selectedPlan.features,
                    }}
                    onSuccess={handleSubscriptionSuccess}
                    onError={handleSubscriptionError}
                    onCancel={handleBackToSelection}
                  />
                )}
              </div>
            </StripeProvider>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SubscriptionModal;