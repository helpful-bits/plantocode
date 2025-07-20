import React from 'react';
import { ErrorDetails } from '@/types/error-details';
import { AlertCircle, ChevronDown, ChevronRight, Copy, Server } from 'lucide-react';
import { Button } from '@/ui/button';
import { cn } from '@/utils/utils';

interface ErrorDetailsDisplayProps {
  error: ErrorDetails;
  className?: string;
  showFullDetails?: boolean;
}

export function ErrorDetailsDisplay({ 
  error, 
  className,
  showFullDetails = false 
}: ErrorDetailsDisplayProps) {
  const [isExpanded, setIsExpanded] = React.useState(showFullDetails);
  const [copied, setCopied] = React.useState(false);

  const handleCopyDetails = () => {
    const detailsText = JSON.stringify(error, null, 2);
    navigator.clipboard.writeText(detailsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getErrorCodeLabel = (code: string) => {
    const labels: Record<string, string> = {
      'context_length_exceeded': 'Context Length Exceeded',
      'rate_limit_exceeded': 'Rate Limit Exceeded',
      'authentication_failed': 'Authentication Failed',
      'external_service_error': 'External Service Error',
      'bad_request': 'Bad Request',
      'internal_error': 'Internal Error',
    };
    return labels[code] || code;
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

  return (
    <div className={cn("space-y-2", className)}>
      {/* Main Error Message */}
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">
            {getErrorCodeLabel(error.code)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {error.message}
          </p>
        </div>
      </div>

      {/* Provider Error Details */}
      {error.providerError && (
        <div className="mt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Server className="w-3 h-3" />
            <span>
              {getProviderLabel(error.providerError.provider)} Error Details
              {error.providerError.statusCode > 0 && (
                <span className="ml-1 text-xs">({error.providerError.statusCode})</span>
              )}
            </span>
          </button>

          {isExpanded && (
            <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border">
              <div className="space-y-2 text-xs">
                {/* Status and Type */}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {error.providerError.statusCode > 0 && (
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className="ml-1 font-mono">{error.providerError.statusCode}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="ml-1 font-mono">{error.providerError.errorType}</span>
                  </div>
                </div>

                {/* Context Information */}
                {error.providerError.context && (
                  <div className="pt-2 border-t border-border">
                    {error.providerError.context.modelLimit && error.providerError.context.requestedTokens && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Token Usage:</span>
                        <span className="font-mono text-destructive">
                          {error.providerError.context.requestedTokens.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="font-mono">
                          {error.providerError.context.modelLimit.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({Math.round((error.providerError.context.requestedTokens / error.providerError.context.modelLimit) * 100)}% of limit)
                        </span>
                      </div>
                    )}
                    {error.providerError.context.additionalInfo && (
                      <div className="mt-1">
                        <span className="text-muted-foreground">Additional Info:</span>
                        <span className="ml-1">{error.providerError.context.additionalInfo}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Full Error Details */}
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">Full Details:</span>
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
                  <pre className="p-2 bg-background rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {error.providerError.details}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fallback Indicator */}
      {error.fallbackAttempted && (
        <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
          <AlertCircle className="w-3 h-3" />
          <span>A fallback to another provider was attempted</span>
        </div>
      )}
    </div>
  );
}