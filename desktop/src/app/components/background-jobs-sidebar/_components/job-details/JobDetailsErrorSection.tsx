import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { AlertCircle, Server, Copy } from "lucide-react";
import { useJobDetailsContext } from "../../_contexts/job-details-context";
import { Button } from "@/ui/button";
import { useState } from "react";

export function JobDetailsErrorSection() {
  const { job } = useJobDetailsContext();
  const [copied, setCopied] = useState(false);
  
  // Return null if no error information exists
  if (!job.errorDetails && !job.errorMessage) {
    return null;
  }

  const handleCopyDetails = () => {
    if (job.errorDetails) {
      const detailsText = JSON.stringify(job.errorDetails, null, 2);
      navigator.clipboard.writeText(detailsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatErrorCode = (code: string) => {
    return code
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'openrouter': 'OpenRouter',
      'xai': 'xAI',
    };
    return labels[provider] || provider;
  };

  // If structured error details exist, display them
  if (job.errorDetails) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Error Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                {/* Main error information */}
                <div>
                  <div className="font-medium text-sm">
                    {formatErrorCode(job.errorDetails.code)}
                  </div>
                  <div className="text-sm mt-1">
                    {job.errorDetails.message}
                  </div>
                </div>

                {/* Provider-specific error information */}
                {job.errorDetails.providerError && (
                  <div className="mt-4 p-3 bg-background/50 rounded border">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {getProviderLabel(job.errorDetails.providerError.provider)} Error
                      </span>
                      {job.errorDetails.providerError.statusCode > 0 && (
                        <span className="text-xs bg-muted px-2 py-1 rounded">
                          {job.errorDetails.providerError.statusCode}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <span className="ml-1 font-mono">{job.errorDetails.providerError.errorType}</span>
                      </div>
                      
                      {/* Error context information */}
                      {job.errorDetails.providerError.context && (
                        <div className="pt-2 border-t">
                          {job.errorDetails.providerError.context.requestedTokens && 
                           job.errorDetails.providerError.context.modelLimit && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Token Usage:</span>
                              <span className="font-mono text-destructive">
                                {job.errorDetails.providerError.context.requestedTokens.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground">/</span>
                              <span className="font-mono">
                                {job.errorDetails.providerError.context.modelLimit.toLocaleString()}
                              </span>
                              <span className="text-xs">
                                ({Math.round((job.errorDetails.providerError.context.requestedTokens / job.errorDetails.providerError.context.modelLimit) * 100)}% of limit)
                              </span>
                            </div>
                          )}
                          
                          {job.errorDetails.providerError.context.additionalInfo && (
                            <div className="mt-1">
                              <span className="text-muted-foreground">Additional Info:</span>
                              <span className="ml-1">{job.errorDetails.providerError.context.additionalInfo}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Provider error details */}
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-muted-foreground">Provider Details:</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={handleCopyDetails}
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            {copied ? 'Copied!' : 'Copy'}
                          </Button>
                        </div>
                        <pre className="p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                          {job.errorDetails.providerError.details}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fallback indicator */}
                {job.errorDetails.fallbackAttempted && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-3 h-3" />
                    <span>A fallback to another provider was attempted</span>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Fallback to plain error message display
  if (job.errorMessage) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Error Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm">
                {job.errorMessage}
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return null;
}