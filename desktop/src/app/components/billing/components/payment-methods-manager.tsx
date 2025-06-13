"use client";

import { useState, useEffect } from "react";
import { 
  CreditCard,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Info,
  RefreshCw,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { 
  getEnhancedPaymentMethods,
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
  onClose 
}: PaymentMethodsManagerProps) {
  const [paymentMethods, setPaymentMethods] = useState<EnhancedPaymentMethod[]>([]);
  const [status, setStatus] = useState<PaymentMethodStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      
      const methods = await getEnhancedPaymentMethods();
      const statusInfo = {
        hasAny: methods.length > 0,
        hasDefault: methods.some(pm => pm.isDefault),
        hasValid: methods.some(pm => !pm.isExpired),
        expiredCount: methods.filter(pm => pm.isExpired).length,
        expiringCount: methods.filter(pm => !pm.isExpired && pm.expiresWithinMonths <= 2).length,
      };
      
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
            View, add, and manage your payment methods. Set a default for your subscription and remove cards you no longer use.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}



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
                  onClick={handleOpenBillingPortal}
                  className="transition-all duration-200 hover:scale-105 hover:shadow-md"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage Payment Methods
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <Card 
                  key={method.id} 
                  className={`transition-all duration-200 ${
                    method.needsAttention ? 'border-orange-200 bg-orange-50/30' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-medium">
                          {method.card?.brand?.toUpperCase() || method.type_?.toUpperCase() || "CARD"}
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
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {paymentMethods.length > 0 && (
                <div className="text-center py-4">
                  <Button 
                    onClick={handleOpenBillingPortal}
                    className="bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 hover:scale-105 hover:shadow-md"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Manage Payment Methods
                  </Button>
                  <div className="text-center text-sm text-muted-foreground py-2 mt-2">
                    <Info className="h-4 w-4 inline mr-1" />
                    Use the Stripe billing portal to add, edit, delete, and set default payment methods.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>


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