import { useState, useCallback, useRef, useEffect } from 'react';
import { setupMedia, cleanupMedia } from './media-handler';
import { handleTranscription, handleCorrection, validateTranscriptionText, processBackgroundJob } from './transcription-handler';
import { useBackgroundJob } from '@/lib/contexts/background-jobs-context';
import { ActionState } from "@/types";
import { JOB_STATUSES } from "@/types/session-types";

interface UseVoiceRecordingProps {
  sessionId?: string | null;
  language?: string;
  languageCode?: string;
  autoCorrect?: boolean;
  onStateChange?: (state: {
    isRecording: boolean;
    isProcessing: boolean;
    error: string | null;
  }) => void;
  onTranscribed?: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  onInteraction?: () => void;
}

interface UseVoiceRecordingResult {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  rawText: string | null;
  correctedText: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  retryLastRecording: () => Promise<void>;
  textStatus?: 'loading' | 'done' | 'error';
}

export function useVoiceRecording({
  sessionId = null,
  language = 'en',
  autoCorrect = true,
  onStateChange,
  onTranscribed,
  onCorrectionComplete
}: UseVoiceRecordingProps = {}): UseVoiceRecordingResult {
  // State management
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [textStatus, setTextStatus] = useState<'loading' | 'done' | 'error' | undefined>(undefined);
  
  // Refs for MediaRecorder objects
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Save the last blob for retry capability
  const lastAudioBlobRef = useRef<Blob | null>(null);
  
  // Track background job ID - we now use a single job for both transcription and correction
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(null);
  
  // Keep track of already processed jobs to prevent duplicate processing
  const processedJobsRef = useRef<Set<string>>(new Set());
  
  // Get the background job from context
  const transcriptionJob = useBackgroundJob(transcriptionJobId);
  
  // Updates the state and calls the onStateChange callback
  const updateState = useCallback((newState: Partial<{
    isRecording: boolean;
    isProcessing: boolean;
    error: string | null;
  }>) => {
    // Update local state
    if (newState.isRecording !== undefined) setIsRecording(newState.isRecording);
    if (newState.isProcessing !== undefined) setIsProcessing(newState.isProcessing);
    if (newState.error !== undefined) setError(newState.error);
    
    // Call onStateChange with the full updated state
    onStateChange?.({
      isRecording: newState.isRecording ?? isRecording,
      isProcessing: newState.isProcessing ?? isProcessing,
      error: newState.error ?? error,
    });
  }, [isRecording, isProcessing, error, onStateChange]);
  
  // Start recording
  const startRecording = useCallback(async () => {
    // Reset previous recording data
    setRawText(null);
    setCorrectedText(null);
    setTextStatus(undefined);
    setError(null);
    audioChunksRef.current = [];
    
    // Set up media and recorder
    const media = await setupMedia({
      onDataAvailable: (chunk) => {
        console.log(`[VoiceRecording] Data available event received, chunk size: ${chunk.size} bytes`);
        audioChunksRef.current.push(chunk);
      },
      onError: (errorMsg) => {
        updateState({ isRecording: false, error: errorMsg });
      },
      onStop: () => {
        // This is handled by stopRecording
      }
    });
    
    if (!media) {
      // Error is already reported via onError callback
      return;
    }
    
    // Store references
    streamRef.current = media.stream;
    recorderRef.current = media.recorder;
    
    // Start recording with a timeslice to ensure ondataavailable events fire periodically
    // 10000ms (10 seconds) is a good balance - not too frequent but ensures we get chunks during recording
    recorderRef.current.start(10000); // Request data every 10 seconds
    
    // Also set up a manual requestData call every 3 seconds as a backup
    const interval = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        try {
          console.log('[VoiceRecording] Manually requesting data from recorder');
          recorderRef.current.requestData();
        } catch (err) {
          console.warn('[VoiceRecording] Error requesting data:', err);
        }
      } else {
        clearInterval(interval);
      }
    }, 3000);
    
    // Store the interval so we can clear it on stop
    const intervalId = interval as unknown as number;
    
    // Clear the interval when recording stops
    const originalStop = recorderRef.current.onstop;
    recorderRef.current.onstop = (ev) => {
      clearInterval(intervalId);
      if (originalStop && recorderRef.current) originalStop.call(recorderRef.current, ev);
    };
    
    console.log('[VoiceRecording] Recording started');
    updateState({ isRecording: true, error: null });
  }, [updateState]);
  
  // Stop recording and process audio
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      console.log('[VoiceRecording] Recorder already inactive');
      updateState({ isRecording: false });
      return;
    }
    
    try {
      // Make one final request for data before stopping
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        console.log('[VoiceRecording] Making final requestData() call before stopping');
        try {
          recorderRef.current.requestData();
          
          // Wait a short moment to make sure the data is collected
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.warn('[VoiceRecording] Error in final requestData:', err);
        }
      }
      
      // Stop the recorder - this will finalize the data
      console.log('[VoiceRecording] Stopping recorder...');
      recorderRef.current.stop();
      updateState({ isRecording: false, isProcessing: true });
      
      // Create a blob from all the audio chunks
      console.log(`[VoiceRecording] Audio chunks captured: ${audioChunksRef.current.length}`);
      
      if (audioChunksRef.current.length > 0) {
        // Log individual chunk sizes for debugging
        audioChunksRef.current.forEach((chunk, index) => {
          console.log(`[VoiceRecording] Chunk ${index} size: ${chunk.size} bytes`);
        });
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log(`[VoiceRecording] Created audio blob with size: ${audioBlob.size} bytes`);
        
        // Save the blob for potential retry
        lastAudioBlobRef.current = audioBlob;
        
        // Check if blob size is too small, which might indicate no actual audio was recorded
        if (audioBlob.size < 1000) {
          console.error(`[VoiceRecording] Audio blob size too small: ${audioBlob.size} bytes - minimum required: 1000 bytes`);
          updateState({ error: 'No audio recorded or audio too short' });
          setTextStatus('error');
          return;
        }
        
        // Validate sessionId is either string or null
        if (sessionId !== null && typeof sessionId !== 'string') {
          console.error(`[VoiceRecording] Invalid sessionId type: ${typeof sessionId}, value:`, sessionId);
          updateState({ error: 'Invalid session ID format' });
          setTextStatus('error');
          return;
        }
        
        // Send for transcription
        setTextStatus('loading');
        console.log(`[VoiceRecording] Sending ${audioBlob.size} bytes for transcription`);
        const result = await handleTranscription(audioBlob, sessionId);
        
        if (result.isSuccess && result.data) {
          // Check if we received a background job
          if (typeof result.data === 'object' && 'isBackgroundJob' in result.data && result.data.jobId) {
            console.log(`[VoiceRecording] Transcription submitted as background job: ${result.data.jobId}`);
            // Store the job ID for tracking
            setTranscriptionJobId(result.data.jobId);
          } else if (typeof result.metadata === 'object' && result.metadata && 'jobId' in result.metadata) {
            // Alternative format - jobId in metadata
            console.log(`[VoiceRecording] Transcription job ID found in metadata: ${result.metadata.jobId}`);
            setTranscriptionJobId(result.metadata.jobId);
            
            // Handle immediate text result
            if (typeof result.data === 'string') {
              const transcriptionText = result.data;
              
              // Validate the transcription text
              const validation = validateTranscriptionText(transcriptionText);
              
              if (!validation.isValid) {
                console.warn(`[VoiceRecording] Invalid transcription: ${validation.reason}`);
                updateState({ 
                  isProcessing: false, 
                  error: `Failed to process voice: ${validation.reason || 'Invalid transcription'}`
                });
                setTextStatus('error');
                return;
              }
              
              // Set the raw transcribed text
              setRawText(transcriptionText);
              
              // If auto-correct is enabled, send for correction
              if (autoCorrect) {
                const correctionResult = await handleCorrection(transcriptionText, sessionId, transcriptionJobId);
                
                if (correctionResult.isSuccess && correctionResult.data) {
                  if (typeof correctionResult.data === 'object' && 'isBackgroundJob' in correctionResult.data && correctionResult.data.jobId) {
                    // Correction is running in the background, store the job ID
                    console.log(`[VoiceRecording] Correction submitted as background job: ${correctionResult.data.jobId}`);
                    // Job ID is now tracked in transcriptionJobId only
                  } else if (typeof correctionResult.metadata === 'object' && correctionResult.metadata && 'jobId' in correctionResult.metadata) {
                    // jobId in metadata
                    console.log(`[VoiceRecording] Correction job ID found in metadata: ${correctionResult.metadata.jobId}`);
                    
                    if (typeof correctionResult.data === 'string') {
                      // Got immediate text result with job ID in metadata
                      setCorrectedText(correctionResult.data);
                    }
                  } else if (typeof correctionResult.data === 'string') {
                    // We received the corrected text immediately
                    setCorrectedText(correctionResult.data);
                  }
                } else if (correctionResult.message) {
                  // Non-critical error in correction (we still have the raw text)
                  console.warn(`[VoiceRecording] Correction warning: ${correctionResult.message}`);
                }
              }
              
              setTextStatus('done');
            }
          } else if (typeof result.data === 'string') {
            // We directly received the transcribed text
            const transcriptionText = result.data;
            
            // Validate the transcription text
            const validation = validateTranscriptionText(transcriptionText);
            
            if (!validation.isValid) {
              console.warn(`[VoiceRecording] Invalid transcription: ${validation.reason}`);
              updateState({ 
                isProcessing: false, 
                error: `Failed to process voice: ${validation.reason || 'Invalid transcription'}`
              });
              setTextStatus('error');
              return;
            }
            
            // Set the raw transcribed text
            setRawText(transcriptionText);
            
            // If auto-correct is enabled, send for correction
            if (autoCorrect) {
              const correctionResult = await handleCorrection(transcriptionText, sessionId, transcriptionJobId);
              
              if (correctionResult.isSuccess && correctionResult.data) {
                if (typeof correctionResult.data === 'object' && 'isBackgroundJob' in correctionResult.data && correctionResult.data.jobId) {
                  // Correction is running in the background, store the job ID
                  console.log(`[VoiceRecording] Correction submitted as background job: ${correctionResult.data.jobId}`);
                  // Job ID is now tracked in transcriptionJobId only
                } else if (typeof correctionResult.metadata === 'object' && correctionResult.metadata && 'jobId' in correctionResult.metadata) {
                  // jobId in metadata
                  console.log(`[VoiceRecording] Correction job ID found in metadata: ${correctionResult.metadata.jobId}`);
                  
                  if (typeof correctionResult.data === 'string') {
                    setCorrectedText(correctionResult.data);
                  }
                } else if (typeof correctionResult.data === 'string') {
                  // We received the corrected text immediately
                  setCorrectedText(correctionResult.data);
                }
              } else if (correctionResult.message) {
                // Non-critical error in correction (we still have the raw text)
                console.warn(`[VoiceRecording] Correction warning: ${correctionResult.message}`);
              }
            }
            
            setTextStatus('done');
          }
        } else {
          console.error(`[VoiceRecording] Transcription failed: ${result.message}`);
          updateState({ 
            error: result.message || 'Failed to transcribe audio'
          });
          setTextStatus('error');
        }
      } else {
        console.error('[VoiceRecording] No audio chunks captured during recording');
        
        // Try to get audio data directly from the stream as a fallback
        if (streamRef.current) {
          try {
            console.log('[VoiceRecording] Attempting fallback recording method using stream tracks');
            
            // Create a new MediaRecorder for the current stream
            const fallbackRecorder = new MediaRecorder(streamRef.current);
            const fallbackChunks: Blob[] = [];
            
            // Set up fallback recorder
            fallbackRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                console.log(`[VoiceRecording] Fallback received chunk: ${event.data.size} bytes`);
                fallbackChunks.push(event.data);
              }
            };
            
            // Create a promise to wait for the fallback recording
            await new Promise<void>((resolve, reject) => {
              fallbackRecorder.onstop = () => {
                if (fallbackChunks.length > 0) {
                  resolve();
                } else {
                  reject(new Error('No audio captured by fallback recorder'));
                }
              };
              
              fallbackRecorder.onerror = (error) => {
                reject(error);
              };
              
              // Start recording for a short time
              fallbackRecorder.start();
              
              // Stop after 1 second - we just need some audio data
              setTimeout(() => {
                if (fallbackRecorder.state === 'recording') {
                  fallbackRecorder.stop();
                }
              }, 1000);
            });
            
            // If we got here, we have some audio chunks in the fallback recorder
            if (fallbackChunks.length > 0) {
              console.log(`[VoiceRecording] Fallback captured ${fallbackChunks.length} chunks`);
              
              const fallbackBlob = new Blob(fallbackChunks, { type: 'audio/webm' });
              if (fallbackBlob.size > 1000) {
                console.log(`[VoiceRecording] Using fallback blob of size ${fallbackBlob.size} bytes`);
                
                // Send for transcription
                setTextStatus('loading');
                console.log(`[VoiceRecording] Sending fallback audio (${fallbackBlob.size} bytes) for transcription`);
                const result = await handleTranscription(fallbackBlob, sessionId);
                
                if (result.isSuccess && result.data) {
                  // Process transcription as normal
                  setRawText(typeof result.data === 'string' ? result.data : null);
                  setTextStatus('done');
                } else {
                  updateState({ 
                    error: result.message || 'Failed to transcribe audio'
                  });
                  setTextStatus('error');
                }
                
                // Exit the function early since we processed with the fallback
                return;
              }
            }
          } catch (fallbackError) {
            console.error('[VoiceRecording] Fallback recording method failed:', fallbackError);
          }
        }
        
        // If we get here, even the fallback didn't work
        updateState({ error: 'No audio recorded. Please check your microphone and try again.' });
        setTextStatus('error');
      }
    } catch (err) {
      console.error('[VoiceRecording] Error in stopRecording:', err);
      updateState({ 
        error: err instanceof Error ? err.message : 'Error processing recording'
      });
      setTextStatus('error');
    } finally {
      // Clean up media resources
      cleanupMedia(recorderRef.current, streamRef.current);
      recorderRef.current = null;
      streamRef.current = null;
      updateState({ isProcessing: false });
    }
  }, [updateState, language, sessionId, autoCorrect]);
  
  // Reset the recording state
  const reset = useCallback(() => {
    // Clean up any existing media
    cleanupMedia(recorderRef.current, streamRef.current);
    recorderRef.current = null;
    streamRef.current = null;
    
    // Clear all state
    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
    setRawText(null);
    setCorrectedText(null);
    setTextStatus(undefined);
    audioChunksRef.current = [];
  }, []);
  
  // New function to retry the last recording
  const retryLastRecording = useCallback(async () => {
    // Check if we have a stored audio blob
    if (!lastAudioBlobRef.current) {
      console.error('[VoiceRecording] No previous recording available to retry');
      updateState({ error: 'No previous recording available to retry' });
      setTextStatus('error');
      return;
    }
    
    try {
      // Reset error state and set processing
      updateState({ error: null, isProcessing: true });
      setTextStatus('loading');
      
      // Reset job ID to ensure we create a new job
      setTranscriptionJobId(null);
      
      const audioBlob = lastAudioBlobRef.current;
      console.log(`[VoiceRecording] Retrying with saved audio blob: ${audioBlob.size} bytes`);
      
      // Validate sessionId is either string or null
      if (sessionId !== null && typeof sessionId !== 'string') {
        console.error(`[VoiceRecording] Invalid sessionId type: ${typeof sessionId}, value:`, sessionId);
        updateState({ error: 'Invalid session ID format' });
        setTextStatus('error');
        return;
      }
      
      // Send for transcription
      console.log(`[VoiceRecording] Sending ${audioBlob.size} bytes for transcription (retry)`);
      const result = await handleTranscription(audioBlob, sessionId);
      
      if (result.isSuccess && result.data) {
        // Check if we received a background job
        if (typeof result.data === 'object' && 'isBackgroundJob' in result.data && result.data.jobId) {
          console.log(`[VoiceRecording] Retry transcription submitted as background job: ${result.data.jobId}`);
          // Store the job ID for tracking
          setTranscriptionJobId(result.data.jobId);
        } else if (typeof result.metadata === 'object' && result.metadata && 'jobId' in result.metadata) {
          // Alternative format - jobId in metadata
          console.log(`[VoiceRecording] Retry transcription job ID found in metadata: ${result.metadata.jobId}`);
          setTranscriptionJobId(result.metadata.jobId);
          
          if (typeof result.data === 'string') {
            // Handle immediate text result
            const transcriptionText = result.data;
            const validation = validateTranscriptionText(transcriptionText);
            
            if (!validation.isValid) {
              console.warn(`[VoiceRecording] Invalid transcription in retry: ${validation.reason}`);
              updateState({ 
                isProcessing: false, 
                error: `Failed to process voice: ${validation.reason || 'Invalid transcription'}`
              });
              setTextStatus('error');
              return;
            }
            
            setRawText(transcriptionText);
            
            // Process correction if auto-correct is enabled
            if (autoCorrect) {
              const correctionResult = await handleCorrection(transcriptionText, sessionId, transcriptionJobId);
              handleCorrectionResult(correctionResult);
            }
            
            setTextStatus('done');
          }
        } else if (typeof result.data === 'string') {
          // Process immediate text result
          const transcriptionText = result.data;
          const validation = validateTranscriptionText(transcriptionText);
          
          if (!validation.isValid) {
            console.warn(`[VoiceRecording] Invalid transcription in retry: ${validation.reason}`);
            updateState({ 
              isProcessing: false, 
              error: `Failed to process voice: ${validation.reason || 'Invalid transcription'}`
            });
            setTextStatus('error');
            return;
          }
          
          setRawText(transcriptionText);
          
          // Process correction if auto-correct is enabled
          if (autoCorrect) {
            const correctionResult = await handleCorrection(transcriptionText, sessionId, transcriptionJobId);
            
            if (correctionResult.isSuccess && correctionResult.data) {
              if (typeof correctionResult.data === 'object' && 'isBackgroundJob' in correctionResult.data && correctionResult.data.jobId) {
                console.log(`[VoiceRecording] Correction submitted as background job: ${correctionResult.data.jobId}`);
                // Job ID is now tracked in transcriptionJobId only
              } else if (typeof correctionResult.metadata === 'object' && correctionResult.metadata && 'jobId' in correctionResult.metadata) {
                console.log(`[VoiceRecording] Correction job ID found in metadata: ${correctionResult.metadata.jobId}`);
                
                if (typeof correctionResult.data === 'string') {
                  setCorrectedText(correctionResult.data);
                }
              } else if (typeof correctionResult.data === 'string') {
                setCorrectedText(correctionResult.data);
              }
            }
          }
          
          setTextStatus('done');
        }
      } else {
        console.error(`[VoiceRecording] Retry transcription failed: ${result.message}`);
        updateState({ 
          error: result.message || 'Failed to transcribe audio'
        });
        setTextStatus('error');
      }
    } catch (err) {
      console.error('[VoiceRecording] Error in retryLastRecording:', err);
      updateState({ 
        error: err instanceof Error ? err.message : 'Error processing recording'
      });
      setTextStatus('error');
    } finally {
      updateState({ isProcessing: false });
    }
  }, [updateState, sessionId, autoCorrect]);
  
  // Helper function to handle correction results (reused in multiple places)
  const handleCorrectionResult = useCallback((correctionResult: ActionState<string | { isBackgroundJob: true; jobId: string }>) => {
    if (correctionResult.isSuccess && correctionResult.data) {
      if (typeof correctionResult.data === 'string') {
        setCorrectedText(correctionResult.data);
        
        // Notify listeners if we have both raw and corrected text
        if (onCorrectionComplete && rawText) {
          onCorrectionComplete(rawText, correctionResult.data);
        }
        
        // Update form with corrected text
        if (onTranscribed) {
          onTranscribed(correctionResult.data);
        }
      }
    } else if (correctionResult.message) {
      console.warn(`[VoiceRecording] Correction warning: ${correctionResult.message}`);
    }
  }, [onCorrectionComplete, onTranscribed, rawText]);
  
  // Monitor transcription job - now handles both transcription and correction phases
  useEffect(() => {
    if (transcriptionJobId && transcriptionJob) {
      // Skip if we've already processed this job
      if (processedJobsRef.current.has(transcriptionJobId)) {
        return;
      }
      
      const statusMsg = transcriptionJob.job?.statusMessage || '';
      const isCorrectionPhase = statusMsg.includes('Correcting') || statusMsg.includes('correction');
      
      // Check if job has completed
      if (transcriptionJob.status && JOB_STATUSES.COMPLETED.includes(transcriptionJob.status) && transcriptionJob.response) {
        console.log(`[VoiceRecording] Transcription job completed: ${transcriptionJobId}`);
        
        try {
          // Mark job as processed
          processedJobsRef.current.add(transcriptionJobId);
          
          // Get the text from the response and process it in case it needs extraction
          let responseText = transcriptionJob.response;
          
          // Check if the text needs to be extracted from JSON
          if (responseText.startsWith('{') && responseText.endsWith('}')) {
            try {
              const parsed = JSON.parse(responseText);
              if (parsed.text && typeof parsed.text === 'string') {
                responseText = parsed.text;
              } else if (parsed.response && typeof parsed.response === 'string') {
                responseText = parsed.response;
              }
            } catch (parseError) {
              console.warn('[VoiceRecording] Error parsing response JSON:', parseError);
              // Continue with original text
            }
          }
          
          // Determine if this was a transcription or a completed correction
          if (isCorrectionPhase) {
            // This job already went through correction
            setCorrectedText(responseText);
            
            // If we don't already have raw text, use this as both
            if (!rawText) {
              setRawText(responseText);
            }
            
            // Notify listeners about the correction completion
            if (onCorrectionComplete && rawText) {
              onCorrectionComplete(rawText, responseText);
            }
            
            // Also update via onTranscribed for form fields
            if (onTranscribed) {
              onTranscribed(responseText);
            }
          } else {
            // This is just transcription without correction
            setRawText(responseText);
            
            // Notify listeners
            if (onTranscribed) {
              onTranscribed(responseText);
            }
            
            // If auto-correct is enabled, initiate correction (which will update the same job)
            if (autoCorrect && responseText.trim()) {
              console.log(`[VoiceRecording] Auto-correcting text using same job: ${transcriptionJobId}`);
              handleCorrection(responseText, sessionId, transcriptionJobId).then(correctionResult => {
                if (correctionResult.isSuccess && typeof correctionResult.data === 'string') {
                  // If we got an immediate response, update the corrected text
                  setCorrectedText(correctionResult.data);
                  
                  // Notify listeners
                  if (onCorrectionComplete && typeof correctionResult.data === 'string') {
                    onCorrectionComplete(responseText, correctionResult.data);
                  }
                  
                  // Update form with corrected text if needed
                  if (onTranscribed) {
                    onTranscribed(correctionResult.data);
                  }
                }
                // If it's a background job, we'll catch it on the next update of this useEffect
              });
            }
          }
          
          // Check metadata to see if we should apply to a specific form field
          if (transcriptionJob.job?.metadata?.targetField) {
            console.log(`[VoiceRecording] Job has targetField: ${transcriptionJob.job.metadata.targetField}`);
            // The callback should handle this based on the field specified
          }
          
          setTextStatus('done');
        } catch (error) {
          console.error('[VoiceRecording] Error processing transcription job:', error);
          updateState({ error: error instanceof Error ? error.message : 'Error processing transcription' });
        } finally {
          // Reset the job ID when completely done (no correction needed or correction completed)
          if (!autoCorrect || isCorrectionPhase) {
            setTranscriptionJobId(null);
          }
        }
      } 
      // Handle running jobs with correction in progress
      else if (transcriptionJob.status === 'running' && isCorrectionPhase) {
        // The job is in correction phase, we keep tracking it
        // If we have raw text but no status message about correction yet, we're just starting correction
        if (rawText && !correctedText && 
            (statusMsg.includes('Correcting') || statusMsg.includes('Waiting for Claude correction'))) {
          console.log(`[VoiceRecording] Job ${transcriptionJobId} is now in correction phase`);
          // We don't mark as processed yet - we'll wait for completion
        }
      }
      // Handle failed jobs 
      else if (transcriptionJob.status && JOB_STATUSES.FAILED.includes(transcriptionJob.status)) {
        console.log(`[VoiceRecording] Transcription job ${transcriptionJob.status}: ${transcriptionJobId}`);
        
        // Mark job as processed
        processedJobsRef.current.add(transcriptionJobId);
        
        // Update state with appropriate error message based on status
        const errorMessage = transcriptionJob.errorMessage || 
                            (transcriptionJob.status === 'canceled' 
                              ? 'Voice processing was canceled' 
                              : 'Voice processing failed');
        
        // Only update error state if we don't have raw text already
        // (if we're in correction phase but it failed, we still have usable transcription)
        if (!rawText || !isCorrectionPhase) {
          updateState({ error: errorMessage });
          setTextStatus('error');
        } else if (isCorrectionPhase) {
          console.warn(`[VoiceRecording] Correction failed but using raw transcription`);
        }
        
        // Reset the job ID
        setTranscriptionJobId(null);
      }
    }
  }, [transcriptionJobId, transcriptionJob, autoCorrect, onTranscribed, onCorrectionComplete, updateState, sessionId, handleCorrection, rawText, correctedText]);
  
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupMedia(recorderRef.current, streamRef.current);
    };
  }, []);
  
  return {
    isRecording,
    isProcessing,
    error,
    rawText,
    correctedText,
    startRecording,
    stopRecording,
    reset,
    retryLastRecording,
    textStatus,
  };
} 