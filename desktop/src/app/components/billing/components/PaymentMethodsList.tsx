"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, Plus, Shield, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { LoadingSkeleton, ErrorState } from "./loading-and-error-states";
import { 
  getPaymentMethods, 
  openBillingPortal
} from "@/actions/billing/payment-method.actions";
import type { PaymentMethodsResponse } from "@/types/tauri-commands";
import { getErrorMessage } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { open } from "@/utils/shell-utils";
import { AddPaymentMethodModal } from "../billing-components";

export interface PaymentMethodsListProps {
  className?: string;
}

function getCardBrandIcon(brand: string): string {
  switch (brand.toLowerCase()) {
    case 'visa':
      return '💳';
    case 'mastercard':
      return '💳';
    case 'american_express':
    case 'amex':
      return '💳';
    case 'discover':
      return '💳';
    default:
      return '💳';
  }
}

function formatCardBrand(brand: string): string {
  switch (brand.toLowerCase()) {
    case 'american_express':
      return 'American Express';
    case 'mastercard':
      return 'Mastercard';
    case 'visa':
      return 'Visa';
    case 'discover':
      return 'Discover';
    default:
      return brand.charAt(0).toUpperCase() + brand.slice(1);
  }
}

export function PaymentMethodsList({ className }: PaymentMethodsListProps) {
  const [paymentMethodsData, setPaymentMethodsData] = useState<PaymentMethodsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  
  const { showNotification } = useNotification();

  const loadPaymentMethods = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await getPaymentMethods();
      setPaymentMethodsData(response);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to load payment methods:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  const handleRetry = () => {
    loadPaymentMethods();
  };

  const handleManagePaymentMethods = async () => {
    try {
      setIsManaging(true);
      const portalUrl = await openBillingPortal();
      await open(portalUrl);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: 'Failed to Open Billing Portal',
        message: errorMessage,
        type: 'error',
      });
      console.error('Failed to open billing portal:', err);
    } finally {
      setIsManaging(false);
    }
  };

  const handleAddNewCard = () => {
    setAddModalOpen(true);
  };


  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={handleRetry} />;
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManagePaymentMethods}
              disabled={isManaging}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              {isManaging ? 'Opening...' : 'Manage Payment Methods'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!paymentMethodsData || paymentMethodsData.methods.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Payment Methods</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add a payment method to manage your subscriptions and purchases.
              </p>
              <Button onClick={handleAddNewCard} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Your First Card
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {paymentMethodsData.methods.map((method) => (
                <div
                  key={method.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <span className="text-lg">
                          {getCardBrandIcon(method.card?.brand || 'card')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {method.card ? formatCardBrand(method.card.brand) : 'Payment Method'}
                        </span>
                        {method.isDefault && (
                          <Badge variant="default" className="flex items-center gap-1">
                            Default
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {method.card && (
                          <>
                            <span>•••• •••• •••• {method.card.last4}</span>
                            <span>
                              {method.card.expMonth.toString().padStart(2, '0')}/{method.card.expYear}
                            </span>
                          </>
                        )}
                        <div className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          <span>Secured</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddPaymentMethodModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onComplete={loadPaymentMethods}
      />
    </>
  );
}