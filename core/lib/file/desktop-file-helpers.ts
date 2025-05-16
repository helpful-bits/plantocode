"use server";

import { ActionState } from '@core/types';

/**
 * Creates a unique filepath with proper file locking in the desktop backend
 * This ensures that files are safely created without race conditions
 */
export async function createUniqueFilePath(
  requestId: string,
  sessionName: string,
  projectDirectory?: string,
  extension: string = 'txt',
  targetDirName?: string
): Promise<ActionState<string>> {
  try {
    // Construct the request to the desktop API
    const response = await fetch('/api/create-unique-filepath', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        sessionName,
        projectDirectory,
        extension,
        targetDirName
      }),
    });

    // Check if the request was successful
    if (!response.ok) {
      const errorData = await response.json();
      return {
        isSuccess: false,
        message: errorData.error || 'Failed to create unique filepath',
        error: new Error(errorData.error || 'Failed to create unique filepath'),
      };
    }

    // Parse the response
    const filePath = await response.text();
    
    return {
      isSuccess: true,
      data: filePath,
      message: 'Unique filepath created successfully',
    };
  } catch (error: any) {
    console.error('[Desktop File API] Error:', error);
    return {
      isSuccess: false,
      message: error.message || 'Failed to create unique filepath',
      error,
    };
  }
}