"use client";

import React, { useState, useCallback } from 'react';
import { RefreshCw, Loader2, AlertCircle, Settings, Play } from 'lucide-react';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { ScrollArea } from '@/ui/scroll-area';
import { Badge } from '@/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { EmptyState } from '@/ui/empty-state';
import { useWorkflowManager } from '@/hooks/useWorkflowManager';
import { useNotification } from '@/contexts/notification-context';
import { type WorkflowStatusResponse } from '@/types/workflow-types';
import { WorkflowCard } from './WorkflowCard';

interface WorkflowsPanelProps {
  className?: string;
}

export function WorkflowsPanel({ className }: WorkflowsPanelProps) {
  const { workflows, loading, error, actions } = useWorkflowManager();
  const { showNotification } = useNotification();
  const [cancellingWorkflow, setCancellingWorkflow] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowStatusResponse | null>(null);

  // Group workflows by status for better organization
  const workflowGroups = React.useMemo(() => {
    const groups = {
      active: workflows.filter(w => ['running', 'created'].includes(w.status.toLowerCase())),
      completed: workflows.filter(w => w.status.toLowerCase() === 'completed'),
      failed: workflows.filter(w => w.status.toLowerCase() === 'failed'),
      cancelled: workflows.filter(w => ['canceled', 'cancelled'].includes(w.status.toLowerCase())),
    };
    return groups;
  }, [workflows]);

  const handleRefresh = useCallback(async () => {
    try {
      await actions.refreshWorkflows();
      showNotification({ title: 'Workflows refreshed successfully', type: 'success' });
    } catch (error) {
      showNotification({ title: 'Failed to refresh workflows', type: 'error' });
    }
  }, [actions, showNotification]);

  const handleCancelWorkflow = useCallback(async (workflowId: string) => {
    try {
      setCancellingWorkflow(workflowId);
      await actions.cancelWorkflow(workflowId);
      showNotification({ title: 'Workflow cancelled successfully', type: 'success' });
    } catch (error) {
      showNotification({ title: 'Failed to cancel workflow', type: 'error' });
    } finally {
      setCancellingWorkflow(null);
      setShowCancelDialog(null);
    }
  }, [actions, showNotification]);

  const handleViewDetails = useCallback((workflow: WorkflowStatusResponse) => {
    setSelectedWorkflow(workflow);
  }, []);

  const handleRetryStage = useCallback(async (workflowId: string, stageJobId: string) => {
    try {
      console.log(`Attempting to retry stage ${stageJobId} in workflow ${workflowId}`);
      // Import the retry action
      const { retryWorkflowStageAction } = await import('@/actions/file-system/workflow-stage.actions');
      const result = await retryWorkflowStageAction(workflowId, stageJobId);
      
      if (result.isSuccess) {
        showNotification({ title: 'Stage retry initiated successfully', type: 'success' });
        // Refresh workflows to show updated status
        await actions.refreshWorkflows();
        // Update selected workflow if it's being viewed
        if (selectedWorkflow && selectedWorkflow.workflowId === workflowId) {
          const updatedWorkflow = await actions.getWorkflowById(workflowId);
          if (updatedWorkflow) {
            setSelectedWorkflow(updatedWorkflow);
          }
        }
      } else {
        showNotification({ title: `Failed to retry stage: ${result.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (error) {
      console.error('Error retrying workflow stage:', error);
      showNotification({ title: 'Failed to retry stage', type: 'error' });
    }
  }, [actions, showNotification, selectedWorkflow]);

  const renderWorkflowGroup = (title: string, workflows: WorkflowStatusResponse[], badgeColor: string) => {
    if (workflows.length === 0) return null;

    return (
      <div key={title} className="mb-6">
        <div className="flex items-center space-x-2 mb-3">
          <h3 className="text-sm font-medium text-gray-700">{title}</h3>
          <Badge variant="outline" className={`text-xs ${badgeColor}`}>
            {workflows.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.workflowId}
              workflow={workflow}
              onCancel={async (id) => setShowCancelDialog(id)}
              onViewDetails={handleViewDetails}
              onRetryStage={handleRetryStage}
              isCancelling={cancellingWorkflow === workflow.workflowId}
            />
          ))}
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center space-x-2 text-red-600 mb-4">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">Error loading workflows</span>
        </div>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card>
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-semibold text-gray-900">Workflows</h2>
              {workflows.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {workflows.length} total
                </Badge>
              )}
            </div>
            <Button
              onClick={handleRefresh}
              variant="ghost"
              size="sm"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[calc(100vh-200px)]">
          <div className="p-4">
            {workflows.length === 0 && !loading ? (
              <EmptyState
                icon={<Settings className="h-12 w-12 text-muted-foreground/70" />}
                title="No workflows found"
                description="Workflows will appear here when you start file finder processes or other automated tasks."
              />
            ) : (
              <div>
                {renderWorkflowGroup(
                  'Active',
                  workflowGroups.active,
                  'bg-blue-100 text-blue-800 border-blue-200'
                )}
                {renderWorkflowGroup(
                  'Failed',
                  workflowGroups.failed,
                  'bg-red-100 text-red-800 border-red-200'
                )}
                {renderWorkflowGroup(
                  'Completed',
                  workflowGroups.completed,
                  'bg-green-100 text-green-800 border-green-200'
                )}
                {renderWorkflowGroup(
                  'Cancelled',
                  workflowGroups.cancelled,
                  'bg-gray-100 text-gray-800 border-gray-200'
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog 
        open={!!showCancelDialog} 
        onOpenChange={(open) => !open && setShowCancelDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this workflow? This will stop all running stages and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showCancelDialog && handleCancelWorkflow(showCancelDialog)}
              className="bg-red-600 hover:bg-red-700"
            >
              Yes, Cancel Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enhanced Workflow Details Modal with Visualizer */}
      {selectedWorkflow && (
        <AlertDialog open={!!selectedWorkflow} onOpenChange={() => setSelectedWorkflow(null)}>
          <AlertDialogContent className="max-w-6xl max-h-[90vh]">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center justify-between">
                <span>Workflow Details - {selectedWorkflow.workflowId.slice(-8)}</span>
                <div className="flex items-center space-x-2">
                  <Badge variant={selectedWorkflow.status.toLowerCase() === 'completed' ? 'default' : 
                                 selectedWorkflow.status.toLowerCase() === 'failed' ? 'destructive' : 
                                 selectedWorkflow.status.toLowerCase() === 'running' ? 'outline' : 'secondary'}>
                    {selectedWorkflow.status}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {Math.round(selectedWorkflow.progressPercentage)}% Complete
                  </span>
                </div>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <div className="flex flex-col space-y-1">
                  <span>Current Stage: {selectedWorkflow.currentStage || 'Unknown'}</span>
                  {selectedWorkflow.taskDescription && (
                    <span className="text-xs">Task: {selectedWorkflow.taskDescription}</span>
                  )}
                  {selectedWorkflow.projectDirectory && (
                    <span className="text-xs">Directory: {selectedWorkflow.projectDirectory}</span>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <ScrollArea className="max-h-[60vh] px-1">
              <div className="space-y-6">
                {/* Workflow Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-green-600">
                      {selectedWorkflow.stageStatuses.filter(s => s.status.toLowerCase() === 'completed' || s.status.toLowerCase() === 'completed_by_tag').length}
                    </div>
                    <div className="text-xs text-gray-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-blue-600">
                      {selectedWorkflow.stageStatuses.filter(s => ['running', 'processing', 'preparing', 'preparing_input', 'generating_stream', 'processing_stream', 'acknowledged_by_worker'].includes(s.status.toLowerCase())).length}
                    </div>
                    <div className="text-xs text-gray-600">Running</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-red-600">
                      {selectedWorkflow.stageStatuses.filter(s => s.status.toLowerCase() === 'failed').length}
                    </div>
                    <div className="text-xs text-gray-600">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-gray-600">
                      {selectedWorkflow.stageStatuses.filter(s => !['completed', 'completed_by_tag', 'failed', 'running', 'processing', 'preparing', 'preparing_input', 'generating_stream', 'processing_stream', 'acknowledged_by_worker'].includes(s.status.toLowerCase())).length}
                    </div>
                    <div className="text-xs text-gray-600">Pending</div>
                  </div>
                </div>

                {/* Detailed Stage Information */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Stage Details</h4>
                  {selectedWorkflow.stageStatuses.map((stage) => (
                    <div key={stage.stageName} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="text-sm font-medium">{stage.stageName}</div>
                          <Badge variant={stage.status.toLowerCase() === 'completed' || stage.status.toLowerCase() === 'completed_by_tag' ? 'default' : 
                                         stage.status.toLowerCase() === 'failed' ? 'destructive' : 
                                         ['running', 'processing', 'preparing', 'preparing_input', 'generating_stream', 'processing_stream', 'acknowledged_by_worker'].includes(stage.status.toLowerCase()) ? 'outline' : 'secondary'} 
                                 className="text-xs">
                            {stage.status}
                          </Badge>
                          {stage.jobId && (
                            <span className="text-xs text-gray-500 font-mono">ID: {stage.jobId.slice(-8)}</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {stage.executionTimeMs && (
                            <span className="text-xs text-gray-500">
                              {Math.round(stage.executionTimeMs / 1000)}s
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {stage.progressPercentage}%
                          </span>
                          {/* Stage-level retry button for failed stages */}
                          {stage.status.toLowerCase() === 'failed' && stage.jobId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetryStage(selectedWorkflow.workflowId, stage.jobId!)}
                              className="h-6 px-2 text-xs border-red-200 text-red-700 hover:bg-red-50"
                            >
                              <Play className="h-2 w-2 mr-1" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Timing Information */}
                      {(stage.startedAt || stage.completedAt || stage.createdAt) && (
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          {stage.createdAt && (
                            <span>Created: {new Date(stage.createdAt).toLocaleTimeString()}</span>
                          )}
                          {stage.startedAt && (
                            <span>Started: {new Date(stage.startedAt).toLocaleTimeString()}</span>
                          )}
                          {stage.completedAt && (
                            <span>Completed: {new Date(stage.completedAt).toLocaleTimeString()}</span>
                          )}
                        </div>
                      )}
                      
                      {/* Error Message */}
                      {stage.errorMessage && (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <div className="flex items-start space-x-2">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-red-800">{stage.errorMessage}</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Dependencies */}
                      {stage.dependsOn && (
                        <div className="text-xs text-gray-500">
                          Depends on: {stage.dependsOn}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Overall Error Message */}
                {selectedWorkflow.errorMessage && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-red-800 text-sm">Workflow Error</div>
                        <div className="text-sm text-red-700 mt-1">{selectedWorkflow.errorMessage}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timing Summary */}
                {(selectedWorkflow.createdAt || selectedWorkflow.totalExecutionTimeMs) && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-sm mb-2">Timing Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                      {selectedWorkflow.createdAt && (
                        <div>
                          <span className="font-medium">Created:</span> {new Date(selectedWorkflow.createdAt).toLocaleString()}
                        </div>
                      )}
                      {selectedWorkflow.updatedAt && (
                        <div>
                          <span className="font-medium">Updated:</span> {new Date(selectedWorkflow.updatedAt).toLocaleString()}
                        </div>
                      )}
                      {selectedWorkflow.completedAt && (
                        <div>
                          <span className="font-medium">Completed:</span> {new Date(selectedWorkflow.completedAt).toLocaleString()}
                        </div>
                      )}
                      {selectedWorkflow.totalExecutionTimeMs && (
                        <div>
                          <span className="font-medium">Total Time:</span> {Math.round(selectedWorkflow.totalExecutionTimeMs / 1000)}s
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <AlertDialogFooter>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const updatedWorkflow = await actions.getWorkflowById(selectedWorkflow.workflowId);
                    if (updatedWorkflow) {
                      setSelectedWorkflow(updatedWorkflow);
                      showNotification({ title: 'Workflow details refreshed', type: 'success' });
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <AlertDialogCancel>Close</AlertDialogCancel>
              </div>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}