/**
 * Workflow Performance Monitoring and Analytics
 * Provides comprehensive performance tracking and insights for workflows
 */

import { useEffect, useRef } from 'react';
import type {
  WorkflowMetrics,
  StageMetrics,
  PerformanceInsights,
  WorkflowState,
  WorkflowStage,
} from '@/types/workflow-types';
import { WORKFLOW_STATUSES } from '@/types/workflow-types';

interface WorkflowPerformanceData {
  workflowId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  stages: Record<string, {
    startTime: number;
    endTime?: number;
    inputSize: number;
    outputSize: number;
    memoryUsage: number;
    success: boolean;
    errorMessage?: string;
  }>;
  totalFilesProcessed: number;
  peakMemoryUsage: number;
  averageMemoryUsage: number;
}

/**
 * Performance monitoring class for workflows
 */
export class WorkflowPerformanceMonitor {
  private static instance: WorkflowPerformanceMonitor;
  private performanceData: Map<string, WorkflowPerformanceData> = new Map();
  private memoryUsageHistory: Array<{ timestamp: number; usage: number }> = [];
  private maxHistorySize = 1000;
  private memoryMonitoringInterval: number | null = null;
  private isDestroyed = false;

  private constructor() {
    // Start memory monitoring
    this.startMemoryMonitoring();
    
    // Set up cleanup on page unload
    if (typeof window !== 'undefined') {
      const cleanup = () => this.destroy();
      window.addEventListener('beforeunload', cleanup);
      window.addEventListener('unload', cleanup);
    }
  }

  static getInstance(): WorkflowPerformanceMonitor {
    if (!WorkflowPerformanceMonitor.instance) {
      WorkflowPerformanceMonitor.instance = new WorkflowPerformanceMonitor();
    }
    return WorkflowPerformanceMonitor.instance;
  }

  /**
   * Start tracking a workflow
   */
  startWorkflowTracking(workflowId: string, sessionId: string): void {
    this.performanceData.set(workflowId, {
      workflowId,
      sessionId,
      startTime: Date.now(),
      stages: {},
      totalFilesProcessed: 0,
      peakMemoryUsage: 0,
      averageMemoryUsage: 0,
    });
  }

  /**
   * End tracking a workflow
   */
  endWorkflowTracking(workflowId: string, totalFilesProcessed: number = 0): void {
    const data = this.performanceData.get(workflowId);
    if (data) {
      data.endTime = Date.now();
      data.totalFilesProcessed = totalFilesProcessed;
      
      // Calculate memory statistics
      const memoryData = this.getMemoryUsageForPeriod(data.startTime, data.endTime);
      data.peakMemoryUsage = Math.max(...memoryData.map(m => m.usage), 0);
      data.averageMemoryUsage = memoryData.reduce((sum, m) => sum + m.usage, 0) / Math.max(memoryData.length, 1);
    }
  }

  /**
   * Start tracking a specific stage
   */
  startStageTracking(
    workflowId: string,
    stage: WorkflowStage,
    inputSize: number = 0
  ): void {
    const data = this.performanceData.get(workflowId);
    if (data) {
      data.stages[stage] = {
        startTime: Date.now(),
        inputSize,
        outputSize: 0,
        memoryUsage: this.getCurrentMemoryUsage(),
        success: false,
      };
    }
  }

  /**
   * End tracking a specific stage
   */
  endStageTracking(
    workflowId: string,
    stage: WorkflowStage,
    outputSize: number = 0,
    success: boolean = true,
    errorMessage?: string
  ): void {
    const data = this.performanceData.get(workflowId);
    if (data && data.stages[stage]) {
      data.stages[stage].endTime = Date.now();
      data.stages[stage].outputSize = outputSize;
      data.stages[stage].success = success;
      data.stages[stage].errorMessage = errorMessage;
    }
  }

  /**
   * Get comprehensive metrics for a workflow
   */
  getWorkflowMetrics(workflowId: string): WorkflowMetrics | null {
    const data = this.performanceData.get(workflowId);
    if (!data || !data.endTime) {
      return null;
    }

    const totalExecutionTime = data.endTime - data.startTime;
    const stageExecutionTimes: Record<WorkflowStage, number> = {} as any;

    Object.entries(data.stages).forEach(([stage, stageData]) => {
      if (stageData.endTime) {
        stageExecutionTimes[stage as WorkflowStage] = stageData.endTime - stageData.startTime;
      }
    });

    return {
      workflowId,
      totalExecutionTime,
      stageExecutionTimes,
      memoryUsage: {
        peak: data.peakMemoryUsage,
        average: data.averageMemoryUsage,
      },
      throughput: {
        filesProcessed: data.totalFilesProcessed,
        filesPerSecond: data.totalFilesProcessed / (totalExecutionTime / 1000),
      },
    };
  }

  /**
   * Get metrics for individual stages
   */
  getStageMetrics(workflowId: string): StageMetrics[] {
    const data = this.performanceData.get(workflowId);
    if (!data) {
      return [];
    }

    return Object.entries(data.stages).map(([stage, stageData]) => ({
      stage: stage as WorkflowStage,
      executionTime: stageData.endTime ? stageData.endTime - stageData.startTime : 0,
      inputSize: stageData.inputSize,
      outputSize: stageData.outputSize,
      memoryUsage: stageData.memoryUsage,
      success: stageData.success,
      errorMessage: stageData.errorMessage,
    }));
  }

  /**
   * Get performance insights based on historical data
   */
  getPerformanceInsights(): PerformanceInsights {
    const allMetrics = Array.from(this.performanceData.values())
      .filter(data => data.endTime)
      .map(data => this.getWorkflowMetrics(data.workflowId))
      .filter(Boolean) as WorkflowMetrics[];

    if (allMetrics.length === 0) {
      return {
        averageExecutionTime: 0,
        slowestStage: 'REGEX_FILE_FILTER',
        fastestStage: 'REGEX_FILE_FILTER',
        failureRate: 0,
        recommendations: ['No workflow data available'],
      };
    }

    // Calculate average execution time
    const averageExecutionTime = allMetrics.reduce(
      (sum, metrics) => sum + metrics.totalExecutionTime,
      0
    ) / allMetrics.length;

    // Find slowest and fastest stages
    const stagePerformance: Record<string, number[]> = {};
    allMetrics.forEach(metrics => {
      Object.entries(metrics.stageExecutionTimes).forEach(([stage, time]) => {
        if (!stagePerformance[stage]) {
          stagePerformance[stage] = [];
        }
        stagePerformance[stage].push(time);
      });
    });

    const avgStagePerformance = Object.entries(stagePerformance).map(([stage, times]) => ({
      stage,
      avgTime: times.reduce((sum, time) => sum + time, 0) / times.length,
    }));

    avgStagePerformance.sort((a, b) => b.avgTime - a.avgTime);
    const slowestStage = avgStagePerformance[0]?.stage as WorkflowStage || 'REGEX_FILE_FILTER';
    const fastestStage = avgStagePerformance[avgStagePerformance.length - 1]?.stage as WorkflowStage || 'REGEX_FILE_FILTER';

    // Calculate failure rate
    const failedWorkflows = Array.from(this.performanceData.values()).filter(data => {
      return Object.values(data.stages).some(stage => !stage.success);
    });
    const failureRate = failedWorkflows.length / this.performanceData.size;

    // Generate recommendations
    const recommendations = this.generateRecommendations(allMetrics, failureRate, slowestStage);

    return {
      averageExecutionTime,
      slowestStage,
      fastestStage,
      failureRate,
      recommendations,
    };
  }

  /**
   * Clear old performance data to manage memory
   */
  clearOldData(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - olderThanMs;
    
    for (const [workflowId, data] of this.performanceData.entries()) {
      if (data.startTime < cutoffTime) {
        this.performanceData.delete(workflowId);
      }
    }

    // Clean memory usage history
    this.memoryUsageHistory = this.memoryUsageHistory.filter(
      entry => entry.timestamp > cutoffTime
    );
  }

  /**
   * Export performance data for analysis
   */
  exportPerformanceData(): {
    workflows: WorkflowPerformanceData[];
    memoryHistory: Array<{ timestamp: number; usage: number }>;
    insights: PerformanceInsights;
  } {
    return {
      workflows: Array.from(this.performanceData.values()),
      memoryHistory: this.memoryUsageHistory,
      insights: this.getPerformanceInsights(),
    };
  }

  /**
   * Update workflow metrics from workflow state
   */
  updateFromWorkflowState(workflowState: WorkflowState): void {
    const { workflowId, sessionId } = workflowState;
    
    // Ensure workflow is being tracked
    if (!this.performanceData.has(workflowId)) {
      this.startWorkflowTracking(workflowId, sessionId);
    }

    const data = this.performanceData.get(workflowId);
    if (!data) return;

    // Update stage information with more granular tracking
    workflowState.stageJobs.forEach(stageJob => {
      const stageData = data.stages[stageJob.stage];
      
      // Start tracking if stage is running and not yet tracked
      if ((stageJob.status === 'running' || stageJob.status === 'preparing' || 
           stageJob.status === 'preparingInput' || stageJob.status === 'generatingStream' ||
           stageJob.status === 'processingStream') && !stageData) {
        // Estimate input size based on stage type
        const inputSize = this.estimateStageInputSize(stageJob.stage, workflowState);
        this.startStageTracking(workflowId, stageJob.stage, inputSize);
      }
      
      // End tracking if stage completed/failed and was previously tracked
      if ((stageJob.status === 'completed' || stageJob.status === 'failed' || 
           stageJob.status === 'completedByTag') && stageData && !stageData.endTime) {
        // Estimate output size based on stage type
        const outputSize = this.estimateStageOutputSize(stageJob.stage, workflowState);
        this.endStageTracking(
          workflowId,
          stageJob.stage,
          outputSize,
          stageJob.status === 'completed' || stageJob.status === 'completedByTag',
          stageJob.errorMessage
        );
      }
    });

    // End workflow tracking if completed
    if (workflowState.status === WORKFLOW_STATUSES.COMPLETED || workflowState.status === WORKFLOW_STATUSES.FAILED) {
      const totalFiles = this.estimateTotalFilesProcessed(workflowState);
      this.endWorkflowTracking(workflowId, totalFiles);
    }
  }

  /**
   * Set up event listeners for real-time workflow tracking
   */
  setupWorkflowEventListeners(): Promise<() => void> {
    return new Promise(async (resolve) => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // Listen for workflow status events
        const statusUnlisten = await listen<{
          workflowId: string;
          status: string;
          progress: number;
          currentStage?: string;
          message: string;
          errorMessage?: string;
        }>('file-finder-workflow-status', (event) => {
          const { workflowId, status } = event.payload;
          
          // Track workflow completion
          if ((status === WORKFLOW_STATUSES.COMPLETED || status === WORKFLOW_STATUSES.FAILED) && this.performanceData.has(workflowId)) {
            this.endWorkflowTracking(workflowId);
          }
        });

        // Listen for workflow stage events
        const stageUnlisten = await listen<{
          workflowId: string;
          stage: WorkflowStage;
          jobId: string;
          status: string;
          message: string;
          errorMessage?: string;
          data?: any;
        }>('file-finder-workflow-stage', (event) => {
          const { workflowId, stage, status, errorMessage } = event.payload;
          
          if (!this.performanceData.has(workflowId)) {
            // Start tracking if we receive a stage event for an unknown workflow
            this.startWorkflowTracking(workflowId, 'unknown');
          }

          const data = this.performanceData.get(workflowId);
          if (!data) return;

          // Start stage tracking when it begins running
          if ((status === 'running' || status === 'preparing') && !data.stages[stage]) {
            this.startStageTracking(workflowId, stage);
          }
          
          // End stage tracking when it completes or fails
          if ((status === 'completed' || status === 'failed') && data.stages[stage] && !data.stages[stage].endTime) {
            this.endStageTracking(
              workflowId,
              stage,
              0, // output size not available from events
              status === 'completed',
              errorMessage
            );
          }
        });

        // Return cleanup function
        const cleanup = () => {
          statusUnlisten();
          stageUnlisten();
        };
        
        resolve(cleanup);
      } catch (error) {
        console.warn('Failed to setup workflow event listeners for performance monitoring:', error);
        resolve(() => {}); // Return no-op cleanup function
      }
    });
  }

  // Private methods

  private estimateStageInputSize(stage: WorkflowStage, workflowState: WorkflowState): number {
    // Estimate input size based on stage type and available data
    switch (stage) {
      case 'REGEX_FILE_FILTER':
        return workflowState.taskDescription.length;
      case 'FILE_RELEVANCE_ASSESSMENT':
        return workflowState.intermediateData.locallyFilteredFiles.length;
      case 'EXTENDED_PATH_FINDER':
        return workflowState.intermediateData.aiFilteredFiles.length;
      case 'PATH_CORRECTION':
        return workflowState.intermediateData.extendedUnverifiedPaths.length;
      default:
        return 0;
    }
  }

  private estimateStageOutputSize(stage: WorkflowStage, workflowState: WorkflowState): number {
    // Estimate output size based on stage type and available data
    switch (stage) {
      case 'REGEX_FILE_FILTER':
        return JSON.stringify(workflowState.intermediateData.rawRegexPatterns).length || 0;
      case 'FILE_RELEVANCE_ASSESSMENT':
        return workflowState.intermediateData.aiFilteredFiles.length;
      case 'EXTENDED_PATH_FINDER':
        return workflowState.intermediateData.extendedVerifiedPaths.length + 
               workflowState.intermediateData.extendedUnverifiedPaths.length;
      case 'PATH_CORRECTION':
        return workflowState.intermediateData.extendedCorrectedPaths.length;
      default:
        return 0;
    }
  }

  private estimateTotalFilesProcessed(workflowState: WorkflowState): number {
    // Sum up all the files processed across stages
    const intermediate = workflowState.intermediateData;
    return intermediate.locallyFilteredFiles.length +
           intermediate.initialVerifiedPaths.length +
           intermediate.initialCorrectedPaths.length +
           intermediate.extendedVerifiedPaths.length +
           intermediate.extendedCorrectedPaths.length;
  }

  private startMemoryMonitoring(): void {
    // Only start if not already monitoring and not destroyed
    if (this.memoryMonitoringInterval !== null || this.isDestroyed) {
      return;
    }

    const monitorMemory = () => {
      try {
        // Check if destroyed before each iteration
        if (this.isDestroyed) {
          if (this.memoryMonitoringInterval !== null) {
            clearInterval(this.memoryMonitoringInterval);
            this.memoryMonitoringInterval = null;
          }
          return;
        }

        const usage = this.getCurrentMemoryUsage();
        this.memoryUsageHistory.push({
          timestamp: Date.now(),
          usage,
        });

        // Trim history if it gets too large
        if (this.memoryUsageHistory.length > this.maxHistorySize) {
          this.memoryUsageHistory = this.memoryUsageHistory.slice(-this.maxHistorySize);
        }
      } catch (error) {
        console.warn('[WorkflowPerformanceMonitor] Error during memory monitoring:', error);
      }
    };

    // Increased interval from 5s to 30s to reduce overhead
    this.memoryMonitoringInterval = window.setInterval(monitorMemory, 30000);
  }

  /**
   * Destroy the monitor and clean up resources
   */
  public destroy(): void {
    this.isDestroyed = true;
    
    if (this.memoryMonitoringInterval !== null) {
      clearInterval(this.memoryMonitoringInterval);
      this.memoryMonitoringInterval = null;
    }
    
    // Clear data to free memory
    this.performanceData.clear();
    this.memoryUsageHistory = [];
    
    // Reset singleton instance
    if (WorkflowPerformanceMonitor.instance === this) {
      (WorkflowPerformanceMonitor as any).instance = undefined;
    }
  }

  /**
   * Check if the monitor is destroyed
   */
  public getIsDestroyed(): boolean {
    return this.isDestroyed;
  }

  private getCurrentMemoryUsage(): number {
    // In a real implementation, this would get actual memory usage
    // For now, return a mock value
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  private getMemoryUsageForPeriod(startTime: number, endTime: number): Array<{ timestamp: number; usage: number }> {
    return this.memoryUsageHistory.filter(
      entry => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  private generateRecommendations(
    metrics: WorkflowMetrics[],
    failureRate: number,
    slowestStage: WorkflowStage
  ): string[] {
    const recommendations: string[] = [];

    if (failureRate > 0.1) {
      recommendations.push(`High failure rate detected (${(failureRate * 100).toFixed(1)}%). Consider reviewing error handling and input validation.`);
    }

    if (slowestStage === 'EXTENDED_PATH_FINDER') {
      recommendations.push('Extended path finding is taking longer than expected. Consider tuning AI model parameters or reducing search scope.');
    } else if (slowestStage === 'FILE_RELEVANCE_ASSESSMENT') {
      recommendations.push('File relevance assessment is taking longer than expected. Consider simplifying your task description.');
    }

    const avgMemoryUsage = metrics.reduce((sum, m) => sum + m.memoryUsage.peak, 0) / metrics.length;
    if (avgMemoryUsage > 500) { // 500 MB
      recommendations.push('High memory usage detected. Consider implementing streaming or batch processing for large datasets.');
    }

    const avgThroughput = metrics.reduce((sum, m) => sum + m.throughput.filesPerSecond, 0) / metrics.length;
    if (avgThroughput < 10) {
      recommendations.push('Low file processing throughput. Consider parallelizing operations or optimizing I/O patterns.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is within expected parameters. Continue monitoring for optimization opportunities.');
    }

    return recommendations;
  }
}

/**
 * Hook for easy access to performance monitoring
 */
export function useWorkflowPerformanceMonitor() {
  const monitor = WorkflowPerformanceMonitor.getInstance();
  const eventCleanupRef = useRef<(() => void) | null>(null);

  // Set up event listeners when hook is first used
  useEffect(() => {
    const setupListeners = async () => {
      if (!eventCleanupRef.current && !monitor.getIsDestroyed()) {
        eventCleanupRef.current = await monitor.setupWorkflowEventListeners();
      }
    };
    
    setupListeners();
    
    // Cleanup on unmount
    return () => {
      if (eventCleanupRef.current) {
        eventCleanupRef.current();
        eventCleanupRef.current = null;
      }
      
      // Note: We don't destroy the singleton here as other components might be using it
      // The singleton will clean itself up on page unload
    };
  }, [monitor]);

  return {
    startTracking: (workflowId: string, sessionId: string) => 
      monitor.startWorkflowTracking(workflowId, sessionId),
    endTracking: (workflowId: string, filesProcessed?: number) => 
      monitor.endWorkflowTracking(workflowId, filesProcessed),
    getMetrics: (workflowId: string) => 
      monitor.getWorkflowMetrics(workflowId),
    getStageMetrics: (workflowId: string) => 
      monitor.getStageMetrics(workflowId),
    getInsights: () => 
      monitor.getPerformanceInsights(),
    updateFromState: (state: WorkflowState) => 
      monitor.updateFromWorkflowState(state),
    exportData: () => 
      monitor.exportPerformanceData(),
    clearOldData: (olderThanMs?: number) => 
      monitor.clearOldData(olderThanMs),
  };
}

/**
 * Performance comparison utilities
 */
export const PerformanceComparison = {
  /**
   * Compare two workflow metrics
   */
  compareWorkflows(metrics1: WorkflowMetrics, metrics2: WorkflowMetrics): {
    executionTimeDiff: number;
    memoryDiff: number;
    throughputDiff: number;
    betterWorkflow: string;
  } {
    const executionTimeDiff = metrics2.totalExecutionTime - metrics1.totalExecutionTime;
    const memoryDiff = metrics2.memoryUsage.peak - metrics1.memoryUsage.peak;
    const throughputDiff = metrics2.throughput.filesPerSecond - metrics1.throughput.filesPerSecond;

    // Simple scoring: faster execution + lower memory + higher throughput = better
    const score1 = -metrics1.totalExecutionTime - metrics1.memoryUsage.peak + metrics1.throughput.filesPerSecond * 1000;
    const score2 = -metrics2.totalExecutionTime - metrics2.memoryUsage.peak + metrics2.throughput.filesPerSecond * 1000;

    return {
      executionTimeDiff,
      memoryDiff,
      throughputDiff,
      betterWorkflow: score1 > score2 ? metrics1.workflowId : metrics2.workflowId,
    };
  },

  /**
   * Get performance trend over time
   */
  getPerformanceTrend(metrics: WorkflowMetrics[]): {
    executionTimetrend: 'improving' | 'degrading' | 'stable';
    memoryTrend: 'improving' | 'degrading' | 'stable';
    throughputTrend: 'improving' | 'degrading' | 'stable';
  } {
    if (metrics.length < 3) {
      return {
        executionTimetrend: 'stable',
        memoryTrend: 'stable',
        throughputTrend: 'stable',
      };
    }

    const recent = metrics.slice(-5); // Last 5 workflows
    const older = metrics.slice(-10, -5); // Previous 5 workflows

    const avgExecutionTimeRecent = recent.reduce((sum, m) => sum + m.totalExecutionTime, 0) / recent.length;
    const avgExecutionTimeOlder = older.reduce((sum, m) => sum + m.totalExecutionTime, 0) / older.length;

    const avgMemoryRecent = recent.reduce((sum, m) => sum + m.memoryUsage.peak, 0) / recent.length;
    const avgMemoryOlder = older.reduce((sum, m) => sum + m.memoryUsage.peak, 0) / older.length;

    const avgThroughputRecent = recent.reduce((sum, m) => sum + m.throughput.filesPerSecond, 0) / recent.length;
    const avgThroughputOlder = older.reduce((sum, m) => sum + m.throughput.filesPerSecond, 0) / older.length;

    const threshold = 0.1; // 10% change threshold

    return {
      executionTimetrend: 
        avgExecutionTimeRecent < avgExecutionTimeOlder * (1 - threshold) ? 'improving' :
        avgExecutionTimeRecent > avgExecutionTimeOlder * (1 + threshold) ? 'degrading' : 'stable',
      memoryTrend:
        avgMemoryRecent < avgMemoryOlder * (1 - threshold) ? 'improving' :
        avgMemoryRecent > avgMemoryOlder * (1 + threshold) ? 'degrading' : 'stable',
      throughputTrend:
        avgThroughputRecent > avgThroughputOlder * (1 + threshold) ? 'improving' :
        avgThroughputRecent < avgThroughputOlder * (1 - threshold) ? 'degrading' : 'stable',
    };
  },
};