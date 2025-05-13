import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { TranscriptionPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import streamingRequestPool, { RequestType } from '@/lib/api/streaming-request-pool';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { DEFAULT_TASK_SETTINGS } from '@/lib/constants';

/**
 * Voice Transcription Processor
 * 
 * Processes jobs that transcribe audio using the Whisper API
 */
export class VoiceTranscriptionProcessor implements JobProcessor<TranscriptionPayload> {
  async process(payload: TranscriptionPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      audioData,
      isBlob,
      language,
      projectDirectory
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'whisper', 'Transcribing audio');

      // Get API key
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        await updateJobToFailed(backgroundJobId, "Groq API key not found in environment");
        return {
          success: false,
          message: "Groq API key not found",
          error: new Error("Groq API key not found")
        };
      }

      // Prepare the request to the Whisper API
      const formData = new FormData();
      
      // Add audio data - either from base64 or file path
      if (isBlob) {
        try {
          // Convert base64 to Blob
          const byteCharacters = Buffer.from(audioData, 'base64').toString('binary');
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/wav' });
          
          // Add blob to form data
          formData.append('file', blob, 'audio.wav');
        } catch (error) {
          console.error("[VoiceTranscriptionProcessor] Error processing base64 audio:", error);
          await updateJobToFailed(backgroundJobId, "Failed to process audio data");
          return {
            success: false,
            message: "Failed to process audio data",
            error: error instanceof Error ? error : new Error("Failed to process audio data")
          };
        }
      } else {
        // In a real implementation with file system access, you would read the file here
        // For now, we'll assume audioData contains the base64 string
        try {
          // Convert base64 to Blob
          const byteCharacters = Buffer.from(audioData, 'base64').toString('binary');
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'audio/wav' });
          
          // Add blob to form data
          formData.append('file', blob, 'audio.wav');
        } catch (error) {
          console.error("[VoiceTranscriptionProcessor] Error processing audio file:", error);
          await updateJobToFailed(backgroundJobId, "Failed to read audio file");
          return {
            success: false,
            message: "Failed to read audio file",
            error: error instanceof Error ? error : new Error("Failed to read audio file")
          };
        }
      }
      
      // Fetch project-specific task settings
      const projectSettings = await getModelSettingsForProject(projectDirectory);
      const transcriptionSettings = projectSettings?.transcription || DEFAULT_TASK_SETTINGS.transcription;
      
      // Use the model from settings
      const modelToUse = transcriptionSettings.model || 'whisper-large-v3';
      
      // Add other parameters to the form data
      formData.append('model', modelToUse);
      if (language) {
        formData.append('language', language);
      }

      // Create request options for the Whisper API
      const options = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        body: formData
      };

      // Make the request using streaming request pool
      const response = await streamingRequestPool.fetch(
        backgroundJobId,
        'https://api.groq.com/openai/v1/audio/transcriptions',
        options,
        sessionId,
        RequestType.VOICE_TRANSCRIPTION
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VoiceTranscriptionProcessor] API Error: ${response.status} - ${errorText}`);
        
        await updateJobToFailed(
          backgroundJobId, 
          `Transcription API error: ${response.status} - ${errorText.substring(0, 100)}`
        );
        
        return {
          success: false,
          message: `Transcription API error: ${response.status}`,
          error: new Error(`API Error: ${response.status} - ${errorText}`)
        };
      }

      // Parse the response
      const result = await response.json();
      
      if (!result.text) {
        await updateJobToFailed(backgroundJobId, "Transcription API returned no text");
        return {
          success: false,
          message: "Transcription API returned no text",
          error: new Error("No transcription text in API response")
        };
      }

      // Extract metadata from the result if available
      const metadata: {
        confidence?: number;
        language?: string;
        duration?: number;
        speakerCount?: number;
      } = {};
      
      if (result.confidence) {
        metadata.confidence = result.confidence;
      }
      
      if (result.detected_language || language) {
        metadata.language = result.detected_language || language;
      }
      
      if (result.duration) {
        metadata.duration = result.duration;
      }
      
      if (result.speaker_count) {
        metadata.speakerCount = result.speaker_count;
      }

      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        result.text,
        {
          modelUsed: modelToUse
        }
      );

      return {
        success: true,
        message: "Successfully transcribed audio",
        data: result.text
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during transcription";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[VoiceTranscriptionProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'VOICE_TRANSCRIPTION';