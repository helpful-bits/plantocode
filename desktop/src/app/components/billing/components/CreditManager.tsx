"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { VisuallyHidden } from "@/ui/visually-hidden";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Loader2, CreditCard, AlertCircle, Star } from "lucide-react";
import { getCreditDetails, getCreditPacks, type CreditPack } from "@/actions/billing/credit.actions";
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
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingPacks, setIsLoadingPacks] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { showNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      loadCreditDetails();
      loadCreditPacks();
    }
  }, [isOpen]);

  const loadCreditDetails = async () => {
    try {
      setError(null);
      const creditDetails = await getCreditDetails();
      setBalance(creditDetails.balance);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error("Failed to load credit details:", err);
    }
  };

  const loadCreditPacks = async () => {
    try {
      setIsLoadingPacks(true);
      setError(null);
      const packs = await getCreditPacks();
      const sortedPacks = packs
        .filter(pack => pack.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      setCreditPacks(sortedPacks);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error("Failed to load credit packs:", err);
    } finally {
      setIsLoadingPacks(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackId) {
      setError("Please select a credit pack");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await createCreditCheckoutSession(selectedPackId);
      
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
    setSelectedPackId(null);
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
    setSelectedPackId(null);
    setError(null);
    onClose();
  };

  const selectedPack = creditPacks.find(pack => pack.id === selectedPackId);

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
              <p className="text-muted-foreground">Add supplementary credits that are applied after your monthly subscription allowance has been exhausted. These are for one-time use.</p>
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
                <CardTitle>Select Top-up Credit Pack</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingPacks ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Loading credit packs...</span>
                  </div>
                ) : creditPacks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No top-up credit packs available
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {creditPacks.map((pack) => (
                      <Button
                        key={pack.id}
                        variant={selectedPackId === pack.id ? "default" : "outline"}
                        onClick={() => setSelectedPackId(pack.id)}
                        className="h-auto p-4 flex flex-col items-start justify-start text-left relative"
                      >
                        {pack.isPopular && (
                          <Badge className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs">
                            <Star className="h-3 w-3 mr-1" />
                            Popular
                          </Badge>
                        )}
                        <div className="text-lg font-bold">
                          ${pack.priceAmount.toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {pack.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ${pack.valueCredits.toFixed(2)} in credits
                        </div>
                        {pack.bonusPercentage && pack.bonusPercentage > 0 && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            +{pack.bonusPercentage}% bonus
                          </Badge>
                        )}
                      </Button>
                    ))}
                  </div>
                )}

                <Button 
                  onClick={handlePurchase}
                  disabled={!selectedPackId || isLoading || isLoadingPacks}
                  className="w-full h-12 text-lg font-medium"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : selectedPack ? (
                    <>
                      Purchase {selectedPack.name} - ${selectedPack.priceAmount.toFixed(2)}
                    </>
                  ) : (
                    'Select a top-up credit pack'
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