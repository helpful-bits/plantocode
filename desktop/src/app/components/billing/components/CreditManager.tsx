"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { VisuallyHidden } from "@/ui/visually-hidden";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { Input } from "@/ui/input";
import { Loader2, CreditCard, AlertCircle, DollarSign, TrendingUp, ChevronDown, ChevronUp, Star, Sparkles } from "lucide-react";
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData } from '@/types/tauri-commands';
import { createCreditPurchaseCheckoutSession, getCreditPurchaseFeeTiers, type FeeTierConfig, type FeeTier } from "@/actions/billing";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { open } from "@/utils/shell-utils";
import { PaymentPollingScreen } from "./PaymentPollingScreen";

export interface CreditManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type CurrentView = "selection" | "polling";
export const CreditManager = ({ isOpen, onClose }: CreditManagerProps) => {
  const [currentView, setCurrentView] = useState<CurrentView>("selection");
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feeTiers, setFeeTiers] = useState<FeeTierConfig | null>(null);
  const [showComparison, setShowComparison] = useState<boolean>(false);

  const { showNotification } = useNotification();

  const SMART_PRESETS = [10, 15, 50, 100, 250];

  useEffect(() => {
    if (isOpen) {
      loadCreditDetails();
    }
  }, [isOpen]);

  const loadCreditDetails = async () => {
    try {
      setError(null);
      const [billingData, tiers] = await Promise.all([
        invoke<BillingDashboardData>('get_billing_dashboard_data_command'),
        getCreditPurchaseFeeTiers()
      ]);
      setBalance(billingData.creditBalanceUsd);
      setFeeTiers(tiers);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error("Failed to load credit details:", err);
    }
  };

  const calculateFee = (amount: number): { feeRate: number; feeAmount: number; netAmount: number; tier: FeeTier | null } => {
    if (!feeTiers || feeTiers.tiers.length === 0) {
      // Fallback to default calculation if tiers not loaded
      let feeRate = 0.20;
      if (amount >= 30) feeRate = 0.10;
      if (amount >= 300) feeRate = 0.05;
      const feeAmount = amount * feeRate;
      return { feeRate, feeAmount, netAmount: amount - feeAmount, tier: null };
    }
    
    // Find the applicable tier
    const tier = feeTiers.tiers.find(t => 
      amount >= t.min && (t.max === undefined || t.max === null || amount < t.max)
    );
    
    if (!tier) {
      // Use the last tier for amounts above all defined tiers
      const lastTier = feeTiers.tiers[feeTiers.tiers.length - 1];
      const feeAmount = amount * lastTier.feeRate;
      return { 
        feeRate: lastTier.feeRate, 
        feeAmount, 
        netAmount: amount - feeAmount,
        tier: lastTier 
      };
    }
    
    const feeAmount = amount * tier.feeRate;
    return { 
      feeRate: tier.feeRate, 
      feeAmount, 
      netAmount: amount - feeAmount,
      tier 
    };
  };

  const getNextTier = (amount: number): { tier: FeeTier; amountNeeded: number } | null => {
    if (!feeTiers) return null;
    
    const currentTierIndex = feeTiers.tiers.findIndex(t => 
      amount >= t.min && (t.max === undefined || t.max === null || amount < t.max)
    );
    
    if (currentTierIndex === -1 || currentTierIndex === 0) return null;
    
    const nextTier = feeTiers.tiers[currentTierIndex - 1];
    if (!nextTier || !nextTier.max) return null;
    
    return {
      tier: nextTier,
      amountNeeded: nextTier.max - amount
    };
  };

  const getCurrentAmount = (): number | null => {
    if (selectedTier !== null) {
      return selectedTier;
    }
    if (showCustomInput && customAmount) {
      const amount = parseFloat(customAmount);
      return isNaN(amount) ? null : amount;
    }
    return null;
  };

  const handleTierSelect = (amount: number) => {
    setSelectedTier(amount);
    setShowCustomInput(false);
    setCustomAmount("");
    setError(null);
  };

  const handleOtherClick = () => {
    setSelectedTier(null);
    setShowCustomInput(true);
    setError(null);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setCustomAmount(value);
      setError(null);
    }
  };

  const handlePurchase = async () => {
    const amount = getCurrentAmount();
    if (!amount || amount < 1 || amount > 1000) {
      setError("Please enter a valid amount between $1 and $1000");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await createCreditPurchaseCheckoutSession(amount);
      
      setSessionId(response.sessionId);
      await open(response.url);
      setCurrentView("polling");
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      showNotification({
        title: "Checkout Failed",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    showNotification({
      title: "Purchase Successful",
      message: "Your credits have been added to your account!",
      type: "success",
    });
    
    setCurrentView("selection");
    setSessionId(null);
    setSelectedTier(null);
    setCustomAmount("");
    setShowCustomInput(false);
    setError(null);
    
    // Trigger global billing data update event
    window.dispatchEvent(new CustomEvent('billing-data-updated'));
    onClose();
  };

  const handlePaymentError = (error: string) => {
    setError(error);
    showNotification({
      title: "Payment Failed",
      message: error,
      type: "error",
    });
    setCurrentView("selection");
    setSessionId(null);
  };

  const handleCancel = () => {
    setCurrentView("selection");
    setSessionId(null);
    setError(null);
  };

  const handleClose = () => {
    setCurrentView("selection");
    setSessionId(null);
    setSelectedTier(null);
    setCustomAmount("");
    setShowCustomInput(false);
    setError(null);
    onClose();
  };

  const isValidAmount = () => {
    const amount = getCurrentAmount();
    return amount !== null && amount >= 1 && amount <= 1000;
  };

  // Component for displaying tier information
  const TierDisplay = () => {
    if (!feeTiers) return null;
    
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Fee Tiers - Save More with Bulk Purchases
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {feeTiers.tiers.map((tier, index) => {
            const isCurrentTier = getCurrentAmount() !== null && 
              getCurrentAmount()! >= tier.min && 
              (tier.max === undefined || tier.max === null || getCurrentAmount()! < tier.max);
            
            return (
              <div 
                key={index}
                className={`p-3 rounded-lg border transition-all ${
                  isCurrentTier 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border bg-secondary/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {tier.label}
                    </span>
                    {tier.label === "BULK" && (
                      <div className="flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                        <Star className="h-3 w-3 fill-current" />
                        Best Value
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    {(tier.feeRate * 100).toFixed(0)}% fee
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ${tier.min}+{tier.max ? ` - $${tier.max - 0.01}` : ''}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  // Component for savings alert
  const SavingsAlert = () => {
    const amount = getCurrentAmount();
    if (!amount || !feeTiers) return null;
    
    const nextTierInfo = getNextTier(amount);
    if (!nextTierInfo || nextTierInfo.amountNeeded > 50) return null;
    
    const currentFee = calculateFee(amount);
    const nextAmount = amount + nextTierInfo.amountNeeded;
    const nextFee = calculateFee(nextAmount);
    const savingsPercent = ((currentFee.feeRate - nextFee.feeRate) * 100).toFixed(0);
    
    return (
      <Alert className="border-green-500/50 bg-green-500/10">
        <Sparkles className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-sm">
          <span className="font-semibold">Save {savingsPercent}% on fees!</span> Add just ${nextTierInfo.amountNeeded.toFixed(2)} more to reach the {nextTierInfo.tier.label} tier.
        </AlertDescription>
      </Alert>
    );
  };

  // Component for comparison section
  const ComparisonSection = () => {
    const examples = [
      { purchases: [10, 10, 10], label: "3 × $10 purchases" },
      { purchases: [30], label: "1 × $30 purchase" },
    ];
    
    return (
      <Card>
        <CardHeader 
          className="cursor-pointer select-none"
          onClick={() => setShowComparison(!showComparison)}
        >
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Why Buy in Bulk?</span>
            {showComparison ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {showComparison && (
          <CardContent className="pt-0">
            <div className="space-y-3">
              {examples.map((example, idx) => {
                const totalPaid = example.purchases.reduce((sum, p) => sum + p, 0);
                const totalFees = example.purchases.reduce((sum, p) => sum + calculateFee(p).feeAmount, 0);
                const totalCredits = totalPaid - totalFees;
                
                return (
                  <div key={idx} className="text-sm space-y-1">
                    <div className="font-medium">{example.label}</div>
                    <div className="text-muted-foreground">
                      Pay: ${totalPaid.toFixed(2)} → Get: ${totalCredits.toFixed(2)} credits
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Fees: ${totalFees.toFixed(2)} ({((totalFees / totalPaid) * 100).toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t text-xs text-muted-foreground">
                Larger purchases mean lower fee percentages and more credits for your money!
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    );
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <VisuallyHidden>
          <DialogTitle>Credit Manager</DialogTitle>
        </VisuallyHidden>
        
        {currentView === "selection" ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Purchase Top-up Credits</h2>
              <p className="text-muted-foreground">Purchase additional credits for your account. These credits do not expire and are consumed as you use the service.</p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Top-up Credits Balance</span>
                </div>
                <div className="text-3xl font-bold text-foreground">
                  ${balance.toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Select Amount to Purchase</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      {SMART_PRESETS.map((preset) => {
                        const { tier } = calculateFee(preset);
                        const isBestValue = tier?.label === "BULK";
                        return (
                        <Button
                          key={preset}
                          variant={selectedTier === preset ? "default" : "outline"}
                          size="lg"
                          onClick={() => handleTierSelect(preset)}
                          disabled={isLoading}
                          className={`h-20 relative overflow-hidden transition-all ${
                            isBestValue ? 'ring-2 ring-yellow-500 ring-offset-2' : ''
                          }`}
                        >
                          {isBestValue && (
                            <div className="absolute top-1 right-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            </div>
                          )}
                          <span className="text-xl font-semibold">${preset}</span>
                        </Button>
                      );})}
                      <Button
                        variant={showCustomInput ? "default" : "outline"}
                        size="lg"
                        onClick={handleOtherClick}
                        disabled={isLoading}
                        className="h-20 text-xl font-semibold col-span-2"
                      >
                        Other Amount
                      </Button>
                    </div>

                {showCustomInput && (
                  <div className="space-y-2">
                    <label htmlFor="custom-amount" className="block text-sm font-medium">
                      Enter custom amount
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="custom-amount"
                        type="text"
                        placeholder="100.00"
                        value={customAmount}
                        onChange={handleCustomAmountChange}
                        className="pl-10"
                        disabled={isLoading}
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Minimum: $1.00, Maximum: $1,000.00
                    </p>
                  </div>
                )}

                    <SavingsAlert />

                    {getCurrentAmount() !== null && (
                      <div role="status" className="bg-secondary/50 rounded-lg p-4 space-y-2">
                        <div className="text-sm font-medium text-muted-foreground">
                          Transaction Summary
                          {(() => {
                            const { tier } = calculateFee(getCurrentAmount()!);
                            return tier ? (
                              <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                                {tier.label} Tier
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {(() => {
                          const amount = getCurrentAmount()!;
                          const { feeRate, feeAmount, netAmount } = calculateFee(amount);
                          return (
                            <>
                              <div className="flex justify-between">
                                <span>You pay:</span>
                                <span className="font-semibold">${amount.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Processing fee ({(feeRate * 100).toFixed(0)}%):</span>
                                <span>-${feeAmount.toFixed(2)}</span>
                              </div>
                              <div className="border-t pt-2 flex justify-between">
                                <span className="font-medium">Credits you receive:</span>
                                <span className="font-bold text-primary">${netAmount.toFixed(2)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <Button 
                      onClick={handlePurchase}
                      disabled={!isValidAmount() || isLoading}
                      className="w-full h-12 text-lg font-medium"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : isValidAmount() ? (
                        <>
                          Purchase ${getCurrentAmount()!.toFixed(2)}
                        </>
                      ) : (
                        'Select an amount to purchase'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-6">
                <TierDisplay />
                <ComparisonSection />
              </div>
            </div>
          </div>
        ) : currentView === "polling" && sessionId ? (
          <PaymentPollingScreen
            sessionId={sessionId}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            onCancel={handleCancel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};