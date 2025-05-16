"use server";

import { ActionState } from '@core/types';
import { BackgroundJob } from '@core/types/session-types';

/**
 * Helper function to convert a Blob to base64
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64 = base64String.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper function that makes a request to the desktop API for voice transcription
 * This centralizes the common logic between different transcription actions
 */
export async function invokeDesktopTranscription(
  audioData: string,
  sessionId: string,
  filename: string = 'audio.mp3'
): Promise<ActionState<BackgroundJob>> {
  try {
    // Construct the request to the desktop API
    const response = await fetch('/api/voice-transcription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        audioData,
        filename
      }),
    });

    // Check if the request was successful
    if (!response.ok) {
      const errorData = await response.json();
      return {
        isSuccess: false,
        message: errorData.error || 'Failed to start transcription job',
        error: new Error(errorData.error || 'Failed to start transcription job'),
      };
    }

    // Parse the response
    const job = await response.json();
    
    return {
      isSuccess: true,
      data: job,
      message: 'Transcription job started',
    };
  } catch (error: any) {
    console.error('[Desktop Transcription] Error:', error);
    return {
      isSuccess: false,
      message: error.message || 'Failed to start transcription job',
      error,
    };
  }
}