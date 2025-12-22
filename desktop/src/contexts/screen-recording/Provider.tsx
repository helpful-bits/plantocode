import { createContext, useContext, useReducer, useCallback, useRef, useEffect, ReactNode, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { startVideoAnalysisJob, type StartVideoAnalysisJobParams } from '@/actions/video-analysis/start-video-analysis.action';
import { VIDEO_ANALYSIS_MIN_FPS, VIDEO_ANALYSIS_MAX_FPS } from '@/types/video-analysis-types';
import { pathDirname } from '@/utils/tauri-fs';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',      // Best quality WebM codec
  'video/webm;codecs=vp8,opus',      // Fallback WebM codec
  'video/webm;codecs=h264,opus',     // H.264 in WebM container if supported
  'video/mp4;codecs=h264,aac',       // H.264 MP4 with AAC audio
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2'  // Fallback MP4
];

interface AnalysisMetadata extends Omit<StartVideoAnalysisJobParams, 'videoPath' | 'durationMs' | 'framerate'> {}

interface ScreenRecordingContextValue {
  isRecording: boolean;
  startTime: number | null;
  currentFileSizeBytes: number | null;
  diskSpaceWarning: { level: "warn" | "critical"; availableBytes: number } | null;
  startRecording: (options?: { recordAudio?: boolean; audioDeviceId?: string; frameRate?: number }, analysisMetadata?: AnalysisMetadata | null) => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
}

const ScreenRecordingContext = createContext<ScreenRecordingContextValue | undefined>(undefined);

interface ScreenRecordingProviderProps {
  children: ReactNode;
}

// State machine types
type RecordingState = {
  status: 'idle' | 'capturing' | 'recording' | 'stopping' | 'error';
  startTime: number | null;
  error: Error | null;
};

type RecordingAction =
  | { type: 'START_CAPTURE' }
  | { type: 'CAPTURE_SUCCESS' }
  | { type: 'CAPTURE_FAILURE'; payload: Error }
  | { type: 'START_RECORDING'; payload: { startTime: number } }
  | { type: 'STOP_RECORDING' }
  | { type: 'RESET' };

// Reducer function
function recordingReducer(state: RecordingState, action: RecordingAction): RecordingState {
  switch (action.type) {
    case 'START_CAPTURE':
      return { ...state, status: 'capturing', error: null };
    case 'CAPTURE_SUCCESS':
      return { ...state, status: 'recording' };
    case 'CAPTURE_FAILURE':
      return { ...state, status: 'error', error: action.payload, startTime: null };
    case 'START_RECORDING':
      return { ...state, status: 'recording', startTime: action.payload.startTime };
    case 'STOP_RECORDING':
      return { ...state, status: 'stopping' };
    case 'RESET':
      return { status: 'idle', startTime: null, error: null };
    default:
      return state;
  }
}

export function ScreenRecordingProvider({ children }: ScreenRecordingProviderProps) {
  const [state, dispatch] = useReducer(recordingReducer, {
    status: 'idle',
    startTime: null,
    error: null
  });

  // Refs for mutable objects
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const recordingOptionsRef = useRef<{ recordAudio: boolean; audioDeviceId: string; frameRate: number }>({
    recordAudio: true,
    audioDeviceId: 'default',
    frameRate: 5
  });
  const analysisMetadataRef = useRef<AnalysisMetadata | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const wasCancelledRef = useRef<boolean>(false);

  // Streaming to disk refs
  const recordingFilePathRef = useRef<string | null>(null);
  const appendQueueRef = useRef<Promise<void> | null>(null);
  const writtenBytesRef = useRef(0);

  // Disk space monitoring refs
  const diskIntervalRef = useRef<number | null>(null);
  const [diskSpaceWarning, setDiskSpaceWarning] = useState<{ level: "warn" | "critical"; availableBytes: number } | null>(null);

  // Helper function to clamp FPS
  const clampFps = useCallback((fps: number) => {
    return Math.min(VIDEO_ANALYSIS_MAX_FPS, Math.max(VIDEO_ANALYSIS_MIN_FPS, fps));
  }, []);

  // Helper function to enqueue append operations
  const enqueueAppend = useCallback((bytes: Uint8Array) => {
    const prev = appendQueueRef.current ?? Promise.resolve();
    const path = recordingFilePathRef.current;
    appendQueueRef.current = prev.then(async () => {
      if (!path) return;
      try {
        await invoke("append_binary_file_command", {
          path,
          content: Array.from(bytes),
          projectDirectory: null,
        });
        writtenBytesRef.current += bytes.byteLength;
      } catch (error) {
        console.error('Error appending to recording file:', error);
        throw error;
      }
    });
  }, []);

  // Helper function to start disk space polling
  const startDiskPolling = useCallback((filePath: string) => {
    // Clear any existing interval
    if (diskIntervalRef.current !== null) {
      window.clearInterval(diskIntervalRef.current);
    }

    diskIntervalRef.current = window.setInterval(async () => {
      try {
        const dirPath = await pathDirname(filePath);
        const { availableBytes } = await invoke<{ availableBytes: number }>("get_disk_space_command", {
          path: dirPath
        });

        // Define thresholds: 500MB for warning, 100MB for critical
        const WARNING_THRESHOLD = 500 * 1024 * 1024;
        const CRITICAL_THRESHOLD = 100 * 1024 * 1024;

        if (availableBytes < CRITICAL_THRESHOLD) {
          setDiskSpaceWarning({ level: "critical", availableBytes });
          window.dispatchEvent(new CustomEvent("recording-disk-space-critical", {
            detail: { availableBytes }
          }));
        } else if (availableBytes < WARNING_THRESHOLD) {
          setDiskSpaceWarning({ level: "warn", availableBytes });
          window.dispatchEvent(new CustomEvent("recording-disk-space-warning", {
            detail: { availableBytes }
          }));
        } else {
          setDiskSpaceWarning(null);
        }
      } catch (error) {
        console.error('Error checking disk space:', error);
      }
    }, 10000); // Check every 10 seconds
  }, []);

  // Centralized cleanup function
  const cleanup = useCallback(async () => {
    // Clear disk polling interval
    if (diskIntervalRef.current !== null) {
      window.clearInterval(diskIntervalRef.current);
      diskIntervalRef.current = null;
    }

    // Wait for append queue to flush
    if (appendQueueRef.current) {
      try {
        await appendQueueRef.current;
      } catch (error) {
        console.error('Error flushing append queue during cleanup:', error);
      }
    }

    // Stop all tracks
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    combinedStreamRef.current?.getTracks().forEach(track => track.stop());

    // Clear refs
    mediaRecorderRef.current = null;
    screenStreamRef.current = null;
    micStreamRef.current = null;
    combinedStreamRef.current = null;
    analysisMetadataRef.current = null;
    startTimeRef.current = null;
    wasCancelledRef.current = false;
    recordingFilePathRef.current = null;
    appendQueueRef.current = null;
    writtenBytesRef.current = 0;

    // Reset state
    setDiskSpaceWarning(null);
    dispatch({ type: 'RESET' });
  }, []);

  // Main effect for handling recording state changes
  useEffect(() => {
    const handleRecording = async () => {
      if (state.status === 'capturing') {
        const options = recordingOptionsRef.current;

        try {
          // Clamp frame rate to valid range
          const clampedFrameRate = clampFps(options.frameRate);

          // Capture display media
          const displayMediaOptions: DisplayMediaStreamOptions = {
            video: {
              frameRate: { ideal: clampedFrameRate, max: clampedFrameRate },
              width: { ideal: 1920, max: 3840 },
              height: { ideal: 1080, max: 2160 },
            },
            audio: options.recordAudio,
          };

          const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
          screenStreamRef.current = screenStream;
          
          let finalStream: MediaStream;
          
          if (options.recordAudio) {
            try {
              // Capture microphone
              const micOptions: MediaStreamConstraints = { 
                audio: options.audioDeviceId !== 'default' 
                  ? { deviceId: { exact: options.audioDeviceId } } 
                  : true, 
                video: false 
              };
              const micStream = await navigator.mediaDevices.getUserMedia(micOptions);
              micStreamRef.current = micStream;
              
              // Simplified stream merging using MediaStream constructor
              const videoTracks = screenStream.getVideoTracks();
              const audioTracks = [
                ...screenStream.getAudioTracks(),
                ...micStream.getAudioTracks()
              ];
              
              finalStream = new MediaStream([...videoTracks, ...audioTracks]);
            } catch (micError) {
              console.warn('Failed to access microphone, proceeding with screen audio only:', micError);
              finalStream = screenStream;
            }
          } else {
            finalStream = screenStream;
          }
          
          combinedStreamRef.current = finalStream;

          // Set up MediaRecorder
          const mimeType = MIME_CANDIDATES.find(MediaRecorder.isTypeSupported) || 'video/webm';
          const recorderOptions = {
            mimeType,
            videoBitsPerSecond: 5_000_000,  // 5 Mbps for high quality screen recording
            audioBitsPerSecond: 64_000      // 64 kbps for reduced audio quality
          };

          // Determine file extension based on MIME type
          let extension = 'webm';
          if (mimeType.includes('mp4')) {
            extension = 'mp4';
          }

          // Create recording file path before starting recorder
          const filePath = await invoke<string>('create_unique_filepath_command', {
            requestId: `screen-recording-${Date.now()}`,
            sessionName: 'screen-recordings',
            extension,
            targetDirName: 'videos',
            projectDirectory: null
          });
          recordingFilePathRef.current = filePath;

          // Start disk space monitoring
          startDiskPolling(filePath);

          const recorder = new MediaRecorder(finalStream, recorderOptions);
          mediaRecorderRef.current = recorder;

          // Stream data to disk instead of accumulating in memory
          recorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
              try {
                const arrayBuffer = await event.data.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                enqueueAppend(uint8Array);
              } catch (error) {
                console.error('Error processing data chunk:', error);
              }
            }
          };

          // Lifecycle event handler: recording started
          recorder.onstart = () => {
            window.dispatchEvent(new CustomEvent("recording-started", {
              detail: {
                filePath: recordingFilePathRef.current,
                frameRate: clampedFrameRate,
                startTime: startTimeRef.current
              }
            }));
          };

          // Lifecycle event handler: recording error
          recorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            window.dispatchEvent(new CustomEvent("recording-error", {
              detail: {
                error: event,
                filePath: recordingFilePathRef.current
              }
            }));
          };

          recorder.onstop = async () => {
            const filePath = recordingFilePathRef.current;

            if (!wasCancelledRef.current) {
              const startTime = startTimeRef.current;
              if (!startTime || !filePath) {
                await cleanup();
                return;
              }

              // Flush append queue before finishing
              if (appendQueueRef.current) {
                try {
                  await appendQueueRef.current;
                } catch (error) {
                  console.error('Error flushing append queue:', error);
                }
              }

              // Remux the video file to fix WebM container metadata (duration, bitrate)
              // This is necessary because streaming chunks directly to disk bypasses container finalization
              try {
                await invoke('remux_video_command', { path: filePath });
              } catch (error) {
                // Log the error but continue - the video file is still usable, just with missing metadata
                // The video analysis processor will fallback to probing duration from frames
                console.warn('Failed to remux video file (metadata may be incomplete):', error);
              }

              const durationMs = Date.now() - startTime;

              try {
                await emit('recording-finished', {
                  path: filePath,
                  durationMs,
                  frameRate: clampedFrameRate,
                  fileSizeBytes: writtenBytesRef.current
                });

                // Start video analysis job if metadata is provided
                if (analysisMetadataRef.current) {
                  try {
                    const result = await startVideoAnalysisJob({
                      ...analysisMetadataRef.current,
                      videoPath: filePath,
                      durationMs,
                      framerate: clampedFrameRate
                    });
                    await emit('video-analysis-started', { jobId: result.jobId });
                  } catch (error) {
                    console.error('Failed to start video analysis job:', error);
                  } finally {
                    analysisMetadataRef.current = null;
                  }
                }
              } catch (error) {
                console.error('Error finishing recording:', error);
              } finally {
                await cleanup();
              }
            } else {
              // Recording was cancelled - delete the file
              if (filePath) {
                // Flush any pending writes first
                if (appendQueueRef.current) {
                  try {
                    await appendQueueRef.current;
                  } catch (error) {
                    console.error('Error flushing append queue during cancellation:', error);
                  }
                }

                try {
                  await invoke('delete_file_command', {
                    path: filePath,
                    projectDirectory: null
                  });
                } catch (error) {
                  console.error('Error deleting cancelled recording file:', error);
                }
              }

              await emit('recording-cancelled', {});
              await cleanup();
            }
          };
          
          // Listen for video track ending (user stops sharing)
          const videoTrack = screenStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.addEventListener('ended', () => {
              window.dispatchEvent(new CustomEvent("recording-source-ended", {
                detail: {
                  filePath: recordingFilePathRef.current,
                  reason: 'user_stopped_sharing'
                }
              }));

              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
              }
            });
          }
          
          // Start recording
          const startTime = Date.now();
          startTimeRef.current = startTime;
          recorder.start(1000);
          
          dispatch({ type: 'START_RECORDING', payload: { startTime } });
        } catch (error) {
          console.error('Error starting recording:', error);
          await emit('recording-start-failed', { message: (error as Error).message });
          dispatch({ type: 'CAPTURE_FAILURE', payload: error as Error });
          cleanup();
        }
      } else if (state.status === 'stopping') {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          cleanup();
        }
      }
    };

    handleRecording();
  }, [state.status, state.startTime, cleanup, clampFps, enqueueAppend, startDiskPolling]);

  // Effect to listen for backend stop recording request
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen('stop-recording-request', () => {
        if (state.status === 'recording') {
          dispatch({ type: 'STOP_RECORDING' });
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [state.status]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (state.status !== 'idle') {
        cleanup();
      }
    };
  }, []);

  // Public API functions
  const startRecording = useCallback(async (options: { recordAudio?: boolean; audioDeviceId?: string; frameRate?: number } = {}, analysisMetadata?: AnalysisMetadata | null) => {
    if (state.status !== 'idle') {
      console.warn('Recording already in progress or in an invalid state');
      return;
    }

    wasCancelledRef.current = false;

    // Clamp and store options and metadata for use in the effect
    const clampedFrameRate = clampFps(options.frameRate ?? 5);
    recordingOptionsRef.current = {
      recordAudio: options.recordAudio ?? true,
      audioDeviceId: options.audioDeviceId ?? 'default',
      frameRate: clampedFrameRate
    };

    analysisMetadataRef.current = analysisMetadata ?? null;

    dispatch({ type: 'START_CAPTURE' });
  }, [state.status, clampFps]);

  const stopRecording = useCallback(() => {
    if (state.status === 'recording') {
      dispatch({ type: 'STOP_RECORDING' });
    }
  }, [state.status]);

  const cancelRecording = useCallback(() => {
    wasCancelledRef.current = true;
    stopRecording();
  }, [stopRecording]);

  // Memoized context value
  const value = useMemo<ScreenRecordingContextValue>(() => ({
    isRecording: state.status === 'capturing' || state.status === 'recording',
    startTime: state.startTime,
    currentFileSizeBytes: writtenBytesRef.current || null,
    diskSpaceWarning,
    startRecording,
    stopRecording,
    cancelRecording
  }), [state.status, state.startTime, diskSpaceWarning, startRecording, stopRecording, cancelRecording]);

  return (
    <ScreenRecordingContext.Provider value={value}>
      {children}
    </ScreenRecordingContext.Provider>
  );
}

export function useScreenRecording() {
  const context = useContext(ScreenRecordingContext);
  if (!context) {
    throw new Error('useScreenRecording must be used within a ScreenRecordingProvider');
  }
  return context;
}