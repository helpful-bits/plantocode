import { NextRequest, NextResponse } from 'next/server';
import { getActiveJobsAction } from '@/actions/background-job-actions';
import { setupDatabase } from '@/lib/db/setup';

/**
 * GET /api/background-jobs
 * Returns the list of active background jobs
 */
export async function GET(request: NextRequest) {
  try {
    // First ensure the database is initialized
    await setupDatabase();
    
    // Now fetch the jobs
    const jobs = await getActiveJobsAction();
    return NextResponse.json(jobs);
  } catch (error) {
    console.error('[API] Error fetching background jobs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch background jobs',
        message: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 