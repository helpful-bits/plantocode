import { useState, useEffect } from 'react';
import { type BackgroundJob } from '@/types/session-types';
import { getStreamingProgressValue } from '@/app/components/background-jobs-sidebar/utils';

/**
 * Calculate progress for a job using the same logic as the job card
 */
function calculateJobProgress(job: BackgroundJob, isRunning: boolean): number | undefined {
  if (!isRunning) return undefined;
  
  // First check if job has progressPercentage field (for workflow jobs)
  if (job.progressPercentage !== undefined && job.progressPercentage !== null) {
    return job.progressPercentage;
  }
  
  // Check for stream progress from metadata
  const streamProgress = getStreamingProgressValue(job.metadata, job.startTime);
  if (streamProgress !== undefined) {
    return streamProgress;
  }
  
  // Fall back to time-based progress animation with different durations per task type
  if (job.startTime || job.createdAt) {
    const elapsed = Date.now() - new Date(job.startTime || job.createdAt).getTime();
    let estimatedDuration = 30000; // Default 30 seconds
    
    const taskDurations: Record<string, number> = {
      'extended_path_finder': 20000,
      'file_relevance_assessment': 20000,
      'regex_file_filter': 20000,
      'path_correction': 20000,
      'implementation_plan': 90000,
      'implementation_plan_merge': 90000,
      'web_search_prompts_generation': 30000,
      'web_search_execution': 120000,
      'text_improvement': 45000,
      'task_refinement': 30000,
      'generic_llm_stream': 60000,
    };
    
    estimatedDuration = taskDurations[job.taskType] || estimatedDuration;
    const progress = Math.min(90, (elapsed / estimatedDuration) * 90);
    return Math.round(progress);
  }
  
  return undefined;
}

/**
 * Custom hook that provides live progress updates for running jobs
 * @param job The background job to calculate progress for
 * @returns Live progress value that updates every second for running jobs
 */
export function useLiveProgress(job: BackgroundJob): number | undefined {
  // Determine if job is running for live progress updates  
  const isJobRunning = ["running", "processingStream", "generatingStream", "preparing", "preparing_input"].includes(job.status);
  
  const [liveProgress, setLiveProgress] = useState(() => 
    calculateJobProgress(job, isJobRunning)
  );

  useEffect(() => {
    if (!isJobRunning) {
      // For completed/failed/canceled jobs, calculate once and don't update
      setLiveProgress(calculateJobProgress(job, false));
      return;
    }

    // For running jobs, update every second
    const updateProgress = () => {
      setLiveProgress(calculateJobProgress(job, true));
    };

    // Update immediately
    updateProgress();

    // Set up interval to update every second
    const interval = setInterval(updateProgress, 1000);

    return () => clearInterval(interval);
  }, [job.id, job.status, job.startTime, job.createdAt, job.progressPercentage, job.metadata, job.taskType, isJobRunning]);

  return liveProgress;
}