import { useState } from "react";
import { AlertCircle, CreditCard, Settings, Key, Wifi, Clock, Database, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { extractErrorInfo, createUserFriendlyErrorMessage, ErrorType } from "@/utils/error-handling";
import { WorkflowUtils } from "@/utils/workflow-utils";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsErrorSection() {
  const { job, parsedMetadata } = useJobDetailsContext();
  const [isTechnicalDetailsOpen, setIsTechnicalDetailsOpen] = useState(false);
  
  if (!job.errorMessage) {
    return null;
  }

  // Extract structured error information
  const errorInfo = extractErrorInfo(job.errorMessage);
  
  // Check for billing errors in metadata
  const isMetadataBillingError = parsedMetadata?.error_type === 'BILLING_ERROR' || 
    parsedMetadata?.billingError === true ||
    parsedMetadata?.subscription_required === true;
    
  // Check for billing errors in string content
  const isStringMatchBillingError = typeof job.errorMessage === 'string' && (
    job.errorMessage.toLowerCase().includes('subscription') ||
    job.errorMessage.toLowerCase().includes('billing') ||
    job.errorMessage.toLowerCase().includes('upgrade required') ||
    job.errorMessage.toLowerCase().includes('payment required')
  );
  
  // Prioritize structured error information from extractErrorInfo
  const isBillingError = errorInfo.type === ErrorType.BILLING_ERROR || isMetadataBillingError || isStringMatchBillingError;
  
  // Check for workflow errors
  const isWorkflowError = errorInfo.type === ErrorType.WORKFLOW_ERROR;
  const workflowContext = errorInfo.workflowContext;
  
  // Check for other specific error types
  const isPermissionError = errorInfo.type === ErrorType.PERMISSION_ERROR;
  const isNetworkError = errorInfo.type === ErrorType.NETWORK_ERROR;
  const isTimeoutError = errorInfo.type === ErrorType.TIMEOUT_ERROR;
  const isConfigError = errorInfo.type === ErrorType.CONFIGURATION_ERROR;
  const isDatabaseError = errorInfo.type === ErrorType.DATABASE_ERROR;
  const isApiError = errorInfo.type === ErrorType.API_ERROR;
  const isValidationError = errorInfo.type === ErrorType.VALIDATION_ERROR;
  
  // Get user-friendly error message using the enhanced utility
  const userFriendlyMessage = createUserFriendlyErrorMessage(errorInfo, "background job");
  const displayMessage = job.errorMessage || "An unknown error occurred";
  
  // Helper function to get error icon based on type
  const getErrorIcon = () => {
    if (isBillingError) return CreditCard;
    if (isPermissionError) return Key;
    if (isNetworkError) return Wifi;
    if (isTimeoutError) return Clock;
    if (isConfigError) return Settings;
    if (isDatabaseError) return Database;
    if (isWorkflowError) return RotateCcw;
    return AlertCircle;
  };
  
  const ErrorIcon = getErrorIcon();
  
  // Helper function to get error title based on type
  const getErrorTitle = () => {
    if (isBillingError) return "Billing Error";
    if (isPermissionError) return "Permission Error";
    if (isNetworkError) return "Network Error";
    if (isTimeoutError) return "Timeout Error";
    if (isConfigError) return "Configuration Error";
    if (isDatabaseError) return "Database Error";
    if (isWorkflowError) return "Workflow Error";
    if (isApiError) return "API Error";
    if (isValidationError) return "Validation Error";
    return "Error Information";
  };
  
  // Helper function to get error description based on type
  const getErrorDescription = () => {
    if (isBillingError) return "This error is related to your subscription or billing";
    if (isPermissionError) return "Access to this resource or feature was denied";
    if (isNetworkError) return "Network connectivity issue occurred";
    if (isTimeoutError) return "The operation took too long to complete";
    if (isConfigError) return "A configuration or settings issue was detected";
    if (isDatabaseError) return "A database operation failed";
    if (isApiError) return "An API service error occurred";
    if (isValidationError) return "Invalid input or data was provided";
    if (isWorkflowError && workflowContext?.stageName) {
      // Use WorkflowUtils for consistent stage name mapping across all formats
      const stageEnum = WorkflowUtils.mapStageNameToEnum(workflowContext.stageName);
      const stageDisplayName = stageEnum ? WorkflowUtils.getStageName(stageEnum) : workflowContext.stageName;
      return `Job failed during the "${stageDisplayName}" stage`;
    }
    return "Job execution failed with the following error";
  };
  

  return (
    <div className="mb-6">
      <Card className="border-destructive bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-destructive flex items-center gap-2">
            <ErrorIcon className="h-4 w-4" />
            {getErrorTitle()}
          </CardTitle>
          <CardDescription className="text-xs text-destructive/80">
            {getErrorDescription()}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Show workflow context if available */}
          {isWorkflowError && workflowContext && (
            <div className="mb-3 p-2 bg-muted/50 rounded text-xs">
              <div className="font-medium text-muted-foreground mb-1">Workflow Context:</div>
              {workflowContext.workflowId && (
                <div>Workflow ID: <span className="font-mono">{workflowContext.workflowId}</span></div>
              )}
              {workflowContext.stageName && (
                <div>Failed Stage: <span className="font-medium">
                  {(() => {
                    // Use WorkflowUtils for consistent stage name mapping across all formats
                    const stageEnum = WorkflowUtils.mapStageNameToEnum(workflowContext.stageName);
                    return stageEnum ? WorkflowUtils.getStageName(stageEnum) : workflowContext.stageName;
                  })()}
                </span></div>
              )}
              {workflowContext.retryAttempt && (
                <div>Retry Attempt: {workflowContext.retryAttempt}</div>
              )}
              {workflowContext.stageJobId && (
                <div>Stage Job ID: <span className="font-mono">{workflowContext.stageJobId}</span></div>
              )}
              {workflowContext.originalJobId && (
                <div>Original Job ID: <span className="font-mono">{workflowContext.originalJobId}</span></div>
              )}
            </div>
          )}
          
          {/* User-friendly error message */}
          <div className="mb-3 p-3 bg-muted/30 rounded text-sm text-muted-foreground">
            <div className="font-medium mb-1">Summary:</div>
            <div>{userFriendlyMessage}</div>
          </div>
          
          {/* Technical error details */}
          <Card>
            <Collapsible open={isTechnicalDetailsOpen} onOpenChange={setIsTechnicalDetailsOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-sm">Technical Details</CardTitle>
                      <CardDescription className="text-xs">
                        Raw error information for debugging
                      </CardDescription>
                    </div>
                    {isTechnicalDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <pre className="whitespace-pre-wrap text-balance text-xs text-destructive w-full p-2 bg-destructive/5 rounded border border-border/60">
                    {displayMessage}
                  </pre>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
          
          {isBillingError && (
            <div className="mt-4 p-3 bg-warning/10 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <CreditCard className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning-foreground mb-1">
                    Subscription Required
                  </p>
                  <p className="text-sm text-warning-foreground/90 mb-3">
                    {userFriendlyMessage}
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="default"
                      size="sm" 
                      onClick={() => window.location.pathname = '/settings'}
                      className="bg-warning text-warning-foreground hover:bg-warning/90"
                    >
                      View Billing
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm" 
                      onClick={() => window.location.pathname = '/account'}
                    >
                      Account Settings
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Error-type specific action cards */}
          {isPermissionError && !isBillingError && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <Key className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    Access Denied
                  </p>
                  <p className="text-sm text-amber-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                  <Button 
                    variant="outline"
                    size="sm" 
                    onClick={() => window.location.pathname = '/settings'}
                    className="border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Check Settings
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {isNetworkError && !isBillingError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <Wifi className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 mb-1">
                    Network Connection Failed
                  </p>
                  <p className="text-sm text-red-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isTimeoutError && !isBillingError && (
            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-800 mb-1">
                    Operation Timed Out
                  </p>
                  <p className="text-sm text-orange-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isConfigError && !isBillingError && (
            <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <Settings className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-800 mb-1">
                    Configuration Error
                  </p>
                  <p className="text-sm text-purple-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      size="sm" 
                      onClick={() => window.location.pathname = '/settings'}
                      className="border-purple-300 text-purple-700 hover:bg-purple-100"
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Settings
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {isDatabaseError && !isBillingError && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <Database className="h-4 w-4 text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 mb-1">
                    Database Error
                  </p>
                  <p className="text-sm text-gray-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isApiError && !isBillingError && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    API Service Error
                  </p>
                  <p className="text-sm text-blue-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isValidationError && !isBillingError && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-800 mb-1">
                    Invalid Input
                  </p>
                  <p className="text-sm text-yellow-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {isWorkflowError && !isBillingError && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <RotateCcw className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    Workflow Stage Failed
                  </p>
                  <p className="text-sm text-blue-700 mb-3">
                    {userFriendlyMessage}
                  </p>
                  {workflowContext?.retryAttempt && workflowContext.retryAttempt > 1 && (
                    <p className="text-xs text-blue-600 mb-2">
                      This stage has already been retried {workflowContext.retryAttempt - 1} time(s).
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
