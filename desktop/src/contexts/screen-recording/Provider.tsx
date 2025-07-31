import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
];

interface ScreenRecordingContextValue {
  isRecording: boolean;
  startTime: number | null;
  startRecording: (options?: { recordAudio?: boolean; audioDeviceId?: string; frameRate?: number }) => Promise<void>;
  stopRecording: () => void;
}

const ScreenRecordingContext = createContext<ScreenRecordingContextValue | undefined>(undefined);

interface ScreenRecordingProviderProps {
  children: ReactNode;
}

export function ScreenRecordingProvider({ children }: ScreenRecordingProviderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const frameRateRef = useRef<number>(5);

  const mergeAudioStreams = (screenStream: MediaStream, micStream: MediaStream): MediaStream => {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    const screenAudioTracks = screenStream.getAudioTracks();
    if (screenAudioTracks.length > 0) {
      const screenSource = audioContext.createMediaStreamSource(new MediaStream(screenAudioTracks));
      screenSource.connect(destination);
    }

    const micAudioTracks = micStream.getAudioTracks();
    if (micAudioTracks.length > 0) {
      const micSource = audioContext.createMediaStreamSource(new MediaStream(micAudioTracks));
      micSource.connect(destination);
    }

    return destination.stream;
  };

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startRecording = useCallback(async (options: { recordAudio?: boolean; audioDeviceId?: string; frameRate?: number } = {}) => {
    const { recordAudio = true, audioDeviceId = 'default', frameRate = 5 } = options;
    if (isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    const recordingStartTime = Date.now();
    setStartTime(recordingStartTime);
    frameRateRef.current = frameRate;
    chunksRef.current = [];
    
    try {
      const displayMediaOptions = {
        video: {
          frameRate: { ideal: frameRate, max: frameRate },
        },
        audio: recordAudio,
      };
      const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      screenStreamRef.current = screenStream;
      
      let finalStream: MediaStream;
      
      if (recordAudio) {
        try {
          const micOptions: MediaStreamConstraints = { 
            audio: audioDeviceId !== 'default' ? { deviceId: { exact: audioDeviceId } } : true, 
            video: false 
          };
          micStreamRef.current = await navigator.mediaDevices.getUserMedia(micOptions);
          
          const mergedAudioStream = mergeAudioStreams(screenStream, micStreamRef.current);
          finalStream = new MediaStream([
            ...screenStream.getVideoTracks(),
            ...mergedAudioStream.getAudioTracks()
          ]);
        } catch (micError) {
          console.warn('Failed to access microphone, proceeding with screen audio only:', micError);
          finalStream = screenStream;
        }
      } else {
        finalStream = screenStream;
      }
      
      streamRef.current = finalStream;
      setIsRecording(true);
      
      const mimeType = MIME_CANDIDATES.find(MediaRecorder.isTypeSupported) || 'video/webm';
      
      const RECORDER_OPTIONS = {
        mimeType,
        videoBitsPerSecond: 1_500_000,
        audioBitsPerSecond: 64_000
      };
      
      const recorder = new MediaRecorder(finalStream, RECORDER_OPTIONS);
      recorderRef.current = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = async () => {
        const durationMs = Date.now() - recordingStartTime;
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
            targetDirName: 'videos'
          });
          
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          await invoke('write_binary_file_command', {
            path: filePath,
            content: Array.from(uint8Array),
            projectDirectory: null
          });
          
          setIsRecording(false);
          setStartTime(null);
          streamRef.current = null;
          screenStreamRef.current = null;
          micStreamRef.current = null;
          recorderRef.current = null;
          chunksRef.current = [];
          
          await emit('recording-finished', { 
            path: filePath, 
            durationMs, 
            frameRate: frameRateRef.current 
          });
        } catch (error) {
          console.error('Error saving recording:', error);
          setIsRecording(false);
          setStartTime(null);
          streamRef.current = null;
          screenStreamRef.current = null;
          micStreamRef.current = null;
          recorderRef.current = null;
          chunksRef.current = [];
        }
      };
      
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          stopRecording();
        });
      }
      
      recorder.start(1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
      setStartTime(null);
      streamRef.current = null;
      screenStreamRef.current = null;
      micStreamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
    }
  }, [isRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, []);

  const value: ScreenRecordingContextValue = {
    isRecording,
    startTime,
    startRecording,
    stopRecording
  };

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