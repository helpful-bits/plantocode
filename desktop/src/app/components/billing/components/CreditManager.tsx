"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { VisuallyHidden } from "@/ui/visually-hidden";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { Input } from "@/ui/input";
import { Loader2, CreditCard, AlertCircle, DollarSign, TrendingUp, ChevronDown, Star, Sparkles, Zap, Info, ArrowRight } from "lucide-react";
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData } from '@/types/tauri-commands';
import { createCreditPurchaseCheckoutSession, getCreditPurchaseFeeTiers, type FeeTierConfig, type FeeTier } from "@/actions/billing";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { open } from "@/utils/shell-utils";
import { PaymentPollingScreen } from "./PaymentPollingScreen";
import { Badge } from "@/ui/badge";
import { cn } from "@/utils/utils";

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
    
    // If tier not found, return null
    if (currentTierIndex === -1) return null;
    
    // Check if we're already in the best tier (last index has the lowest fees)
    if (currentTierIndex === feeTiers.tiers.length - 1) return null;
    
    // Get the next better tier (higher index = better tier with lower fees)
    const nextTier = feeTiers.tiers[currentTierIndex + 1];
    if (!nextTier) return null;
    
    // Calculate the minimum amount needed to reach the next tier
    const amountNeeded = nextTier.min - amount;
    
    // Only suggest if the amount needed is positive and reasonable
    if (amountNeeded <= 0) return null;
    
    return {
      tier: nextTier,
      amountNeeded: amountNeeded
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
      
      // Real-time validation
      if (value !== '') {
        const amount = parseFloat(value);
        const minAmount = feeTiers && feeTiers.tiers.length > 0 
          ? Math.min(...feeTiers.tiers.map(t => t.min))
          : 1;
        
        if (!isNaN(amount) && amount < minAmount) {
          setError(`Amount must be at least $${minAmount.toFixed(2)}`);
        } else {
          setError(null);
        }
      } else {
        setError(null);
      }
    }
  };

  const handlePurchase = async () => {
    const amount = getCurrentAmount();
    const minAmount = feeTiers && feeTiers.tiers.length > 0 
      ? Math.min(...feeTiers.tiers.map(t => t.min))
      : 1;
    
    if (!amount || amount < minAmount) {
      setError(`Please enter an amount of at least $${minAmount.toFixed(2)}`);
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
    const minAmount = feeTiers && feeTiers.tiers.length > 0 
      ? Math.min(...feeTiers.tiers.map(t => t.min))
      : 1;
    
    return amount !== null && amount >= minAmount;
  };

  // Enhanced Tier Display with better visual hierarchy
  const TierDisplay = () => {
    if (!feeTiers) return null;
    
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/5 via-transparent to-accent/5 overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Fee Tiers</h3>
              <p className="text-sm text-muted-foreground font-normal">Save More with Bulk Purchases</p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {feeTiers.tiers.map((tier, index) => {
            const isCurrentTier = getCurrentAmount() !== null && 
              getCurrentAmount()! >= tier.min && 
              (tier.max === undefined || tier.max === null || getCurrentAmount()! < tier.max);
            
            return (
              <div 
                key={index}
                className={cn(
                  "relative p-4 rounded-xl border-2 transition-all duration-300",
                  isCurrentTier 
                    ? "border-primary bg-primary/5 shadow-md transform scale-[1.02]" 
                    : "border-border/50 bg-card/50 hover:border-border hover:bg-card"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "font-semibold",
                      isCurrentTier ? "text-primary" : "text-foreground"
                    )}>
                      {tier.label}
                    </span>
                    {tier.label === "BULK" && (
                      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Best Value
                      </Badge>
                    )}
                  </div>
                  <div className={cn(
                    "text-lg font-bold",
                    isCurrentTier ? "text-primary" : "text-foreground"
                  )}>
                    {(tier.feeRate * 100).toFixed(0)}% fee
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    ${tier.min.toFixed(0)}{tier.max ? `–$${(tier.max - 0.01).toFixed(2)}` : '+'}
                  </span>
                  {isCurrentTier && (
                    <Badge variant="outline" className="border-primary text-primary">
                      Your tier
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  // Enhanced Savings Alert with animation
  const SavingsAlert = () => {
    const amount = getCurrentAmount();
    if (!amount || !feeTiers || amount < 1) return null;
    
    const nextTierInfo = getNextTier(amount);
    // Only show if there's a next tier and the amount needed is reasonable (not more than $50)
    if (!nextTierInfo || nextTierInfo.amountNeeded > 50 || nextTierInfo.amountNeeded <= 0) return null;
    
    const currentFee = calculateFee(amount);
    const nextAmount = amount + nextTierInfo.amountNeeded;
    const nextFee = calculateFee(nextAmount);
    
    // Calculate the actual savings percentage
    const currentFeeRate = currentFee.feeRate * 100;
    const nextFeeRate = nextFee.feeRate * 100;
    const savingsPercent = (currentFeeRate - nextFeeRate).toFixed(0);
    
    // Don't show if there's no actual savings
    if (parseFloat(savingsPercent) <= 0) return null;
    
    return (
      <Alert className="border-2 border-success/30 bg-success/5 animate-appear">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-success/10">
            <Sparkles className="h-5 w-5 text-success" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-success-foreground mb-1">
              Save {savingsPercent}% on fees!
            </p>
            <p className="text-sm text-muted-foreground">
              Add just <span className="font-semibold text-foreground">${nextTierInfo.amountNeeded.toFixed(2)}</span> more to reach the <span className="font-medium">{nextTierInfo.tier.label}</span> tier.
            </p>
          </div>
        </div>
      </Alert>
    );
  };

  // Enhanced comparison section
  const ComparisonSection = () => {
    const examples = [
      { purchases: [10, 10, 10], label: "3 × $10 purchases" },
      { purchases: [30], label: "1 × $30 purchase" },
    ];
    
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader 
          className="cursor-pointer select-none bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 transition-colors"
          onClick={() => setShowComparison(!showComparison)}
        >
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <span>Why Buy in Bulk?</span>
            </div>
            <div className={cn(
              "transition-transform duration-200",
              showComparison ? "rotate-180" : ""
            )}>
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardTitle>
        </CardHeader>
        {showComparison && (
          <CardContent className="pt-4 animate-appear">
            <div className="space-y-4">
              {examples.map((example, idx) => {
                const totalPaid = example.purchases.reduce((sum, p) => sum + p, 0);
                const totalFees = example.purchases.reduce((sum, p) => sum + calculateFee(p).feeAmount, 0);
                const totalCredits = totalPaid - totalFees;
                
                return (
                  <div key={idx} className="p-4 rounded-lg bg-secondary/30 space-y-2">
                    <div className="font-medium flex items-center gap-2">
                      {example.label}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">You pay</p>
                        <p className="font-semibold">${totalPaid.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Fees</p>
                        <p className="font-semibold text-destructive">
                          -${totalFees.toFixed(2)} ({((totalFees / totalPaid) * 100).toFixed(0)}%)
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Credits</p>
                        <p className="font-semibold text-success">${totalCredits.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <Alert className="border-info/30 bg-info/5">
                <Zap className="h-4 w-4 text-info" />
                <AlertDescription className="text-sm">
                  Larger purchases mean lower fee percentages and more credits for your money!
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        )}
      </Card>
    );
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <VisuallyHidden>
          <DialogTitle>Credit Manager</DialogTitle>
        </VisuallyHidden>
        
        {currentView === "selection" ? (
          <div className="p-8">
            {/* Header Section */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Purchase Top-up Credits
              </h2>
              <p className="text-muted-foreground text-lg">
                Purchase additional credits for your account. These credits do not expire and are consumed as you use the service.
              </p>
            </div>

            {/* Balance Card */}
            <Card className="mb-8 border-0 shadow-lg bg-gradient-to-br from-primary/10 to-accent/10 overflow-hidden">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-3 rounded-xl bg-background/80 shadow-inner">
                        <CreditCard className="h-6 w-6 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Top-up Credits Balance
                      </span>
                    </div>
                    <div className="text-5xl font-bold text-foreground">
                      ${balance.toFixed(2)}
                    </div>
                  </div>
                  <div className="hidden md:block opacity-10">
                    <DollarSign className="h-32 w-32 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive" className="mb-6 animate-appear">
                <AlertCircle className="h-5 w-5" />
                <AlertDescription className="text-base">{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Left Column - Amount Selection */}
              <div className="lg:col-span-3 space-y-6">
                <Card className="border-0 shadow-lg">
                  <CardHeader className="pb-6">
                    <CardTitle className="text-xl">Select Amount to Purchase</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {SMART_PRESETS.map((preset) => {
                        const { tier } = calculateFee(preset);
                        const isBestValue = tier?.label === "BULK";
                        const isSelected = selectedTier === preset;
                        
                        return (
                          <Button
                            key={preset}
                            variant={isSelected ? "default" : "outline"}
                            size="lg"
                            onClick={() => handleTierSelect(preset)}
                            disabled={isLoading}
                            className={cn(
                              "h-24 relative group transition-all duration-300",
                              isSelected && "ring-2 ring-primary ring-offset-2",
                              isBestValue && !isSelected && "border-yellow-500/50 hover:border-yellow-500"
                            )}
                          >
                            {isBestValue && (
                              <div className="absolute -top-2 -right-2 animate-pulse">
                                <div className="relative">
                                  <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
                                  <div className="absolute inset-0 blur-sm bg-yellow-500/50 rounded-full" />
                                </div>
                              </div>
                            )}
                            <div className="text-center">
                              <p className="text-3xl font-bold mb-1">${preset}</p>
                              {tier && (
                                <p className={cn(
                                  "text-xs",
                                  isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                )}>
                                  {tier.label} • {(tier.feeRate * 100).toFixed(0)}% fee
                                </p>
                              )}
                            </div>
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant={showCustomInput ? "default" : "outline"}
                      size="lg"
                      onClick={handleOtherClick}
                      disabled={isLoading}
                      className="w-full h-20 text-xl font-semibold"
                    >
                      Other Amount
                    </Button>

                    {showCustomInput && (
                      <div className="space-y-3 animate-appear">
                        <label htmlFor="custom-amount" className="block text-sm font-medium">
                          Enter custom amount
                        </label>
                        <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            id="custom-amount"
                            type="text"
                            placeholder="100.00"
                            value={customAmount}
                            onChange={handleCustomAmountChange}
                            className="pl-12 h-12 text-lg"
                            disabled={isLoading}
                            autoFocus
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {feeTiers && feeTiers.tiers.length > 0 ? (
                            <>Minimum amount: ${Math.min(...feeTiers.tiers.map(t => t.min)).toFixed(2)}</>
                          ) : (
                            <>Minimum amount: $1.00</>
                          )}
                        </p>
                      </div>
                    )}

                    <SavingsAlert />

                    {getCurrentAmount() !== null && (
                      <div className="bg-gradient-to-br from-secondary/50 to-secondary/30 rounded-xl p-6 space-y-4 animate-appear">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-lg">Transaction Summary</h4>
                          {(() => {
                            const { tier } = calculateFee(getCurrentAmount()!);
                            return tier ? (
                              <Badge variant="secondary" className="text-xs">
                                {tier.label} TIER
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                        {(() => {
                          const amount = getCurrentAmount()!;
                          const { feeRate, feeAmount, netAmount } = calculateFee(amount);
                          return (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center py-2">
                                <span className="text-muted-foreground">Amount</span>
                                <span className="font-semibold text-lg">${amount.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-t border-border/50">
                                <span className="text-muted-foreground">
                                  Processing fee ({(feeRate * 100).toFixed(0)}%)
                                </span>
                                <span className="text-destructive font-medium">
                                  -${feeAmount.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center py-3 border-t-2 border-primary/20 bg-primary/5 -mx-6 px-6 -mb-6 rounded-b-xl">
                                <span className="font-semibold text-lg">Credits received</span>
                                <span className="font-bold text-2xl text-primary">
                                  ${netAmount.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <Button 
                      onClick={handlePurchase}
                      disabled={!isValidAmount() || isLoading}
                      className="w-full h-14 text-lg font-semibold shadow-lg"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : isValidAmount() ? (
                        <>
                          <CreditCard className="h-5 w-5 mr-2" />
                          Purchase ${getCurrentAmount()!.toFixed(2)}
                        </>
                      ) : (
                        'Select an amount to purchase'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              
              {/* Right Column - Information */}
              <div className="lg:col-span-2 space-y-6">
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