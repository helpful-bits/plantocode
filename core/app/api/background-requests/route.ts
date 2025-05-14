import { NextRequest, NextResponse } from 'next/server';
import { backgroundJobRepository } from '@core/lib/db/repositories';
import { setupDatabase } from '@core/lib/db';

/**
 * GET /api/background-requests
 * Returns all visible (non-cleared) background jobs 
 * The response contains the 'response' field as the primary location for textual results,
 * rather than legacy metadata.text.
 * 
 * Note: This route is maintained for backward compatibility.
 * For new implementations, prefer using the /api/background-jobs endpoint
 * which returns data in the ActionState format.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/background-requests');
    
    // Make sure database is initialized
    await setupDatabase();
    
    // Fetch all non-cleared requests using the repository's getAllVisibleBackgroundJobs method
    console.time('[API] getAllVisibleBackgroundJobs');
    const jobs = await backgroundJobRepository.getAllVisibleBackgroundJobs();
    console.timeEnd('[API] getAllVisibleBackgroundJobs');
    
    console.log(`[API] Retrieved ${jobs.length} visible background jobs`);
    
    // Map requests for backward compatibility with clients expecting modelOutput
    // The rowToBackgroundJob mapper already handles response formatting for all job types
    const requests = jobs.map(job => {
      // Just add modelOutput field for backward compatibility - the job mapper already handles
      // all the response formatting, file path references, and edge cases
      return {
        ...job,
        // Keep modelOutput for backward compatibility
        modelOutput: job.response || null
      };
    });
    
    // Log some basic info about the jobs for debugging
    if (requests.length > 0) {
      console.log('[API] Sample job fields:', 
        requests.slice(0, 2).map(job => ({
          id: job.id?.substring(0, 8),
          status: job.status,
          hasResponse: Boolean(job.response),
          hasModelOutput: Boolean(job.response)
        }))
      );
    }
    
    // Return visible requests in the expected format
    return NextResponse.json({ 
      success: true, 
      requests 
    });
  } catch (error) {
    console.error('[API] Error fetching background requests:', error);
    
    // Return error response with empty requests array
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error fetching background requests',
        requests: [] // Always include an empty array for consistency
      }, 
      { status: 500 }
    );
  }
} 