"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { VisuallyHidden } from "@/ui/visually-hidden";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { Input } from "@/ui/input";
import { Loader2, CreditCard, AlertCircle, DollarSign } from "lucide-react";
import { getCreditDetails } from "@/actions/billing/credit.actions";
import { createCreditCheckoutSession } from "@/actions/billing/checkout.actions";
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
  const [purchaseAmount, setPurchaseAmount] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { showNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      loadCreditDetails();
    }
  }, [isOpen]);

  const loadCreditDetails = async () => {
    try {
      setError(null);
      const creditDetails = await getCreditDetails();
      setBalance(creditDetails.stats.currentBalance);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error("Failed to load credit details:", err);
    }
  };


  const handlePurchase = async () => {
    const amount = parseFloat(purchaseAmount);
    if (isNaN(amount) || amount < 1 || amount > 1000) {
      setError("Please enter a valid amount between $1 and $1000");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await createCreditCheckoutSession(amount);
      
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
    setPurchaseAmount("");
    setError(null);
    loadCreditDetails();
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
    setPurchaseAmount("");
    setError(null);
    onClose();
  };

  const handleQuickSelect = (amount: number) => {
    setPurchaseAmount(amount.toString());
    setError(null);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setPurchaseAmount(value);
      setError(null);
    }
  };

  const isValidAmount = () => {
    const amount = parseFloat(purchaseAmount);
    return !isNaN(amount) && amount >= 1 && amount <= 1000;
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
              <p className="text-muted-foreground">Purchase additional top-up credits separate from your monthly subscription allowance. These credits do not expire and are consumed as you use the service.</p>
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
                <CardTitle>Purchase Top-up Credits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="purchase-amount" className="block text-sm font-medium mb-2">
                      Enter amount to purchase
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="purchase-amount"
                        type="text"
                        placeholder="25.00"
                        value={purchaseAmount}
                        onChange={handleAmountChange}
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Minimum: $1.00, Maximum: $1,000.00
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-3">Quick select amounts:</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickSelect(10)}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        $10
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickSelect(25)}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        $25
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickSelect(50)}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        $50
                      </Button>
                    </div>
                  </div>
                </div>

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
                      Purchase ${parseFloat(purchaseAmount).toFixed(2)} in Credits
                    </>
                  ) : (
                    'Enter a valid amount to purchase'
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