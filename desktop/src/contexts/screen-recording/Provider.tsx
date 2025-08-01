import { createContext, useContext, useReducer, useCallback, useRef, useEffect, ReactNode, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { startVideoAnalysisJob, type StartVideoAnalysisJobParams } from '@/actions/video-analysis/start-video-analysis.action';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',      // Best quality WebM codec
  'video/webm;codecs=vp8,opus',      // Fallback WebM codec
  'video/webm;codecs=h264,opus',     // H.264 in WebM container if supported
  'video/mp4;codecs=h264,aac',       // H.264 MP4 with AAC audio
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2'  // Fallback MP4
];

interface AnalysisMetadata extends Omit<StartVideoAnalysisJobParams, 'videoPath' | 'durationMs'> {}

interface ScreenRecordingContextValue {
  isRecording: boolean;
  startTime: number | null;
  startRecording: (options?: { recordAudio?: boolean; audioDeviceId?: string; frameRate?: number }, analysisMetadata?: AnalysisMetadata | null) => Promise<void>;
  stopRecording: () => void;
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
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingOptionsRef = useRef<{ recordAudio: boolean; audioDeviceId: string; frameRate: number }>({
    recordAudio: true,
    audioDeviceId: 'default',
    frameRate: 5
  });
  const analysisMetadataRef = useRef<AnalysisMetadata | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Centralized cleanup function
  const cleanup = useCallback(() => {
    // Stop all tracks
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    combinedStreamRef.current?.getTracks().forEach(track => track.stop());
    
    // Clear refs
    mediaRecorderRef.current = null;
    screenStreamRef.current = null;
    micStreamRef.current = null;
    combinedStreamRef.current = null;
    chunksRef.current = [];
    analysisMetadataRef.current = null;
    startTimeRef.current = null;
    
    // Reset state
    dispatch({ type: 'RESET' });
  }, []);

  // Main effect for handling recording state changes
  useEffect(() => {
    const handleRecording = async () => {
      if (state.status === 'capturing') {
        const options = recordingOptionsRef.current;
        
        try {
          // Capture display media
          const displayMediaOptions: DisplayMediaStreamOptions = {
            video: {
              frameRate: { ideal: options.frameRate, max: options.frameRate },
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
            videoBitsPerSecond: 1_500_000,  // 1.5 Mbps for screen recording
            audioBitsPerSecond: 128_000     // 128 kbps for better audio quality
          };
          
          const recorder = new MediaRecorder(finalStream, recorderOptions);
          mediaRecorderRef.current = recorder;
          
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              chunksRef.current.push(event.data);
            }
          };
          
          recorder.onstop = async () => {
            const startTime = startTimeRef.current;
            if (!startTime) {
              cleanup();
              return;
            }
            
            const durationMs = Date.now() - startTime;
            const recorderMimeType = recorder.mimeType || mimeType;
            const blob = new Blob(chunksRef.current, { type: recorderMimeType });
            
            let extension = 'webm';
            if (recorderMimeType.includes('mp4')) {
              extension = 'mp4';
            }
            
            try {
              const filePath = await invoke<string>('create_unique_filepath_command', {
                requestId: `screen-recording-${Date.now()}`,
                sessionName: 'screen-recordings',
                extension,
                targetDirName: 'videos',
                projectDirectory: analysisMetadataRef.current?.projectDirectory ?? null
              });
              
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              
              await invoke('write_binary_file_command', {
                path: filePath,
                content: Array.from(uint8Array),
                projectDirectory: analysisMetadataRef.current?.projectDirectory ?? null
              });
              
              await emit('recording-finished', { 
                path: filePath, 
                durationMs, 
                frameRate: options.frameRate 
              });
              
              // Start video analysis job if metadata is provided
              if (analysisMetadataRef.current) {
                try {
                  const result = await startVideoAnalysisJob({
                    ...analysisMetadataRef.current,
                    videoPath: filePath,
                    durationMs
                  });
                  await emit('video-analysis-started', { jobId: result.jobId });
                } catch (error) {
                  console.error('Failed to start video analysis job:', error);
                } finally {
                  analysisMetadataRef.current = null;
                }
              }
            } catch (error) {
              console.error('Error saving recording:', error);
            } finally {
              cleanup();
            }
          };
          
          // Listen for video track ending (user stops sharing)
          const videoTrack = screenStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.addEventListener('ended', () => {
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
          dispatch({ type: 'CAPTURE_SUCCESS' });
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
  }, [state.status, state.startTime, cleanup]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.status !== 'idle') {
        cleanup();
      }
    };
  }, [state.status, cleanup]);

  // Public API functions
  const startRecording = useCallback(async (options: { recordAudio?: boolean; audioDeviceId?: string; frameRate?: number } = {}, analysisMetadata?: AnalysisMetadata | null) => {
    if (state.status !== 'idle') {
      console.warn('Recording already in progress or in an invalid state');
      return;
    }

    // Store options and metadata for use in the effect
    recordingOptionsRef.current = {
      recordAudio: options.recordAudio ?? true,
      audioDeviceId: options.audioDeviceId ?? 'default',
      frameRate: options.frameRate ?? 5
    };
    
    analysisMetadataRef.current = analysisMetadata ?? null;

    dispatch({ type: 'START_CAPTURE' });
  }, [state.status]);

  const stopRecording = useCallback(() => {
    if (state.status === 'recording') {
      dispatch({ type: 'STOP_RECORDING' });
    }
  }, [state.status]);

  // Memoized context value
  const value = useMemo<ScreenRecordingContextValue>(() => ({
    isRecording: state.status === 'capturing' || state.status === 'recording',
    startTime: state.startTime,
    startRecording,
    stopRecording
  }), [state.status, state.startTime, startRecording, stopRecording]);

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