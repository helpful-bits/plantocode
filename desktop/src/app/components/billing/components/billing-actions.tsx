"use client";

import { CreditCard, FileText, Settings } from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { openBillingPortal } from "@/actions/billing/portal.actions";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";

export function BillingActions() {
  const { showNotification } = useNotification();

  const handleOpenBillingPortal = async (actionType: string) => {
    try {
      const portalUrl = await openBillingPortal();
      window.open(portalUrl, '_blank');
      
      showNotification({
        title: "Billing Portal Opened",
        message: `${actionType} access is handled through Stripe's secure billing portal.`,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Billing Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            variant="default"
            onClick={() => handleOpenBillingPortal("Subscription management")}
            className="flex-1"
          >
            <Settings className="h-4 w-4 mr-2" />
            Manage Subscription & Plan
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => handleOpenBillingPortal("Billing history")}
            className="flex-1"
          >
            <FileText className="h-4 w-4 mr-2" />
            View Billing History
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => handleOpenBillingPortal("Payment methods")}
            className="flex-1"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Manage Payment Methods
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}