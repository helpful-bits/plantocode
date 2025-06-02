import React from 'react';
import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  Play,
  Settings,
} from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Progress } from '@/ui/progress';
import { Card } from '@/ui/card';
import { type WorkflowStatusResponse } from '@/types/workflow-types';
import { extractErrorInfo, createUserFriendlyErrorMessage } from '@/utils/error-handling';

export interface WorkflowCardProps {
  workflow: WorkflowStatusResponse;
  onCancel?: (workflowId: string) => Promise<void>;
  onViewDetails?: (workflow: WorkflowStatusResponse) => void;
  onRetryStage?: (workflowId: string, stageJobId: string) => void;
  isCancelling?: boolean;
}

function getStatusIcon(status: string, className?: string) {
  switch (status.toLowerCase()) {
    case 'completed':
      return <CheckCircle className={`w-4 h-4 text-green-500 ${className}`} />;
    case 'failed':
      return <AlertCircle className={`w-4 h-4 text-red-500 ${className}`} />;
    case 'running':
      return <Loader2 className={`w-4 h-4 text-blue-500 animate-spin ${className}`} />;
    case 'canceled':
    case 'cancelled':
      return <XCircle className={`w-4 h-4 text-gray-500 ${className}`} />;
    default:
      return <Clock className={`w-4 h-4 text-yellow-500 ${className}`} />;
  }
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'running':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'canceled':
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  }
}

function formatTimeAgo(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}m ago`;
    } else {
      return 'Just now';
    }
  } catch {
    return 'Unknown';
  }
}

function getEarliestStartTime(workflow: WorkflowStatusResponse): string | null {
  const startTimes = workflow.stageStatuses
    .filter(stage => stage.startedAt)
    .map(stage => stage.startedAt!)
    .sort();
  
  return startTimes.length > 0 ? startTimes[0] : null;
}

export const WorkflowCard = React.memo(({
  workflow,
  onCancel,
  onViewDetails,
  onRetryStage,
  isCancelling = false,
}: WorkflowCardProps) => {
  const isActive = ['running', 'created'].includes(workflow.status.toLowerCase());
  const canCancel = isActive && onCancel && !isCancelling;
  const startTime = getEarliestStartTime(workflow);

  // Count stages by status with comprehensive status interpretation
  const stageCounts = workflow.stageStatuses.reduce(
    (acc, stage) => {
      const status = stage.status.toLowerCase();
      if (status === 'completed' || status === 'completed_by_tag') {
        acc.completed++;
      } else if (status === 'failed') {
        acc.failed++;
      } else if ([
        'running', 
        'processing', 
        'preparing', 
        'preparing_input', 
        'generating_stream', 
        'processing_stream', 
        'acknowledged_by_worker'
      ].includes(status)) {
        acc.running++;
      } else if ([
        'idle',
        'created',
        'queued'
      ].includes(status)) {
        acc.pending++;
      } else {
        // Handle unknown statuses as pending
        console.warn(`Unknown stage status: ${status}`);
        acc.pending++;
      }
      return acc;
    },
    { completed: 0, failed: 0, running: 0, pending: 0 }
  );

  const totalStages = workflow.stageStatuses.length;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {getStatusIcon(workflow.status)}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                Workflow {workflow.workflowId.slice(-8)}
              </h3>
              <Badge 
                variant="outline" 
                className={`text-xs ${getStatusColor(workflow.status)}`}
              >
                {workflow.status}
              </Badge>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{Math.round(workflow.progressPercentage || 0)}%</span>
              </div>
              <Progress 
                value={workflow.progressPercentage || 0} 
                className="h-2"
              />
            </div>

            <div className="text-xs text-gray-600 mb-2">
              <div className="font-medium mb-1 flex items-center justify-between">
                <span>Current: {workflow.currentStage || 'Starting...'}</span>
                <span className="text-gray-500">
                  Stage {Math.min(stageCounts.completed + stageCounts.running + stageCounts.failed, totalStages)}/{totalStages}
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-green-600 flex items-center">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {stageCounts.completed}
                </span>
                {stageCounts.running > 0 && (
                  <span className="text-blue-600 flex items-center">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {stageCounts.running}
                  </span>
                )}
                {stageCounts.failed > 0 && (
                  <span className="text-red-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {stageCounts.failed}
                  </span>
                )}
                {stageCounts.pending > 0 && (
                  <span className="text-gray-500 flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {stageCounts.pending}
                  </span>
                )}
              </div>
            </div>

            {startTime && (
              <div className="text-xs text-gray-500">
                Started {formatTimeAgo(startTime)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1 ml-2">
          {onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(workflow)}
              className="h-8 w-8 p-0"
              title="View Details"
            >
              <Settings className="h-3 w-3" />
            </Button>
          )}

          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(workflow.workflowId)}
              disabled={isCancelling}
              className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
              title="Cancel Workflow"
            >
              {isCancelling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Enhanced failure indicator and retry functionality */}
      {stageCounts.failed > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-red-600 font-medium flex items-center">
              <AlertCircle className="w-3 h-3 mr-1" />
              {stageCounts.failed} stage{stageCounts.failed > 1 ? 's' : ''} failed
            </div>
            {workflow.errorMessage && (() => {
              const errorInfo = extractErrorInfo(workflow.errorMessage);
              const displayMessage = errorInfo.workflowContext?.stageName 
                ? createUserFriendlyErrorMessage(errorInfo)
                : workflow.errorMessage;
              return (
                <div className="text-xs text-gray-500 truncate max-w-32" title={displayMessage}>
                  {displayMessage.length > 30 ? `${displayMessage.substring(0, 30)}...` : displayMessage}
                </div>
              );
            })()}
          </div>
          
          {onRetryStage && (
            <div className="space-y-1">
              <div className="text-xs text-gray-600 mb-2">Retryable stages:</div>
              <div className="flex flex-wrap gap-1">
                {workflow.stageStatuses
                  .filter(stage => stage.status.toLowerCase() === 'failed' && stage.jobId)
                  .map(stage => (
                    <Button
                      key={stage.stageName}
                      variant="outline"
                      size="sm"
                      onClick={() => stage.jobId && onRetryStage(workflow.workflowId, stage.jobId)}
                      className="h-6 px-2 py-0 text-xs border-red-200 text-red-700 hover:bg-red-50"
                      disabled={!stage.jobId}
                      title={(() => {
                        if (stage.errorMessage) {
                          const errorInfo = extractErrorInfo(stage.errorMessage);
                          return errorInfo.workflowContext?.stageName 
                            ? createUserFriendlyErrorMessage(errorInfo)
                            : stage.errorMessage;
                        }
                        return `Retry ${stage.stageName}`;
                      })()}
                    >
                      <Play className="h-2 w-2 mr-1" />
                      {stage.stageName.replace(/_/g, ' ').split(' ').slice(-2).join(' ')}
                    </Button>
                  ))
                }
              </div>
              
              {/* Show stages without jobId as non-retryable */}
              {workflow.stageStatuses
                .filter(stage => stage.status.toLowerCase() === 'failed' && !stage.jobId)
                .length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Cannot retry individually:</div>
                  <div className="flex flex-wrap gap-1">
                    {workflow.stageStatuses
                      .filter(stage => stage.status.toLowerCase() === 'failed' && !stage.jobId)
                      .map(stage => (
                        <Badge 
                          key={stage.stageName} 
                          variant="outline" 
                          className="text-xs text-gray-500 border-gray-300"
                        >
                          {stage.stageName.replace(/_/g, ' ').split(' ').slice(-2).join(' ')}
                        </Badge>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Stage progress indicator for running workflows */}
      {isActive && stageCounts.completed > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-600 mb-2">Stage progress:</div>
          <div className="flex space-x-1">
            {workflow.stageStatuses.slice(0, 7).map((stage) => {
              const stageStatus = stage.status.toLowerCase();
              const isCompleted = stageStatus === 'completed' || stageStatus === 'completed_by_tag';
              const isFailed = stageStatus === 'failed';
              const isRunning = [
                'running', 
                'processing', 
                'preparing', 
                'preparing_input', 
                'generating_stream', 
                'processing_stream', 
                'acknowledged_by_worker'
              ].includes(stageStatus);
              
              return (
                <div
                  key={stage.stageName}
                  className={`h-2 flex-1 rounded-sm ${
                    isCompleted ? 'bg-green-500' :
                    isFailed ? 'bg-red-500' :
                    isRunning ? 'bg-blue-500 animate-pulse' :
                    'bg-gray-200'
                  }`}
                  title={`${stage.stageName}: ${stage.status}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
});

WorkflowCard.displayName = 'WorkflowCard';