"use client";

import { useState, useEffect } from "react";
import { 
  CreditCard, 
  Check, 
  Star,
  Loader2
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription } from "@/ui/alert";
import { invoke } from "@tauri-apps/api/core";
import { 
  type CreditPacksResponse, 
  type CreditPack,
  type CheckoutSessionResponse 
} from "@/types/tauri-commands";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance?: number;
  onPurchaseComplete?: () => void;
}

export function CreditPurchaseModal({ 
  isOpen, 
  onClose, 
  currentBalance = 0,
  onPurchaseComplete 
}: CreditPurchaseModalProps) {
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const fetchCreditPacks = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await invoke<CreditPacksResponse>('get_credit_packs_command');
      setCreditPacks(response.packs || []);
      
      // Auto-select the first pack or the popular one
      const packs = response.packs || [];
      const popularPack = packs.find(pack => pack.isPopular);
      setSelectedPackId(popularPack?.id || packs[0]?.id || null);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to fetch credit packs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (pack: CreditPack) => {
    try {
      setIsPurchasing(true);
      setError(null);
      
      const response = await invoke<CheckoutSessionResponse>('purchase_credits_command', {
        stripePriceId: pack.stripePriceId
      });
      
      // Open Stripe checkout using Tauri shell plugin
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(response.url);
      
      showNotification({
        title: 'Redirecting to Payment',
        message: `Opening Stripe checkout for ${pack.name} purchase.`,
        type: 'info',
      });
      
      // Close modal and call completion callback
      onClose();
      onPurchaseComplete?.();
      
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: 'Purchase Failed',
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCreditPacks();
    }
  }, [isOpen]);

  const selectedPack = creditPacks.find(pack => pack.id === selectedPackId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Purchase Extra Credits
          </DialogTitle>
          <DialogDescription>
            Choose a credit pack to extend your AI usage beyond your monthly allowance.
            {currentBalance > 0 && (
              <span className="block mt-1 text-sm">
                Current balance: {formatCurrency(currentBalance)}
              </span>
            )}
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
            Loading credit packs...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Credit Pack Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {creditPacks.map((pack) => (
                <Card 
                  key={pack.id} 
                  className={`cursor-pointer transition-all border-2 ${
                    selectedPackId === pack.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-border hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedPackId(pack.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{pack.name}</h3>
                          {pack.isPopular && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Popular
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-bold text-blue-600">
                            {formatCurrency(pack.valueCredits, pack.currency)} credits
                          </p>
                          <p className="text-sm text-muted-foreground">
                            for {formatCurrency(pack.priceAmount, pack.currency)}
                          </p>
                          {pack.bonusPercentage && pack.bonusPercentage > 0 && (
                            <p className="text-xs text-green-600 font-medium">
                              +{pack.bonusPercentage}% bonus included!
                            </p>
                          )}
                        </div>
                      </div>
                      {selectedPackId === pack.id && (
                        <Check className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Purchase Summary */}
            {selectedPack && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">Purchase Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Credit pack:</span>
                      <span className="font-medium">{selectedPack.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Credits:</span>
                      <span className="font-medium">
                        {formatCurrency(selectedPack.valueCredits, selectedPack.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Price:</span>
                      <span className="font-medium">
                        {formatCurrency(selectedPack.priceAmount, selectedPack.currency)}
                      </span>
                    </div>
                    {selectedPack.bonusPercentage && selectedPack.bonusPercentage > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Bonus:</span>
                        <span className="font-medium">+{selectedPack.bonusPercentage}%</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-medium">
                      <span>New balance after purchase:</span>
                      <span>
                        {formatCurrency(currentBalance + selectedPack.valueCredits, selectedPack.currency)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={onClose} 
                className="flex-1"
                disabled={isPurchasing}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => selectedPack && handlePurchase(selectedPack)}
                disabled={!selectedPack || isPurchasing}
                className="flex-1"
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Purchase Credits
                  </>
                )}
              </Button>
            </div>

            {/* Payment Info */}
            <div className="text-xs text-muted-foreground text-center pt-2">
              <p>
                Secure payment processed by Stripe. Credits are added to your account instantly.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}