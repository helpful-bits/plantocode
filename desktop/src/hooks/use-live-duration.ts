import { useState, useEffect } from 'react';
import { formatJobDuration } from '@/utils/date-utils';

/**
 * Custom hook that provides live duration updates for running jobs
 * @param startTime Job start time (milliseconds since epoch)
 * @param endTime Job end time (milliseconds since epoch)
 * @param status Current job status
 * @returns Live duration string that updates every second for running jobs
 */
export function useLiveDuration(
  startTime: number | null | undefined,
  endTime: number | null | undefined,
  status: string
): string {
  // For non-running jobs, calculate once and return static duration
  const isRunning = ['running', 'preparing', 'processingStream', 'acknowledgedByWorker', 'preparingInput', 'generatingStream'].includes(status);
  
  const [liveDuration, setLiveDuration] = useState(() => 
    formatJobDuration(startTime, endTime, status)
  );

  useEffect(() => {
    if (!isRunning) {
      // For completed/failed/canceled jobs, calculate once and don't update
      setLiveDuration(formatJobDuration(startTime, endTime, status));
      return;
    }

    // For running jobs, update every second
    const updateDuration = () => {
      setLiveDuration(formatJobDuration(startTime, endTime, status));
    };

    // Update immediately
    updateDuration();

    // Set up interval to update every second
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime, status, isRunning]);

  return liveDuration;
}