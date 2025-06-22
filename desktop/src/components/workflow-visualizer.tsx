/**
 * Workflow Visualization Component
 * Provides comprehensive visual representation of workflow progress and status
 */

import React, { useState } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Play, Pause, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Progress } from '@/ui/progress';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/ui/collapsible';
import { WorkflowUtils } from '@/utils/workflow-utils';
import { WORKFLOW_STATUSES } from '@/types/workflow-types';
import { retryWorkflowStageAction, cancelWorkflowStageAction } from '@/actions/file-system/workflow-stage.actions';
import { extractErrorInfo, createUserFriendlyErrorMessage } from '@/utils/error-handling';
import type { WorkflowState, WorkflowStageJob, WorkflowStage, WorkflowStatusResponse, WorkflowStatus, JobStatus } from '@/types/workflow-types';

// Helper functions for robust type mapping from backend responses
// These handle various string formats from the backend and map them to frontend enum types
function mapWorkflowStatus(status: string): WorkflowStatus {
  const normalizedStatus = status.toLowerCase().trim();
  switch (normalizedStatus) {
    case WORKFLOW_STATUSES.BACKEND.CREATED: return WORKFLOW_STATUSES.CREATED;
    case WORKFLOW_STATUSES.BACKEND.RUNNING: return WORKFLOW_STATUSES.RUNNING;
    case WORKFLOW_STATUSES.BACKEND.PAUSED: return WORKFLOW_STATUSES.PAUSED;
    case WORKFLOW_STATUSES.BACKEND.COMPLETED: return WORKFLOW_STATUSES.COMPLETED;
    case WORKFLOW_STATUSES.BACKEND.FAILED: return WORKFLOW_STATUSES.FAILED;
    case WORKFLOW_STATUSES.BACKEND.CANCELED:
    case 'cancelled': return WORKFLOW_STATUSES.CANCELED;
    default: 
      console.warn(`Unknown workflow status: ${status}, defaulting to Created`);
      return WORKFLOW_STATUSES.CREATED;
  }
}

function mapJobStatus(status: string): JobStatus {
  const normalizedStatus = status.toLowerCase().trim();
  switch (normalizedStatus) {
    case 'idle': return 'idle';
    case 'created': return 'created';
    case 'queued': return 'queued';
    case 'acknowledgedByWorker': return 'acknowledgedByWorker';
    case 'preparing': return 'preparing';
    case 'preparingInput': return 'preparingInput';
    case 'generatingStream': return 'generatingStream';
    case 'processingStream': return 'processingStream';
    case 'running': return 'running';
    case 'completedByTag': return 'completedByTag';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'canceled': return 'canceled';
    default: 
      console.warn(`Unknown job status: ${status}, defaulting to idle`);
      return 'idle';
  }
}

function mapWorkflowStage(stageName: string): WorkflowStage {
  // Primary: Use the centralized mapping utility that handles all backend formats
  const mappedStage = WorkflowUtils.mapStageNameToEnum(stageName);
  if (mappedStage) {
    return mappedStage;
  }
  
  // Secondary: If the centralized utility couldn't map it, try a more flexible approach
  // by normalizing any input to uppercase with underscores (for edge cases)
  const normalizedStage = stageName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z_]/g, '').trim();
  
  // Try the normalized version with the centralized utility again
  const secondAttempt = WorkflowUtils.mapStageNameToEnum(normalizedStage);
  if (secondAttempt) {
    return secondAttempt;
  }
  
  // Ultimate fallback with warning - log more details for debugging
  console.warn(`Unknown workflow stage: "${stageName}" (normalized: "${normalizedStage}"), defaulting to REGEX_PATTERN_GENERATION`);
  return 'REGEX_PATTERN_GENERATION';
}

// Helper function to get all workflow stages in order
function getAllWorkflowStages(): WorkflowStage[] {
  return [
    'REGEX_PATTERN_GENERATION',
    'LOCAL_FILE_FILTERING',
    'FILE_RELEVANCE_ASSESSMENT',
    'EXTENDED_PATH_FINDER',
    'PATH_CORRECTION'
  ];
}

// Helper function to create placeholder stage job for stages not yet started
function createPlaceholderStageJob(stage: WorkflowStage): WorkflowStageJob {
  return {
    stage,
    jobId: `placeholder-${stage}`,
    status: 'idle',
    createdAt: Date.now(),
    startedAt: undefined,
    completedAt: undefined,
    executionTimeMs: undefined,
    errorMessage: undefined,
    subStatusMessage: undefined,
    dependsOn: undefined,
  };
}

export interface WorkflowVisualizerProps {
  workflowState?: WorkflowState;
  workflowStatus?: WorkflowStatusResponse; // Alternative input for WorkflowStatusResponse
  showDetails?: boolean;
  showTiming?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStageRetry?: (stageJobId: string) => void;
  onStageCancel?: (stageJobId: string) => void;
  enableStageActions?: boolean;
  className?: string;
}

export function WorkflowVisualizer({ 
  workflowState, 
  workflowStatus,
  showDetails = true, 
  showTiming = true,
  onCancel,
  onRetry,
  onPause,
  onResume,
  onStageRetry,
  onStageCancel,
  enableStageActions = false,
  className = ""
}: WorkflowVisualizerProps) {
  const [retryingStage, setRetryingStage] = useState<string | null>(null);
  const [cancelingStage, setCancelingStage] = useState<string | null>(null);
  
  // Convert WorkflowStatusResponse to WorkflowState if needed
  const effectiveWorkflowState = React.useMemo(() => {
    if (workflowState) return workflowState;
    if (!workflowStatus) throw new Error('Either workflowState or workflowStatus must be provided');
    
    // Convert WorkflowStatusResponse to WorkflowState with robust mapping
    const convertedState: WorkflowState = {
      workflowId: workflowStatus.workflowId,
      sessionId: workflowStatus.sessionId || '',
      projectHash: workflowStatus.sessionId || '',
      status: mapWorkflowStatus(workflowStatus.status),
      stageJobs: workflowStatus.stageStatuses.map(stage => {
        const mappedStage = mapWorkflowStage(stage.stageName);
        return {
          stage: mappedStage,
          jobId: stage.jobId || `placeholder-${mappedStage}`,
          status: mapJobStatus(stage.status),
          createdAt: stage.createdAt ? new Date(stage.createdAt).getTime() : Date.now(),
          startedAt: stage.startedAt ? new Date(stage.startedAt).getTime() : undefined,
          completedAt: stage.completedAt ? new Date(stage.completedAt).getTime() : undefined,
          executionTimeMs: stage.executionTimeMs || undefined,
          errorMessage: stage.errorMessage || undefined,
          dependsOn: stage.dependsOn || undefined,
          subStatusMessage: stage.subStatusMessage || undefined,
        };
      }),
      progressPercentage: workflowStatus.progressPercentage,
      currentStage: workflowStatus.currentStage ? mapWorkflowStage(workflowStatus.currentStage) : undefined,
      createdAt: workflowStatus.createdAt || Date.now(),
      updatedAt: workflowStatus.updatedAt || Date.now(),
      completedAt: workflowStatus.completedAt,
      totalExecutionTimeMs: workflowStatus.totalExecutionTimeMs,
      errorMessage: workflowStatus.errorMessage,
      taskDescription: workflowStatus.taskDescription || '',
      projectDirectory: workflowStatus.projectDirectory || '',
      excludedPaths: workflowStatus.excludedPaths || [],
      timeoutMs: workflowStatus.timeoutMs,
      intermediateData: {
        locallyFilteredFiles: [],
        aiFilteredFiles: [],
        initialVerifiedPaths: [],
        initialUnverifiedPaths: [],
        initialCorrectedPaths: [],
        extendedVerifiedPaths: [],
        extendedUnverifiedPaths: [],
        extendedCorrectedPaths: [],
      },
    };
    
    return convertedState;
  }, [workflowState, workflowStatus]);
  
  const isRunning = WorkflowUtils.isRunning(effectiveWorkflowState.status);
  const isPaused = effectiveWorkflowState.status === WORKFLOW_STATUSES.PAUSED;
  const canCancel = (isRunning || isPaused) && onCancel;
  const canRetry = (effectiveWorkflowState.status === WORKFLOW_STATUSES.FAILED || effectiveWorkflowState.status === WORKFLOW_STATUSES.CANCELED) && onRetry;
  const canPause = isRunning && onPause;
  const canResume = isPaused && onResume;

  return (
    <Card className={`workflow-visualizer ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            <div className="flex items-center gap-2">
              <WorkflowStatusIcon status={effectiveWorkflowState.status} />
              Workflow Progress
            </div>
          </CardTitle>
          <div className="flex items-center gap-2">
            {showTiming && effectiveWorkflowState.totalExecutionTimeMs && (
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                {WorkflowUtils.formatExecutionTime(effectiveWorkflowState.totalExecutionTimeMs)}
              </Badge>
            )}
            <Badge variant={getStatusBadgeVariant(effectiveWorkflowState.status)}>
              {effectiveWorkflowState.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span>{effectiveWorkflowState.progressPercentage.toFixed(0)}%</span>
          </div>
          <Progress value={effectiveWorkflowState.progressPercentage} className="h-2" />
        </div>

        {/* Current Stage */}
        {effectiveWorkflowState.currentStage && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Current Stage: {WorkflowUtils.getStageName(effectiveWorkflowState.currentStage)}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {WorkflowUtils.getStageDescription(effectiveWorkflowState.currentStage)}
            </div>
          </div>
        )}

        {/* Error Message */}
        {effectiveWorkflowState.errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 dark:text-red-200">
                {effectiveWorkflowState.errorMessage}
              </div>
            </div>
          </div>
        )}

        {/* Stage Details */}
        {showDetails && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                Stage Details ({getAllWorkflowStages().length} stages)
                <svg
                  className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {getAllWorkflowStages().map((stage) => {
                const stageJob = effectiveWorkflowState.stageJobs.find(job => job.stage === stage);
                return (
                  <StageJobCard
                    key={stage}
                    stageJob={stageJob || createPlaceholderStageJob(stage)}
                    showTiming={showTiming}
                    enableStageActions={enableStageActions}
                    onStageRetry={onStageRetry}
                    onStageCancel={onStageCancel}
                    retryingStage={retryingStage}
                    cancelingStage={cancelingStage}
                    setRetryingStage={setRetryingStage}
                    setCancelingStage={setCancelingStage}
                    workflowId={effectiveWorkflowState.workflowId}
                  />
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Action Buttons */}
        {(canCancel || canRetry || canPause || canResume) && (
          <div className="flex gap-2 pt-2 border-t">
            {canPause && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="w-4 h-4 mr-1" />
                Pause Workflow
              </Button>
            )}
            {canResume && (
              <Button variant="default" size="sm" onClick={onResume}>
                <Play className="w-4 h-4 mr-1" />
                Resume Workflow
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel Workflow
              </Button>
            )}
            {canRetry && (
              <Button variant="default" size="sm" onClick={onRetry}>
                Retry Workflow
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StageJobCardProps {
  stageJob: WorkflowStageJob;
  showTiming: boolean;
  enableStageActions?: boolean;
  onStageRetry?: (stageJobId: string) => void;
  onStageCancel?: (stageJobId: string) => void;
  retryingStage: string | null;
  cancelingStage: string | null;
  setRetryingStage: (stageJobId: string | null) => void;
  setCancelingStage: (stageJobId: string | null) => void;
  workflowId?: string;
}

function StageJobCard({ 
  stageJob, 
  showTiming, 
  enableStageActions = false,
  onStageRetry,
  onStageCancel,
  retryingStage,
  cancelingStage,
  setRetryingStage,
  setCancelingStage,
  workflowId
}: StageJobCardProps) {
  const stageName = WorkflowUtils.getStageName(stageJob.stage);
  const isFailed = stageJob.status === 'failed';
  const isRunning = stageJob.status === 'running' || 
                    stageJob.status === 'preparing' || 
                    stageJob.status === 'preparingInput' ||
                    stageJob.status === 'generatingStream' ||
                    stageJob.status === 'processingStream' ||
                    stageJob.status === 'acknowledgedByWorker';
  
  const isRetrying = retryingStage === stageJob.jobId;
  const isCanceling = cancelingStage === stageJob.jobId;
  // Only allow actions on stages with valid jobIds (not placeholders)
  const hasValidJobId = stageJob.jobId && !stageJob.jobId.startsWith('placeholder-');
  const canRetry = isFailed && !isRetrying && hasValidJobId;
  const canCancel = isRunning && !isCanceling && hasValidJobId;
  
  const handleRetryStage = async () => {
    // Validate jobId - must exist and not be a placeholder
    if (!hasValidJobId || !stageJob.jobId || stageJob.jobId.trim() === '') {
      console.warn('Cannot retry stage without valid jobId:', stageJob.jobId);
      return;
    }
    
    // Validate workflowId - must exist and not be empty
    if (!workflowId || workflowId.trim() === '') {
      console.warn('Cannot retry stage without valid workflow ID:', workflowId);
      return;
    }
    
    if (onStageRetry) {
      // Use callback if provided - pass the jobId directly
      onStageRetry(stageJob.jobId);
      return;
    }
    
    // Fall back to direct action with proper workflow ID and stage job ID
    setRetryingStage(stageJob.jobId);
    try {
      const result = await retryWorkflowStageAction(workflowId, stageJob.jobId);
      if (!result.isSuccess) {
        console.error('Failed to retry stage:', result.error);
      } else {
        console.log(`Successfully initiated retry for stage ${stageJob.jobId}`);
      }
    } catch (error) {
      console.error('Error retrying stage:', error);
    } finally {
      setRetryingStage(null);
    }
  };
  
  const handleCancelStage = async () => {
    // Validate jobId - must exist and not be a placeholder
    if (!hasValidJobId || !stageJob.jobId || stageJob.jobId.trim() === '') {
      console.warn('Cannot cancel stage without valid jobId:', stageJob.jobId);
      return;
    }
    
    // Validate workflowId - must exist and not be empty
    if (!workflowId || workflowId.trim() === '') {
      console.warn('Cannot cancel stage without valid workflow ID:', workflowId);
      return;
    }
    
    if (onStageCancel) {
      // Use callback if provided - pass the jobId directly
      onStageCancel(stageJob.jobId);
      return;
    }
    
    // Fall back to direct action with proper workflow ID and stage job ID
    setCancelingStage(stageJob.jobId);
    try {
      const result = await cancelWorkflowStageAction(workflowId, stageJob.jobId);
      if (!result.isSuccess) {
        console.error('Failed to cancel stage:', result.error);
      } else {
        console.log(`Successfully initiated cancel for stage ${stageJob.jobId}`);
      }
    } catch (error) {
      console.error('Error canceling stage:', error);
    } finally {
      setCancelingStage(null);
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <JobStatusIcon status={stageJob.status} />
          <span className="font-medium text-sm">{stageName}</span>
        </div>
        <div className="flex items-center gap-2">
          {showTiming && stageJob.executionTimeMs && (
            <span className="text-xs text-gray-500">
              {WorkflowUtils.formatExecutionTime(stageJob.executionTimeMs)}
            </span>
          )}
          <Badge variant={getJobStatusBadgeVariant(stageJob.status)} className="text-xs">
            {stageJob.status}
          </Badge>
          
          {/* Stage Action Buttons */}
          {enableStageActions && (
            <div className="flex gap-1">
              {canRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetryStage}
                  disabled={isRetrying}
                  className="h-6 px-2 text-xs"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Retrying
                    </>
                  ) : (
                    'Retry'
                  )}
                </Button>
              )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelStage}
                  disabled={isCanceling}
                  className="h-6 px-2 text-xs"
                >
                  {isCanceling ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Canceling
                    </>
                  ) : (
                    'Cancel'
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {stageJob.subStatusMessage && (
        <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded p-2">
          {stageJob.subStatusMessage}
        </div>
      )}

      {stageJob.errorMessage && (() => {
        const errorInfo = extractErrorInfo(stageJob.errorMessage);
        const userFriendlyMessage = errorInfo.workflowContext 
          ? createUserFriendlyErrorMessage(errorInfo)
          : stageJob.errorMessage;
        
        return (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
            <div className="font-medium mb-1">
              {errorInfo.workflowContext?.stageName && (
                <span>Failed at stage: {(() => {
                  // Use WorkflowUtils to get consistent stage display names
                  const stageEnum = WorkflowUtils.mapStageNameToEnum(errorInfo.workflowContext.stageName);
                  return stageEnum ? WorkflowUtils.getStageName(stageEnum) : errorInfo.workflowContext.stageName;
                })()}</span>
              )}
              {errorInfo.workflowContext?.retryAttempt && (
                <span className="ml-2 text-xs opacity-75">
                  (Retry attempt: {errorInfo.workflowContext.retryAttempt})
                </span>
              )}
            </div>
            <div>{userFriendlyMessage}</div>
          </div>
        );
      })()}

      {stageJob.dependsOn && (
        <div className="mt-2 text-xs text-gray-500">
          Depends on: {stageJob.dependsOn}
        </div>
      )}
    </div>
  );
}

function WorkflowStatusIcon({ status }: { status: string }) {
  switch (status) {
    case WORKFLOW_STATUSES.COMPLETED:
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case WORKFLOW_STATUSES.FAILED:
      return <XCircle className="w-5 h-5 text-red-500" />;
    case WORKFLOW_STATUSES.CANCELED:
      return <XCircle className="w-5 h-5 text-orange-500" />;
    case WORKFLOW_STATUSES.PAUSED:
      return <Pause className="w-5 h-5 text-yellow-500" />;
    case WORKFLOW_STATUSES.RUNNING:
      return <Play className="w-5 h-5 text-blue-500 animate-pulse" />;
    default:
      return <Clock className="w-5 h-5 text-gray-500" />;
  }
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'completedByTag':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'canceled':
      return <Pause className="w-4 h-4 text-yellow-500" />;
    case 'running':
    case 'preparing':
    case 'preparingInput':
    case 'generatingStream':
    case 'processingStream':
    case 'acknowledgedByWorker':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'queued':
    case 'created':
      return <Clock className="w-4 h-4 text-blue-400" />;
    case 'idle':
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case WORKFLOW_STATUSES.COMPLETED:
      return 'default';
    case WORKFLOW_STATUSES.FAILED:
      return 'destructive';
    case WORKFLOW_STATUSES.RUNNING:
      return 'outline';
    case WORKFLOW_STATUSES.PAUSED:
      return 'secondary';
    default:
      return 'secondary';
  }
}

function getJobStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'completed':
    case 'completedByTag':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
    case 'preparing':
    case 'preparingInput':
    case 'generatingStream':
    case 'processingStream':
    case 'acknowledgedByWorker':
      return 'outline';
    case 'queued':
    case 'created':
      return 'secondary';
    default:
      return 'secondary';
  }
}

/**
 * Compact workflow progress indicator for use in smaller spaces
 */
export interface WorkflowProgressIndicatorProps {
  workflowState: WorkflowState;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  className?: string;
}

export function WorkflowProgressIndicator({
  workflowState,
  size = 'md',
  showPercentage = true,
  className = ""
}: WorkflowProgressIndicatorProps) {
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WorkflowStatusIcon status={workflowState.status} />
          <span className="text-sm font-medium">
            {workflowState.currentStage ? WorkflowUtils.getStageName(workflowState.currentStage) : 'Workflow'}
          </span>
        </div>
        {showPercentage && (
          <span className="text-sm text-gray-500">
            {workflowState.progressPercentage.toFixed(0)}%
          </span>
        )}
      </div>
      <Progress value={workflowState.progressPercentage} className={sizeClasses[size]} />
    </div>
  );
}

/**
 * Workflow timeline view showing stage progression
 */
export interface WorkflowTimelineProps {
  workflowState: WorkflowState;
  enableStageActions?: boolean;
  onStageRetry?: (stageJobId: string) => void;
  onStageCancel?: (stageJobId: string) => void;
  className?: string;
}

export function WorkflowTimeline({ 
  workflowState, 
  enableStageActions = false,
  onStageRetry,
  onStageCancel,
  className = "" 
}: WorkflowTimelineProps) {
  const [retryingStage, setRetryingStage] = useState<string | null>(null);
  const [cancelingStage, setCancelingStage] = useState<string | null>(null);
  
  // Get stages from WorkflowStage enum - all stages in workflow order
  const stages: WorkflowStage[] = getAllWorkflowStages();
  
  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="font-medium text-sm">Workflow Timeline</h3>
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const stageJob = workflowState.stageJobs.find(job => job.stage === stage);
          const isCurrent = workflowState.currentStage === stage;
          const isCompleted = stageJob?.status === 'completed' || stageJob?.status === 'completedByTag';
          const isFailed = stageJob?.status === 'failed';
          const isActive = stageJob?.status === 'running' || 
                          stageJob?.status === 'preparing' || 
                          stageJob?.status === 'preparingInput' ||
                          stageJob?.status === 'generatingStream' ||
                          stageJob?.status === 'processingStream' ||
                          stageJob?.status === 'acknowledgedByWorker';
          
          return (
            <div key={stage} className="flex items-center gap-3">
              {/* Timeline connector */}
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 ${
                  isCompleted ? 'bg-green-500 border-green-500' :
                  isFailed ? 'bg-red-500 border-red-500' :
                  isActive ? 'bg-blue-500 border-blue-500 animate-pulse' :
                  isCurrent ? 'bg-blue-200 border-blue-500' :
                  'bg-gray-200 border-gray-300'
                }`} />
                {index < stages.length - 1 && (
                  <div className={`w-0.5 h-6 ${
                    isCompleted ? 'bg-green-200' : 'bg-gray-200'
                  }`} />
                )}
              </div>
              
              {/* Stage info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${
                    isCurrent ? 'text-blue-600' : 
                    isCompleted ? 'text-green-600' :
                    isFailed ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {WorkflowUtils.getStageName(stage)}
                  </span>
                  <div className="flex items-center gap-2">
                    {stageJob?.executionTimeMs && (
                      <span className="text-xs text-gray-500">
                        {WorkflowUtils.formatExecutionTime(stageJob.executionTimeMs)}
                      </span>
                    )}
                    {/* Timeline Stage Actions */}
                    {enableStageActions && stageJob && (
                      <div className="flex gap-1">
                        {/* Timeline Stage Actions - only show for valid job IDs */}
                        {isFailed && stageJob && stageJob.jobId && !stageJob.jobId.startsWith('placeholder-') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              // Validate inputs before proceeding
                              if (!stageJob.jobId || stageJob.jobId.trim() === '') {
                                console.warn('Cannot retry stage without valid jobId:', stageJob.jobId);
                                return;
                              }
                              
                              if (onStageRetry) {
                                onStageRetry(stageJob.jobId);
                              } else if (workflowState.workflowId && workflowState.workflowId.trim() !== '') {
                                setRetryingStage(stageJob.jobId);
                                try {
                                  const result = await retryWorkflowStageAction(workflowState.workflowId, stageJob.jobId);
                                  if (result.isSuccess) {
                                    console.log(`Successfully initiated retry for stage ${stageJob.jobId}`);
                                  } else {
                                    console.error('Failed to retry stage:', result.error);
                                  }
                                } catch (error) {
                                  console.error('Error retrying stage:', error);
                                } finally {
                                  setRetryingStage(null);
                                }
                              }
                            }}
                            disabled={retryingStage === stageJob.jobId}
                            className="h-5 px-1 text-xs"
                          >
                            {retryingStage === stageJob.jobId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Retry'
                            )}
                          </Button>
                        )}
                        {isActive && stageJob && stageJob.jobId && !stageJob.jobId.startsWith('placeholder-') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              // Validate inputs before proceeding
                              if (!stageJob.jobId || stageJob.jobId.trim() === '') {
                                console.warn('Cannot cancel stage without valid jobId:', stageJob.jobId);
                                return;
                              }
                              
                              if (onStageCancel) {
                                onStageCancel(stageJob.jobId);
                              } else if (workflowState.workflowId && workflowState.workflowId.trim() !== '') {
                                setCancelingStage(stageJob.jobId);
                                try {
                                  const result = await cancelWorkflowStageAction(workflowState.workflowId, stageJob.jobId);
                                  if (result.isSuccess) {
                                    console.log(`Successfully initiated cancel for stage ${stageJob.jobId}`);
                                  } else {
                                    console.error('Failed to cancel stage:', result.error);
                                  }
                                } catch (error) {
                                  console.error('Error canceling stage:', error);
                                } finally {
                                  setCancelingStage(null);
                                }
                              }
                            }}
                            disabled={cancelingStage === stageJob.jobId}
                            className="h-5 px-1 text-xs"
                          >
                            {cancelingStage === stageJob.jobId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Cancel'
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {WorkflowUtils.getStageDescription(stage)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}