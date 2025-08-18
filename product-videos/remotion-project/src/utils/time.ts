/**
 * Time utilities for video editing
 */

/**
 * Convert timestamp string to frame number
 * Supports formats: HH:MM:SS:FF, MM:SS:FF, MM:SS
 */
export function timestampToFrames(timestamp: string, fps: number): number {
  const parts = timestamp.split(':');
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let frames = 0;

  if (parts.length === 4) {
    // HH:MM:SS:FF
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    seconds = parseInt(parts[2], 10);
    frames = parseInt(parts[3], 10);
  } else if (parts.length === 3) {
    // MM:SS:FF
    minutes = parseInt(parts[0], 10);
    seconds = parseInt(parts[1], 10);
    frames = parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    // MM:SS
    minutes = parseInt(parts[0], 10);
    seconds = parseInt(parts[1], 10);
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Math.round(totalSeconds * fps + frames);
}

/**
 * Convert frame number to timestamp string (MM:SS:FF)
 */
export const framesToTimestamp = (frame: number, fps: number): string => {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const remainingFrames = frame % fps;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${remainingFrames.toString().padStart(2, '0')}`;
};

export const framesBetween = (startTimestamp: string, endTimestamp: string, fps: number): number => {
  return timestampToFrames(endTimestamp, fps) - timestampToFrames(startTimestamp, fps);
};

export const playbackRateFor = (sourceFrames: number, targetFrames: number): number => {
  return sourceFrames / targetFrames;
};

export const accumulateStarts = (durations: number[]): number[] => {
  const starts = [0];
  for (let i = 1; i < durations.length; i++) {
    starts.push(starts[i - 1] + durations[i - 1]);
  }
  return starts;
};