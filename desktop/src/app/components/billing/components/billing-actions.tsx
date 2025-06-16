"use client";

import { Settings } from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { openBillingPortal } from "@/actions/billing/portal.actions";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { open } from "@/utils/shell-utils";

export function BillingActions() {
  const { showNotification } = useNotification();

  const handleOpenBillingPortal = async () => {
    try {
      const portalUrl = await openBillingPortal();
      await open(portalUrl);
      
      showNotification({
        title: "Billing Portal Opened",
        message: "All billing management is handled through Stripe's secure billing portal.",
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
        <Button 
          variant="default"
          onClick={handleOpenBillingPortal}
          className="w-full"
        >
          <Settings className="h-4 w-4 mr-2" />
          Manage Subscription & Invoices
        </Button>
      </CardContent>
    </Card>
  );
}