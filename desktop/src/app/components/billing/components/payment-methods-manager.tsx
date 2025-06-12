"use client";

import { useState, useEffect } from "react";
import { 
  CreditCard,
  Plus,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Shield,
  Info,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { dispatchCacheInvalidation } from "@/utils/billing-cache";
import StripeProvider from "../stripe/StripeProvider";
import SetupElementForm from "../stripe/SetupElementForm";
import { 
  getEnhancedPaymentMethods,
  hasValidPaymentMethods,
  createSetupIntent,
  deletePaymentMethod,
  setDefaultPaymentMethod,
} from "@/actions/billing/payment-methods.actions";
import { openBillingPortal } from "@/actions/billing/portal.actions";
import type { PaymentMethod } from "@/types/tauri-commands";

export interface PaymentMethodsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentMethodsUpdated?: () => void;
}

interface EnhancedPaymentMethod extends PaymentMethod {
  displayName: string;
  displayNumber: string;
  displayExpiry: string;
  isExpired: boolean;
  expiresWithinMonths: number;
  needsAttention: boolean;
}

interface PaymentMethodStatus {
  hasAny: boolean;
  hasDefault: boolean;
  hasValid: boolean;
  expiredCount: number;
  expiringCount: number;
}

export function PaymentMethodsManager({ 
  isOpen, 
  onClose, 
  onPaymentMethodsUpdated 
}: PaymentMethodsManagerProps) {
  const [paymentMethods, setPaymentMethods] = useState<EnhancedPaymentMethod[]>([]);
  const [status, setStatus] = useState<PaymentMethodStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [setupIntent, setSetupIntent] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operatingIds, setOperatingIds] = useState<Set<string>>(new Set());

  const { showNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      loadPaymentMethods();
    }
  }, [isOpen]);

  const loadPaymentMethods = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [methods, statusInfo] = await Promise.all([
        getEnhancedPaymentMethods(),
        hasValidPaymentMethods()
      ]);
      
      setPaymentMethods(methods);
      setStatus(statusInfo);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to load payment methods:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    try {
      setIsAddingMethod(true);
      setError(null);
      
      const intent = await createSetupIntent();
      setSetupIntent({
        clientSecret: intent.clientSecret,
        publishableKey: intent.publishableKey
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      
      showNotification({
        title: "Setup Failed",
        message: errorMessage,
        type: "error",
      });
    }
  };

  const handleSetupSuccess = async (_setupIntentId: string) => {
    setIsAddingMethod(false);
    setSetupIntent(null);
    
    showNotification({
      title: "Payment Method Added",
      message: "Your payment method has been successfully added.",
      type: "success",
    });
    
    await loadPaymentMethods();
    onPaymentMethodsUpdated?.();
    
    // Dispatch cache invalidation to refresh payment method data immediately
    dispatchCacheInvalidation('PAYMENT_METHODS_UPDATED');
  };

  const handleSetupError = (error: string) => {
    setError(error);
    setIsAddingMethod(false);
    setSetupIntent(null);
    
    showNotification({
      title: "Setup Failed",
      message: error,
      type: "error",
    });
  };

  const handleSetDefault = async (paymentMethodId: string) => {
    try {
      setOperatingIds(prev => new Set(prev).add(paymentMethodId));
      
      await setDefaultPaymentMethod(paymentMethodId);
      
      showNotification({
        title: "Default Updated",
        message: "Payment method has been set as default.",
        type: "success",
      });
      
      await loadPaymentMethods();
      onPaymentMethodsUpdated?.();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Failed to Set Default",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setOperatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(paymentMethodId);
        return newSet;
      });
    }
  };

  const handleDelete = async (paymentMethodId: string) => {
    if (!confirm('Are you sure you want to delete this payment method? This action cannot be undone.')) {
      return;
    }

    try {
      setOperatingIds(prev => new Set(prev).add(paymentMethodId));
      
      await deletePaymentMethod(paymentMethodId);
      
      showNotification({
        title: "Payment Method Deleted",
        message: "Payment method has been successfully removed.",
        type: "success",
      });
      
      await loadPaymentMethods();
      onPaymentMethodsUpdated?.();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Failed to Delete",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setOperatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(paymentMethodId);
        return newSet;
      });
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      const portalUrl = await openBillingPortal();
      window.open(portalUrl, '_blank');
      
      showNotification({
        title: "Billing Portal Opened",
        message: "The Stripe billing portal has been opened in a new tab for advanced payment method management.",
        type: "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Portal Access Failed",
        message: errorMessage,
        type: "error",
      });
    }
  };

  const getExpiryColor = (method: EnhancedPaymentMethod) => {
    if (method.isExpired) return "text-red-600";
    if (method.expiresWithinMonths <= 2) return "text-orange-600";
    return "text-muted-foreground";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Methods
          </DialogTitle>
          <DialogDescription>
            View your payment methods and add new ones. For advanced management like setting default payment methods or removing existing ones, please use the Stripe billing portal.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}


        {/* Billing Portal Notice - Prominent */}
        <Alert className="border-blue-200 bg-blue-50">
          <ExternalLink className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Advanced Payment Management</AlertTitle>
          <AlertDescription className="text-blue-700">
            <div className="flex items-center justify-between">
              <span>
                For setting default payment methods, removing cards, or updating billing details, 
                use Stripe's secure billing portal.
              </span>
              <Button 
                onClick={handleOpenBillingPortal}
                className="ml-4 bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Billing Portal
              </Button>
            </div>
          </AlertDescription>
        </Alert>

        {/* Payment Method Status Summary */}
        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{paymentMethods.length}</div>
                <p className="text-sm text-muted-foreground">Total Methods</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">{status.hasValid ? '✓' : '✗'}</div>
                <p className="text-sm text-muted-foreground">Valid Methods</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-orange-600">{status.expiringCount}</div>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-red-600">{status.expiredCount}</div>
                <p className="text-sm text-muted-foreground">Expired</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Payment Methods List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Your Payment Methods</h3>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={loadPaymentMethods} 
                disabled={isLoading}
                className="transition-all duration-200 hover:scale-105"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                onClick={handleOpenBillingPortal}
                className="bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 hover:scale-105 hover:shadow-md"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Manage in Portal
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading payment methods...
            </div>
          ) : paymentMethods.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Payment Methods</h3>
                <p className="text-muted-foreground mb-4">
                  Add a payment method to enable subscription billing and credit purchases.
                </p>
                <Button 
                  onClick={handleAddPaymentMethod}
                  className="transition-all duration-200 hover:scale-105 hover:shadow-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payment Method
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <Card 
                  key={method.id} 
                  className={`transition-all duration-200 hover:shadow-md ${
                    method.needsAttention ? 'border-orange-200 bg-orange-50/30' : 'hover:scale-102'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-medium">
                          {method.brand?.toUpperCase() || method.typeName?.toUpperCase() || "CARD"}
                        </div>
                        <div>
                          <div className="font-medium">{method.displayNumber}</div>
                          <div className={`text-sm ${getExpiryColor(method)}`}>
                            Expires {method.displayExpiry}
                            {method.isExpired && " (Expired)"}
                            {!method.isExpired && method.expiresWithinMonths <= 2 && " (Expires Soon)"}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {method.isDefault && (
                          <Badge variant="secondary">
                            Default
                          </Badge>
                        )}
                        {method.isExpired && (
                          <Badge variant="destructive">
                            Expired
                          </Badge>
                        )}
                        {!method.isExpired && method.expiresWithinMonths <= 2 && (
                          <Badge variant="outline" className="border-orange-500 text-orange-600">
                            Expires Soon
                          </Badge>
                        )}
                        
                        {/* Action buttons */}
                        <div className="flex items-center gap-1 ml-2">
                          {!method.isDefault && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetDefault(method.id)}
                              disabled={operatingIds.has(method.id) || method.isExpired}
                              className="h-7 px-2 text-xs"
                            >
                              {operatingIds.has(method.id) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Star className="h-3 w-3 mr-1" />
                                  Set Default
                                </>
                              )}
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(method.id)}
                            disabled={operatingIds.has(method.id) || method.isDefault}
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {operatingIds.has(method.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {paymentMethods.length > 0 && (
                <div className="text-center text-sm text-muted-foreground py-2">
                  <Info className="h-4 w-4 inline mr-1" />
                  You can now set default and delete payment methods directly. Use the billing portal for advanced features.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Payment Method Section - Only show when there are existing methods */}
        {!isAddingMethod && !setupIntent && paymentMethods.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <CreditCard className="h-8 w-8 text-gray-400 mx-auto mb-3" />
              <h3 className="font-medium mb-2">Add New Payment Method</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Securely add a new payment method for subscriptions and credit purchases.
              </p>
              <Button 
                onClick={handleAddPaymentMethod} 
                disabled={isLoading}
                className="transition-all duration-200 hover:scale-105 hover:shadow-md"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Payment Method
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stripe Setup Form */}
        {setupIntent && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                Add Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StripeProvider>
                <SetupElementForm
                  clientSecret={setupIntent.clientSecret}
                  onSuccess={handleSetupSuccess}
                  onError={handleSetupError}
                  onCancel={() => {
                    setIsAddingMethod(false);
                    setSetupIntent(null);
                  }}
                />
              </StripeProvider>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="transition-all duration-200 hover:scale-105"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}