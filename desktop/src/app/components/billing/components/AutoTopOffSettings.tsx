"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/ui/switch";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Label } from "@/ui/label";
import { Alert, AlertDescription } from "@/ui/alert";
import { Loader2, DollarSign, Zap, Info } from "lucide-react";
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
  const [suggestedAmount, setSuggestedAmount] = useState<number | null>(null);
  
  const { showNotification } = useNotification();

  // Load current settings and fee tiers
  useEffect(() => {
    loadSettings();
    loadFeeTiers();
  }, []);

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

  const calculateOptimalAmount = (currentAmount: number): number | null => {
    if (!feeTiers) return null;
    
    const currentTier = getCurrentFeeTier(currentAmount);
    if (!currentTier) return null;
    
    // Find the STARTER tier (20% fee)
    const starterTier = feeTiers.tiers.find(tier => tier.label === "STARTER");
    if (!starterTier || currentTier !== starterTier) return null;
    
    // Find the SAVER tier (10% fee)
    const saverTier = feeTiers.tiers.find(tier => tier.label === "SAVER");
    if (!saverTier) return null;
    
    // Return the minimum amount for SAVER tier
    return saverTier.min;
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Validate form if enabled
      if (enabled) {
        const thresholdNum = parseFloat(threshold);
        const amountNum = parseFloat(amount);

        if (!threshold || isNaN(thresholdNum) || thresholdNum <= 0 || thresholdNum > 1000) {
          setError("Auto top-off threshold must be between $0.01 and $1000.00");
          return;
        }

        if (!amount || isNaN(amountNum) || amountNum <= 0 || amountNum > 1000) {
          setError("Auto top-off amount must be between $0.01 and $1000.00");
          return;
        }
      }

      const updateRequest: UpdateAutoTopOffRequest = {
        enabled,
        threshold: enabled && threshold ? threshold : undefined,
        amount: enabled && amount ? amount : undefined,
      };

      const updatedSettings = await updateAutoTopOffSettings(updateRequest);
      setSettings(updatedSettings);

      showNotification({
        type: "success",
        title: "Auto Top-Off Settings Updated",
        message: enabled 
          ? `Auto top-off enabled: ${formatUsdCurrency(parseFloat(updatedSettings.amount || "0"))} when balance falls below ${formatUsdCurrency(parseFloat(updatedSettings.threshold || "0"))}`
          : "Auto top-off has been disabled",
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update auto top-off settings";
      setError(errorMessage);
      console.error("Failed to update auto top-off settings:", err);
      
      showNotification({
        type: "error",
        title: "Update Failed",
        message: errorMessage,
      });
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
          {enabled && (
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
                    try {
                      setIsSaving(true);
                      const updateRequest: UpdateAutoTopOffRequest = {
                        enabled: false,
                        threshold: undefined,
                        amount: undefined,
                      };
                      const updatedSettings = await updateAutoTopOffSettings(updateRequest);
                      setSettings(updatedSettings);
                      
                      showNotification({
                        type: "success",
                        title: "Settings Updated",
                        message: "Auto top-off has been disabled",
                      });
                      
                      // Trigger billing data refresh to update current balance
                      window.dispatchEvent(new CustomEvent('billing-data-updated'));
                    } catch (err) {
                      const errorMessage = err instanceof Error ? err.message : "Failed to update auto top-off settings";
                      setError(errorMessage);
                      setEnabled(!newEnabled); // Revert on error
                      
                      showNotification({
                        type: "error",
                        title: "Update Failed",
                        message: errorMessage,
                      });
                    } finally {
                      setIsSaving(false);
                    }
                  }
                }}
                disabled={isSaving}
                className="[&[data-state=unchecked]]:bg-muted [&[data-state=unchecked]]:border-border/50 [&[data-state=unchecked]:hover]:bg-muted/80"
              />
            </div>
          )}

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
                        setAmount(e.target.value);
                        const numAmount = parseFloat(e.target.value);
                        if (!isNaN(numAmount) && numAmount > 0) {
                          const optimal = calculateOptimalAmount(numAmount);
                          setSuggestedAmount(optimal);
                        } else {
                          setSuggestedAmount(null);
                        }
                      }}
                      className="pl-10"
                      disabled={isSaving}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Amount to add to your account automatically
                  </p>
                  {amount && feeTiers && (() => {
                    const amountNum = parseFloat(amount);
                    if (isNaN(amountNum) || amountNum <= 0) return null;
                    
                    const currentTier = getCurrentFeeTier(amountNum);
                    if (!currentTier) return null;
                    
                    const tierColor = currentTier.label === "STARTER" ? "text-orange-600" : 
                                     currentTier.label === "SAVER" ? "text-blue-600" : 
                                     currentTier.label === "SMART" ? "text-green-600" : 
                                     "text-purple-600";
                    
                    return (
                      <p className={`text-xs font-medium ${tierColor} mt-1`}>
                        {currentTier.label} tier - {(currentTier.feeRate * 100).toFixed(0)}% fee
                      </p>
                    );
                  })()}
                </div>
              </div>

              {suggestedAmount && (
                <Alert className="border-info/20 bg-info/10">
                  <Info className="h-4 w-4 text-info" />
                  <AlertDescription className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Save on fees with a higher amount</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Top off with {formatUsdCurrency(suggestedAmount)} to get a 10% fee instead of 20%.
                        You'll save {formatUsdCurrency((parseFloat(amount) * 0.2) - (suggestedAmount * 0.1))} in fees per top-off.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAmount(suggestedAmount.toFixed(2));
                        setSuggestedAmount(null);
                      }}
                      className="ml-4 shrink-0"
                    >
                      Apply
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {enabled && threshold && amount && (
                <div className="p-3 bg-info/10 rounded-md border border-info/20 space-y-2">
                  <p className="text-sm text-info-foreground">
                    <strong>Summary:</strong> When your credit balance falls below{" "}
                    <strong>{formatUsdCurrency(parseFloat(threshold) || 0)}</strong>, we'll automatically add{" "}
                    <strong>{formatUsdCurrency(parseFloat(amount) || 0)}</strong> to your account using your default payment method.
                  </p>
                  {feeTiers && (() => {
                    const currentTier = getCurrentFeeTier(parseFloat(amount));
                    if (currentTier) {
                      return (
                        <p className="text-xs text-muted-foreground">
                          Fee tier: <span className="font-medium">{currentTier.label}</span> ({(currentTier.feeRate * 100).toFixed(0)}% fee)
                        </p>
                      );
                    }
                    return null;
                  })()}
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
                onClick={handleSave}
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