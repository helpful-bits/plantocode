"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { VisuallyHidden } from "@/ui/visually-hidden";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { Input } from "@/ui/input";
import { Loader2, CreditCard, AlertCircle, DollarSign } from "lucide-react";
import { invoke } from '@tauri-apps/api/core';
import { type BillingDashboardData } from '@/types/tauri-commands';
import { createCreditPurchaseCheckoutSession } from "@/actions/billing";
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

  const { showNotification } = useNotification();

  const PRESET_TIERS = [10, 25, 50];

  useEffect(() => {
    if (isOpen) {
      loadCreditDetails();
    }
  }, [isOpen]);

  const loadCreditDetails = async () => {
    try {
      setError(null);
      const billingData = await invoke<BillingDashboardData>('get_billing_dashboard_data_command');
      setBalance(billingData.creditBalanceUsd);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error("Failed to load credit details:", err);
    }
  };

  const calculateFee = (amount: number): { feeRate: number; feeAmount: number; netAmount: number } => {
    let feeRate: number;
    if (amount < 30) {
      feeRate = 0.20;
    } else if (amount < 300) {
      feeRate = 0.10;
    } else {
      feeRate = 0.05;
    }
    
    const feeAmount = amount * feeRate;
    const netAmount = amount - feeAmount;
    
    return { feeRate, feeAmount, netAmount };
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

            <Card>
              <CardHeader>
                <CardTitle>Select Amount to Purchase</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  {PRESET_TIERS.map((tier) => (
                    <Button
                      key={tier}
                      variant={selectedTier === tier ? "default" : "outline"}
                      size="lg"
                      onClick={() => handleTierSelect(tier)}
                      disabled={isLoading}
                      className="h-20 text-xl font-semibold"
                    >
                      ${tier}
                    </Button>
                  ))}
                  <Button
                    variant={showCustomInput ? "default" : "outline"}
                    size="lg"
                    onClick={handleOtherClick}
                    disabled={isLoading}
                    className="h-20 text-xl font-semibold"
                  >
                    Other
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

                {getCurrentAmount() !== null && (
                  <div role="status" className="bg-secondary/50 rounded-lg p-4 space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Transaction Summary</div>
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