"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/ui/switch";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Label } from "@/ui/label";
import { Alert, AlertDescription } from "@/ui/alert";
import { Loader2, DollarSign, Zap, TrendingUp, Sparkles } from "lucide-react";
import { getAutoTopOffSettings, updateAutoTopOffSettings, getCreditPurchaseFeeTiers, type AutoTopOffSettings as Settings, type UpdateAutoTopOffRequest, type FeeTierConfig, type FeeTier } from "@/actions/billing";
import { formatUsdCurrency } from "@/utils/currency-utils";
import { useNotification } from "@/contexts/notification-context";

interface AutoTopOffSettingsProps {
  className?: string;
}

export function AutoTopOffSettings({ className }: AutoTopOffSettingsProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [feeTiers, setFeeTiers] = useState<FeeTierConfig | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  
  const { showNotification } = useNotification();

  // Load current settings and fee tiers
  useEffect(() => {
    loadSettings();
    loadFeeTiers();
  }, []);
  
  // Ensure fee tiers are loaded when component mounts or when they're missing
  useEffect(() => {
    if (!feeTiers) {
      loadFeeTiers();
    }
  }, [feeTiers]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const currentSettings = await getAutoTopOffSettings();
      setSettings(currentSettings);
      
      // Update form state
      setEnabled(currentSettings.enabled);
      setThreshold(currentSettings.threshold || "");
      setAmount(currentSettings.amount || "");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load auto top-off settings";
      setError(errorMessage);
      console.error("Failed to load auto top-off settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFeeTiers = async () => {
    try {
      const tiers = await getCreditPurchaseFeeTiers();
      setFeeTiers(tiers);
    } catch (err) {
      console.error("Failed to load fee tiers:", err);
    }
  };

  const getCurrentFeeTier = (amountValue: number): FeeTier | null => {
    if (!feeTiers) return null;
    return feeTiers.tiers.find(tier => {
      const isAboveMin = amountValue >= tier.min;
      const isBelowMax = tier.max === undefined || tier.max === null || amountValue < tier.max;
      return isAboveMin && isBelowMax;
    }) || null;
  };

  const getNextBetterTier = (amount: number): { tier: FeeTier; amountNeeded: number } | null => {
    if (!feeTiers || amount <= 0) return null;
    
    // Find current tier
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
    // Allow up to $100 for tier upgrades to accommodate SAVER to BULK tier jump
    if (amountNeeded <= 0 || amountNeeded > 100) return null;
    
    return {
      tier: nextTier,
      amountNeeded: amountNeeded
    };
  };

  const calculateSavingsInfo = (currentAmount: number): { 
    nextTier: FeeTier; 
    amountNeeded: number; 
    currentFeeRate: number;
    nextFeeRate: number;
    feeRateSavings: number;
  } | null => {
    if (!feeTiers || !feeTiers.tiers || feeTiers.tiers.length === 0) return null;
    if (!currentAmount || currentAmount <= 0) return null;
    
    const nextTierInfo = getNextBetterTier(currentAmount);
    if (!nextTierInfo) return null;
    
    const currentTier = getCurrentFeeTier(currentAmount);
    if (!currentTier) return null;
    
    // Calculate the fee rate difference
    const currentFeeRate = currentTier.feeRate * 100; // Convert to percentage
    const nextFeeRate = nextTierInfo.tier.feeRate * 100; // Convert to percentage
    const feeRateSavings = currentFeeRate - nextFeeRate;
    
    // Only show if there's actual fee rate savings
    if (feeRateSavings <= 0) return null;
    
    return {
      nextTier: nextTierInfo.tier,
      amountNeeded: nextTierInfo.amountNeeded,
      currentFeeRate,
      nextFeeRate,
      feeRateSavings
    };
  };

  const handleSave = async (overrides?: { enabled?: boolean; amount?: string; customMessage?: string }): Promise<boolean> => {
    try {
      setIsSaving(true);
      setError(null);

      // Use overrides if provided, otherwise use state
      const saveEnabled = overrides?.enabled !== undefined ? overrides.enabled : enabled;
      const saveAmount = overrides?.amount !== undefined ? overrides.amount : amount;
      const saveThreshold = threshold;

      // Validate form if enabled
      if (saveEnabled) {
        const thresholdNum = parseFloat(saveThreshold);
        const amountNum = parseFloat(saveAmount);

        if (!saveThreshold || isNaN(thresholdNum) || thresholdNum <= 0 || thresholdNum > 1000) {
          setError("Auto top-off threshold must be between $0.01 and $1000.00");
          return false;
        }

        // Get minimum amount from fee tiers
        const minAmount = feeTiers && feeTiers.tiers.length > 0 
          ? Math.min(...feeTiers.tiers.map(t => t.min))
          : 1;

        if (!saveAmount || isNaN(amountNum) || amountNum < minAmount) {
          setError(`Auto top-off amount must be at least $${minAmount.toFixed(2)}`);
          return false;
        }
      }

      const updateRequest: UpdateAutoTopOffRequest = {
        enabled: saveEnabled,
        threshold: saveEnabled && saveThreshold ? saveThreshold : undefined,
        amount: saveEnabled && saveAmount ? saveAmount : undefined,
      };

      const updatedSettings = await updateAutoTopOffSettings(updateRequest);
      setSettings(updatedSettings);

      showNotification({
        type: "success",
        title: "Auto Top-Off Settings Updated",
        message: overrides?.customMessage || (saveEnabled 
          ? `Auto top-off enabled: ${formatUsdCurrency(parseFloat(updatedSettings.amount || "0"))} when balance falls below ${formatUsdCurrency(parseFloat(updatedSettings.threshold || "0"))}`
          : "Auto top-off has been disabled"),
      });
      
      // Trigger billing data refresh to update current balance
      window.dispatchEvent(new CustomEvent('billing-data-updated'));
      
      // If auto top-off was enabled, it may trigger immediately
      // Refresh again after a delay to catch the updated balance
      if (enabled) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('billing-data-updated'));
        }, 3000); // 3 second delay
        
        // And once more after 6 seconds to be sure
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('billing-data-updated'));
        }, 6000);
      }
      
      return true; // Success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update auto top-off settings";
      setError(errorMessage);
      console.error("Failed to update auto top-off settings:", err);
      
      showNotification({
        type: "error",
        title: "Update Failed",
        message: errorMessage,
      });
      
      return false; // Failure
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = () => {
    if (!settings) return false;
    
    return (
      enabled !== settings.enabled ||
      (enabled && threshold !== (settings.threshold || "")) ||
      (enabled && amount !== (settings.amount || ""))
    );
  };

  const isFormValid = () => {
    if (!enabled) return true;
    
    const thresholdNum = parseFloat(threshold);
    const amountNum = parseFloat(amount);
    
    return (
      threshold && !isNaN(thresholdNum) && thresholdNum > 0 && thresholdNum <= 1000 &&
      amount && !isNaN(amountNum) && amountNum > 0 && amountNum <= 1000
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            Auto Top-Off Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          Auto Top-Off Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-topoff-enabled" className="text-base font-medium">
                Enable Auto Top-Off
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically add credits when your balance falls below a threshold
              </p>
            </div>
            <Switch
              id="auto-topoff-enabled"
              checked={enabled}
              onCheckedChange={async (newEnabled) => {
                setEnabled(newEnabled);
                // Save immediately when toggling off
                if (!newEnabled) {
                  const success = await handleSave({ enabled: false });
                  if (!success) {
                    // Revert on error
                    setEnabled(!newEnabled);
                  }
                }
              }}
              disabled={isSaving}
              className="[&[data-state=unchecked]]:bg-muted [&[data-state=unchecked]]:border-border/50 [&[data-state=unchecked]:hover]:bg-muted/80"
            />
          </div>


          {enabled ? (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="threshold" className="text-sm font-medium">
                    Threshold Amount
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="threshold"
                      type="number"
                      placeholder="5.00"
                      min="0.01"
                      max="1000"
                      step="0.01"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="pl-10"
                      disabled={isSaving}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Trigger auto top-off when balance falls below this amount
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-medium">
                    Top-Off Amount
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="amount"
                      type="number"
                      placeholder="25.00"
                      min="0.01"
                      max="1000"
                      step="0.01"
                      value={amount}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAmount(value);
                        
                        // Real-time validation
                        if (value && feeTiers) {
                          const amountNum = parseFloat(value);
                          const minAmount = feeTiers.tiers.length > 0 
                            ? Math.min(...feeTiers.tiers.map(t => t.min))
                            : 1;
                          
                          if (!isNaN(amountNum) && amountNum > 0 && amountNum < minAmount) {
                            setAmountError(`Amount must be at least $${minAmount.toFixed(2)}`);
                          } else {
                            setAmountError(null);
                          }
                        } else {
                          setAmountError(null);
                        }
                      }}
                      className={`pl-10 ${amountError ? 'border-destructive focus:ring-destructive' : ''}`}
                      disabled={isSaving}
                    />
                  </div>
                  <p className={`text-xs ${amountError ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {amountError || (
                      feeTiers && feeTiers.tiers.length > 0 ? (
                        <>Amount to add to your account automatically (minimum: ${Math.min(...feeTiers.tiers.map(t => t.min)).toFixed(2)})</>
                      ) : (
                        <>Amount to add to your account automatically</>
                      )
                    )}
                  </p>
                  {amount && feeTiers && (() => {
                    const amountNum = parseFloat(amount);
                    if (isNaN(amountNum) || amountNum <= 0) return null;
                    
                    const minAmount = feeTiers.tiers.length > 0 
                      ? Math.min(...feeTiers.tiers.map(t => t.min))
                      : 1;
                    
                    // Only show tier if amount is at least the minimum
                    if (amountNum < minAmount) return null;
                    
                    const currentTier = getCurrentFeeTier(amountNum);
                    if (!currentTier) return null;
                    
                    const tierColor = currentTier.label === "STARTER" ? "text-tier-starter" : 
                                     currentTier.label === "SAVER" ? "text-tier-saver" : 
                                     currentTier.label === "SMART" ? "text-tier-smart" : 
                                     currentTier.label === "BULK" ? "text-tier-bulk" :
                                     "text-tier-bulk";
                    
                    return (
                      <p className={`text-xs font-medium ${tierColor} mt-1`}>
                        {currentTier.label} tier - {(currentTier.feeRate * 100).toFixed(0)}% fee
                      </p>
                    );
                  })()}
                </div>
              </div>

              {/* Savings Alert */}
              {(() => {
                if (!amount || !feeTiers) return null;
                
                const amountNum = parseFloat(amount);
                if (isNaN(amountNum) || amountNum <= 0) return null;
                
                // Always calculate savings based on the actual entered amount
                // This ensures we show the correct tier upgrade suggestion
                const savingsInfo = calculateSavingsInfo(amountNum);
                if (!savingsInfo) return null;
                
                return (
                  <Alert className="border-2 border-success/30 bg-success/5">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-success/10">
                        <Sparkles className="h-5 w-5 text-success" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-success-foreground mb-1">
                              Save {savingsInfo.feeRateSavings.toFixed(0)}% on fees!
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {savingsInfo.amountNeeded > 50 ? (
                                <>Add <span className="font-semibold text-foreground">${savingsInfo.amountNeeded.toFixed(2)}</span> more to reach the <span className="font-medium">{savingsInfo.nextTier.label}</span> tier ({savingsInfo.nextFeeRate.toFixed(0)}% fee instead of {savingsInfo.currentFeeRate.toFixed(0)}%).</>
                              ) : (
                                <>Add just <span className="font-semibold text-foreground">${savingsInfo.amountNeeded.toFixed(2)}</span> more to reach the <span className="font-medium">{savingsInfo.nextTier.label}</span> tier ({savingsInfo.nextFeeRate.toFixed(0)}% fee instead of {savingsInfo.currentFeeRate.toFixed(0)}%).</>
                              )}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const newAmount = amountNum + savingsInfo.amountNeeded;
                              setAmount(newAmount.toFixed(2));
                              setAmountError(null);
                              
                              // Use the existing handleSave function to save with custom message
                              await handleSave({
                                amount: newAmount.toFixed(2),
                                customMessage: `Auto top-off amount updated to ${formatUsdCurrency(newAmount)} (${savingsInfo.nextTier.label} tier - ${savingsInfo.nextFeeRate.toFixed(0)}% fee)`
                              });
                            }}
                            disabled={isSaving}
                            className="ml-4 shrink-0 border-success/30 hover:bg-success/10"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <TrendingUp className="h-4 w-4 mr-1" />
                                Apply
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Alert>
                );
              })()}

              {enabled && threshold && amount && (
                <div className="p-3 bg-info/10 rounded-md border border-info/20">
                  <p className="text-sm text-info-foreground">
                    <strong>Summary:</strong> When your credit balance falls below{" "}
                    <strong>{formatUsdCurrency(parseFloat(threshold) || 0)}</strong>, we'll automatically add{" "}
                    <strong>{formatUsdCurrency(parseFloat(amount) || 0)}</strong> to your account using your default payment method.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-dashed">
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Auto Top-Off Disabled</h4>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Enable auto top-off to automatically add credits when your balance gets low. 
                    Never worry about running out of credits again.
                  </p>
                </div>
                <Button
                  onClick={() => setEnabled(true)}
                  disabled={isSaving}
                  className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Enable Auto Top-Off
                </Button>
              </div>
            </div>
          )}

          {enabled && (hasChanges() || threshold || amount) && (
            <div className="flex justify-end pt-4">
              <Button
                onClick={() => handleSave()}
                disabled={!hasChanges() || !isFormValid() || isSaving}
                className="min-w-[120px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}