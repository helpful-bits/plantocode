import { AlertCircle, CreditCard, Settings, Key, Wifi, Clock, Database, RotateCcw } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { extractErrorInfo, createUserFriendlyErrorMessage, ErrorType } from "@/utils/error-handling";
import { WorkflowUtils } from "@/utils/workflow-utils";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsErrorSection() {
  const { job, parsedMetadata } = useJobDetailsContext();
  
  if (!job.errorMessage) {
    return null;
  }

  // Extract structured error information
  const errorInfo = extractErrorInfo(job.errorMessage);
  
  // Check for billing errors in metadata
  const isMetadataBillingError = parsedMetadata?.error_type === 'BILLING_ERROR' || 
    parsedMetadata?.billingError === true ||
    parsedMetadata?.payment_required === true;
    
  // Check for billing errors in string content
  const isStringMatchBillingError = typeof job.errorMessage === 'string' && (
    job.errorMessage.toLowerCase().includes('billing') ||
    job.errorMessage.toLowerCase().includes('credits') ||
    job.errorMessage.toLowerCase().includes('upgrade required') ||
    job.errorMessage.toLowerCase().includes('payment required')
  );
  
  // Prioritize structured error information from extractErrorInfo
  const isBillingError = errorInfo.type === ErrorType.PAYMENT_FAILED || 
    errorInfo.type === ErrorType.CREDIT_UPGRADE_REQUIRED || 
    errorInfo.type === ErrorType.CREDIT_INSUFFICIENT ||
    errorInfo.type === ErrorType.CREDIT_EXPIRED ||
    isMetadataBillingError || 
    isStringMatchBillingError;
  
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
    if (isBillingError) return "This error is related to your billing or credits";
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
          
          {isBillingError && (
            <div className="mt-4 p-4 bg-info/10 border-2 border-info/20 rounded-lg">
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-info mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-info-foreground mb-2">
                    {errorInfo.type === ErrorType.CREDIT_INSUFFICIENT 
                      ? 'Insufficient Credits' 
                      : errorInfo.type === ErrorType.CREDIT_UPGRADE_REQUIRED 
                        ? 'Plan Upgrade Required'
                        : 'Billing Action Required'
                    }
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button 
                      variant="default"
                      size="sm" 
                      onClick={() => window.location.pathname = '/account'}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Manage Billing
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
            <div className="mt-4 p-3 bg-info/10 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-info-foreground mb-1">
                    API Service Error
                  </p>
                  <p className="text-sm text-info-foreground/80 mb-3">
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
            <div className="mt-4 p-3 bg-info/10 border border-border/60 rounded">
              <div className="flex items-start gap-2">
                <RotateCcw className="h-4 w-4 text-info mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-info-foreground mb-1">
                    Workflow Stage Failed
                  </p>
                  <p className="text-sm text-info-foreground/80 mb-3">
                    {userFriendlyMessage}
                  </p>
                  {workflowContext?.retryAttempt && workflowContext.retryAttempt > 1 && (
                    <p className="text-xs text-info/80 mb-2">
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
