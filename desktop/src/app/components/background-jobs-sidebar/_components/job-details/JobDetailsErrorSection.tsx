import { AlertCircle } from "lucide-react";

import { Button } from "@/ui/button";
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
      <div className="p-5 bg-red-50 dark:bg-destructive/10 rounded-md mb-2">
        <h4 className="font-semibold mb-3 text-xs text-red-800 dark:text-red-400 uppercase flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Error Information
        </h4>
        <pre className="whitespace-pre-wrap text-balance text-sm text-red-800 dark:text-red-400 w-full">
          {job.errorMessage}
        </pre>
        {isBillingError && (
          <div className="mt-4">
            <p className="text-sm text-red-700 dark:text-red-300 mb-2">
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
      </div>
    </div>
  );
}
