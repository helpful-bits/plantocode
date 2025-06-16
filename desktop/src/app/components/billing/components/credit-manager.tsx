"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  CreditCard,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ShoppingCart,
  CheckCircle,
  Check,
  Star,
  ArrowLeft
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { getErrorMessage } from "@/utils/error-handling";
import { getCreditBalance, getCreditPacks, createCreditPurchaseIntent, type CreditPack } from "@/actions/billing/credit.actions";
import { 
  isValidCreditPackId, 
  validateRateLimit,
  sanitizeHtml 
} from '@/utils/validation-utils';
import { useNotification } from "@/contexts/notification-context";
import StripeProvider from '../stripe/StripeProvider';
import PaymentElementForm from '../stripe/PaymentElementForm';

interface PaymentIntentResponse {
  clientSecret: string;
  publishableKey: string;
  amount: number;
  currency: string;
  description: string;
}

export interface CreditManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreditManager = ({ 
  isOpen, 
  onClose
}: CreditManagerProps) => {
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("USD");
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  
  const [paymentFlow, setPaymentFlow] = useState<'selection' | 'payment'>('selection');
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntentResponse | null>(null);
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState<number | null>(null);
  
  const { showNotification } = useNotification();

  const loadCreditData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [balanceResult, packsResult] = await Promise.allSettled([
        getCreditBalance(),
        getCreditPacks()
      ]);
      
      if (balanceResult.status === 'fulfilled') {
        setBalance(balanceResult.value.balance);
        setCurrency(balanceResult.value.currency || 'USD');
      }
      
      if (packsResult.status === 'fulfilled' && packsResult.value && Array.isArray(packsResult.value)) {
        setCreditPacks(packsResult.value);
        const popularPack = packsResult.value.find(pack => pack.recommended);
        setSelectedPackId(popularPack?.id || packsResult.value[0]?.id || null);
      } else {
        console.error('Failed to load credit packs:', packsResult.status === 'rejected' ? packsResult.reason : 'Unknown error');
        setError('Unable to load credit packs. Please refresh to try again.');
        setCreditPacks([]); // Set empty array as fallback
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to load credit data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCreditData();
    }
  }, [isOpen, loadCreditData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const handleRefresh = () => {
    loadCreditData();
  };

  const handlePurchasePaymentIntent = async (pack: CreditPack) => {
    try {
      setIsPurchasing(true);
      setError(null);

      // Security validation
      const rateLimitCheck = validateRateLimit(lastRequestTime, 2000); // 2 second minimum interval
      if (!rateLimitCheck.isValid) {
        setError(rateLimitCheck.message || "Please wait before making another request");
        return;
      }

      const packIdValidation = isValidCreditPackId(pack.id);
      if (!packIdValidation.isValid) {
        setError(packIdValidation.message || "Invalid credit pack ID");
        return;
      }

      setLastRequestTime(Date.now());
      
      const response = await createCreditPurchaseIntent(pack.id, savePaymentMethod);
      
      setPaymentIntent({
        clientSecret: response.clientSecret,
        publishableKey: response.publishableKey,
        amount: response.amount,
        currency: response.currency,
        description: response.description,
      });
      setPaymentFlow('payment');
      
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: 'Payment Setup Failed',
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  // Handle successful payment
  const handlePaymentSuccess = (_paymentIntentId: string) => {
    showNotification({
      title: 'Purchase Successful',
      message: 'Your credits have been added to your account!',
      type: 'success',
    });
    
    setPaymentFlow('selection');
    setPaymentIntent(null);
    setError(null);
    loadCreditData(); // Refresh balance after purchase
  };

  // Handle payment error
  const handlePaymentError = (error: string) => {
    setError(error);
    showNotification({
      title: 'Payment Failed',
      message: error,
      type: 'error',
    });
  };

  // Go back to selection from payment
  const handleBackToSelection = () => {
    setPaymentFlow('selection');
    setPaymentIntent(null);
    setError(null);
  };

  const handlePurchase = () => {
    const selectedPack = creditPacks?.find(pack => pack.id === selectedPackId);
    if (selectedPack) {
      handlePurchasePaymentIntent(selectedPack);
    }
  };

  // Reset modal state when closing
  const handleClose = () => {
    setPaymentFlow('selection');
    setPaymentIntent(null);
    setError(null);
    onClose();
  };

  const selectedPack = creditPacks?.find(pack => pack.id === selectedPackId);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {paymentFlow === 'selection' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Credit Manager
              </DialogTitle>
              <DialogDescription>
                View your credit balance and purchase additional credits.
              </DialogDescription>
            </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading credit information...
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="transition-all duration-300 hover:shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-500" />
                  Current Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-3">
                  <div className="text-4xl font-bold text-blue-600 mb-2 transition-all duration-300">
                    {formatCurrency(balance)}
                  </div>
                  <p className="text-muted-foreground">
                    Available for AI service overages
                  </p>
                  {balance > 0 && (
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Credits Available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all duration-300 hover:shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-green-500" />
                  Purchase Additional Credits
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!creditPacks || creditPacks.length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Credit Packs Available</h3>
                    <p className="text-muted-foreground">
                      Credit purchasing is currently unavailable. Please try again later.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {creditPacks?.map((pack) => (
                        <Card 
                          key={pack.id} 
                          className={`cursor-pointer transition-all duration-300 border-2 relative hover:shadow-lg ${
                            selectedPackId === pack.id 
                              ? 'border-blue-500 bg-blue-50/50 shadow-lg scale-105 ring-2 ring-blue-200' 
                              : 'border-border hover:border-blue-300 hover:scale-102'
                          } ${pack.recommended ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}`}
                          onClick={() => setSelectedPackId(pack.id)}
                        >
                          {pack.recommended && (
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                              <Badge className="bg-yellow-500 text-yellow-900">
                                <Star className="h-3 w-3 mr-1" />
                                Recommended
                              </Badge>
                            </div>
                          )}
                          
                          <CardContent className="p-5">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-3">
                                  <h3 className="font-semibold text-lg">{sanitizeHtml(pack.name)}</h3>
                                </div>
                                <div className="space-y-2">
                                  <div className="text-center mb-3">
                                    <p className="text-2xl font-bold text-blue-600">
                                      {formatCurrency(pack.valueCredits)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">credits</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-lg font-semibold">
                                      {formatCurrency(pack.priceAmount)}
                                    </p>
                                    {pack.bonusPercentage && pack.bonusPercentage > 0 && (
                                      <p className="text-xs text-green-600 font-medium mt-1">
                                        +{pack.bonusPercentage}% bonus included!
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {selectedPackId === pack.id && (
                                <div className="absolute top-3 right-3">
                                  <div className="bg-blue-500 rounded-full p-1">
                                    <Check className="h-4 w-4 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

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
                                {formatCurrency(selectedPack.valueCredits)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Price:</span>
                              <span className="font-medium">
                                {formatCurrency(selectedPack.priceAmount)}
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
                                {formatCurrency(balance + selectedPack.valueCredits)}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="savePaymentMethod"
                        checked={savePaymentMethod}
                        onChange={(e) => setSavePaymentMethod(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <label htmlFor="savePaymentMethod" className="text-sm text-muted-foreground cursor-pointer">
                        Save payment method for future purchases
                      </label>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={handleClose} 
                    className="flex-1 transition-all duration-200 hover:scale-105"
                    disabled={isPurchasing}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handlePurchase}
                    disabled={!selectedPack || isPurchasing}
                    className="flex-1 transition-all duration-200 hover:scale-105 hover:shadow-md"
                  >
                    {isPurchasing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Continue to Payment
                      </>
                    )}
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground text-center pt-2">
                  <p>
                    Secure payment processed by Stripe. Credits are added to your account instantly.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

            <div className="flex justify-between pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={handleRefresh} 
                disabled={isLoading}
                className="transition-all duration-200 hover:scale-105"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                onClick={handleClose}
                className="transition-all duration-200 hover:scale-105"
              >
                Close
              </Button>
            </div>
          </>
        ) : (
          <StripeProvider>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToSelection}
                  className="flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to selection
                </Button>
              </div>

              {paymentIntent && selectedPack && (
                <PaymentElementForm
                  clientSecret={paymentIntent.clientSecret}
                  amount={paymentIntent.amount}
                  currency={paymentIntent.currency}
                  description={paymentIntent.description}
                  savePaymentMethod={savePaymentMethod}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                  onCancel={handleBackToSelection}
                />
              )}
            </div>
          </StripeProvider>
        )}
      </DialogContent>
    </Dialog>
  );
};