import { NextRequest, NextResponse } from 'next/server';
import { getActiveJobsAction } from '@core/actions/background-job-actions';
import { setupDatabase } from '@core/lib/db/setup';

/**
 * GET /api/background-jobs
 * Returns the list of active background jobs
 * Response format follows ActionState<BackgroundJob[]> where BackgroundJob.response
 * contains the primary textual result
 */
export async function GET(request: NextRequest) {
  // Enhanced logging with timestamp and request details
  const timestamp = new Date().toISOString();
  const requestIP = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  console.log(`[API] [${timestamp}] GET /api/background-jobs - IP: ${requestIP.split(',')[0]} - UA: ${userAgent.substring(0, 50)}...`);
  
  try {
    // First ensure the database is initialized
    await setupDatabase();
    
    // Now fetch the jobs and return the action result directly
    console.time('[API] getActiveJobsAction');
    const result = await getActiveJobsAction();
    console.timeEnd('[API] getActiveJobsAction');
    
    // Log results summary
    if (result.isSuccess) {
      console.log(`[API] Successfully retrieved ${result.data?.length || 0} background jobs`);
      
      // Log a few sample jobs to verify response field is present
      if (result.data && result.data.length > 0) {
        console.log('[API] Sample job response fields:', 
          result.data.slice(0, 2).map(job => ({
            id: job.id?.substring(0, 8),
            status: job.status,
            hasResponse: Boolean(job.response)
          }))
        );
      }
    } else {
      console.error(`[API] Failed to retrieve background jobs: ${result.message}`);
    }
    
    // Return the entire action result with proper status code
    return NextResponse.json(result, { 
      status: result.isSuccess ? 200 : 500 
    });
  } catch (error) {
    console.error('[API] Unhandled error fetching background jobs:', error);
    return NextResponse.json(
      { 
        isSuccess: false,
        error: 'Failed to fetch background jobs',
        message: error instanceof Error ? error.message : String(error),
        data: []
      },
      { status: 500 }
    );
  }
} 