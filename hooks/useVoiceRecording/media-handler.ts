/**
 * MediaRecorder handling utility functions for voice recording
 */

interface MediaSetupOptions {
  onDataAvailable: (chunk: Blob) => void;
  onError: (error: string) => void;
  onStop: () => void;
}

interface MediaSetupResult {
  stream: MediaStream;
  recorder: MediaRecorder;
}

/**
 * Sets up the media stream and recorder for voice input
 */
export async function setupMedia({
  onDataAvailable,
  onError,
  onStop,
}: MediaSetupOptions): Promise<MediaSetupResult | null> {
  try {
    // Request audio with higher quality settings for better transcription results
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true, 
        autoGainControl: true,
        // Try to use higher sample rate if available
        sampleRate: 44100,
        // Request higher bitrate if available
        channelCount: 1, // Mono is better for speech recognition
      },
    });

    // Check if MediaRecorder is supported
    if (!window.MediaRecorder) {
      onError('MediaRecorder not supported in this browser');
      return null;
    }

    // Define MIME type options in order of preference for Whisper compatibility
    // Whisper works best with webm, mp3, wav, and flac formats
    const mimeTypePreference = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg; codecs=opus',
      'audio/wav',
      'audio/flac',
      ''  // Empty string as last resort (browser default)
    ];
    
    // Find the first supported MIME type
    const mimeType = mimeTypePreference.find(type => {
      return type === '' || MediaRecorder.isTypeSupported(type);
    });

    console.log(`[MediaHandler] Using MIME type: ${mimeType || 'browser default'}`);
    
    // Configure the MediaRecorder with optimized settings
    const recorderOptions: MediaRecorderOptions = {
      mimeType: mimeType || undefined
    };
    
    // Check if we can set audio bitrate on some browsers
    if ('audioBitsPerSecond' in MediaRecorder.prototype) {
      // @ts-ignore - This is a non-standard option but works in some browsers
      recorderOptions.audioBitsPerSecond = 128000; // 128 kbps is good for speech
    }

    const recorder = new MediaRecorder(stream, recorderOptions);

    // Add an event handler for when recording starts
    recorder.onstart = () => {
      console.log('[MediaHandler] Recording started successfully');
      
      // Force a data available event after a short delay to ensure we're capturing
      setTimeout(() => {
        if (recorder.state === 'recording') {
          console.log('[MediaHandler] Requesting data from recorder via requestData()');
          recorder.requestData();
        }
      }, 1000);
    };

    // Handle data chunks as they become available
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        console.log(`[MediaHandler] Received audio chunk size: ${event.data.size} bytes, type: ${event.data.type}`);
        onDataAvailable(event.data);
      } else {
        console.warn('[MediaHandler] Received empty audio chunk');
      }
    };

    // Log more detailed error information
    recorder.onerror = (event) => {
      // Get detailed error info when available
      const errorDetails = event.error ? 
        `${event.error.name}: ${event.error.message}` : 
        'Unknown MediaRecorder error';
        
      console.error(`[MediaHandler] MediaRecorder error: ${errorDetails}`, event);
      onError(`Error during recording: ${errorDetails}. Please try again.`);
    };

    // Handle recorder stop event
    recorder.onstop = () => {
      console.log('[MediaHandler] Recording stopped');
      onStop();
    };

    return { stream, recorder };
  } catch (error) {
    console.error('Media setup error:', error);
    
    // Format user-friendly error message based on error type
    let errorMessage = 'Could not access microphone.';
    
    if (error instanceof Error) {
      // Check for permission error
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
      } 
      // Check for device not found error
      else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone detected. Please connect a microphone and try again.';
      }
      // Check for secure context requirement
      else if (error.name === 'SecurityError') {
        errorMessage = 'Recording requires a secure connection (HTTPS).';
      }
      // Add specific error detail for debugging
      errorMessage += ` (${error.name}: ${error.message})`;
    }
    
    onError(errorMessage);
    return null;
  }
}

/**
 * Cleans up media resources
 */
export function cleanupMedia(
  recorder: MediaRecorder | null, 
  stream: MediaStream | null
): void {
  // Stop the recorder if it's active
  if (recorder && recorder.state !== 'inactive') {
    try {
      recorder.stop();
    } catch (e) {
      console.error('Error stopping recorder:', e);
    }
  }

  // Stop all tracks in the stream
  if (stream) {
    try {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch (e) {
      console.error('Error stopping media stream tracks:', e);
    }
  }
} 