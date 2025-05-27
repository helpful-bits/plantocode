import { AlertCircle } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { type BackgroundJob } from "@/types/session-types";

interface JobDetailsErrorSectionProps {
  job: BackgroundJob;
}

export function JobDetailsErrorSection({ job }: JobDetailsErrorSectionProps) {
  if (!job.errorMessage) {
    return null;
  }

  const errorMessageLower = job.errorMessage?.toLowerCase() || "";
  const isBillingError = job.errorMessage && 
    (errorMessageLower.includes("not available on your current plan") || 
     errorMessageLower.includes("payment required") || 
     errorMessageLower.includes("billing error") || 
     errorMessageLower.includes("upgrade required") ||
     errorMessageLower.includes("subscription plan"));

  return (
    <div className="mb-6">
      <Card className="border-destructive bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Error Information
          </CardTitle>
          <CardDescription className="text-xs text-destructive/80">
            Job execution failed with the following error
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <pre className="whitespace-pre-wrap text-balance text-sm text-destructive w-full">
            {job.errorMessage}
          </pre>
          {isBillingError && (
            <div className="mt-4">
              <p className="text-sm text-destructive/90 mb-2">
                This error appears to be related to your subscription plan. Please consider upgrading to access this feature or model.
              </p>
              <Button 
                variant="default"
                size="sm" 
                onClick={() => window.location.pathname = '/settings'}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                View Subscription
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
