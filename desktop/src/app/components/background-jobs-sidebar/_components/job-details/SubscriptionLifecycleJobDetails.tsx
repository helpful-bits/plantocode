"use client";

import { User, CreditCard, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Alert, AlertDescription } from '@/ui/alert';

interface SubscriptionLifecycleJobDetailsProps {
  payload: any;
  error?: string | null;
  status?: string;
  response?: string | null;
}

export function SubscriptionLifecycleJobDetails({ 
  payload, 
  error, 
  status, 
  response 
}: SubscriptionLifecycleJobDetailsProps) {
  // Parse the payload to extract subscription lifecycle details
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'change_plan':
        return 'Plan Change';
      case 'cancel':
        return 'Subscription Cancellation';
      case 'resume':
        return 'Subscription Resume';
      default:
        return 'Subscription Action';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'running':
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with action type and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">{getActionLabel(payload?.action || '')}</h3>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(status)}
          <Badge className={getStatusColor(status)}>
            {status || 'Unknown'}
          </Badge>
        </div>
      </div>

      {/* User and Action Details */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            <span className="font-medium">User ID:</span>
          </div>
          <div className="text-gray-600 pl-6">
            {payload?.user_id || 'Unknown'}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-gray-500" />
            <span className="font-medium">Action:</span>
          </div>
          <div className="text-gray-600 pl-6">
            {getActionLabel(payload?.action || '')}
          </div>
        </div>
      </div>

      {/* Plan Details (for plan changes) */}
      {payload?.action === 'change_plan' && payload?.new_plan_id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="font-medium text-blue-800 mb-2">Plan Change Details</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-blue-700 font-medium">New Plan:</span>
              <div className="text-blue-600">{payload.new_plan_id}</div>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Effective:</span>
              <div className="text-blue-600">
                {payload.effective_immediately ? 'Immediately' : 'Next billing cycle'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Details */}
      {payload?.action === 'cancel' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="font-medium text-orange-800 mb-2">Cancellation Details</div>
          <div className="text-sm">
            <span className="text-orange-700 font-medium">Timing:</span>
            <div className="text-orange-600">
              {payload.effective_immediately ? 'Immediate cancellation' : 'Cancel at period end'}
            </div>
          </div>
        </div>
      )}

      {/* Context Information */}
      {payload?.context && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="font-medium text-gray-800 mb-2">Additional Context</div>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
            {typeof payload.context === 'string' 
              ? payload.context 
              : JSON.stringify(payload.context, null, 2)
            }
          </pre>
        </div>
      )}

      {/* Response (if completed successfully) */}
      {status === 'completed' && response && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="font-medium text-green-800 mb-2">Success Response</div>
          <div className="text-sm text-green-700">
            {response}
          </div>
        </div>
      )}

      {/* Error Information (if failed) */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-1">Error Details:</div>
            <div className="text-sm">{error}</div>
          </AlertDescription>
        </Alert>
      )}

      {/* Processing Indicators */}
      {(status === 'running' || status === 'processing' || status === 'queued') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-blue-800">
            <Clock className="h-4 w-4 animate-pulse" />
            <span className="font-medium">
              {status === 'queued' ? 'Queued for processing...' : 'Processing subscription change...'}
            </span>
          </div>
          <div className="text-sm text-blue-600 mt-1">
            This operation may take a few moments to complete. You will be notified when it's finished.
          </div>
        </div>
      )}
    </div>
  );
}