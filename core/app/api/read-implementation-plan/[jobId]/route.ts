import { NextRequest, NextResponse } from 'next/server';
import { setupDatabase } from '@core/lib/db';
import { errorResponse } from '@core/lib/api/api-error-handling';

/**
 * API endpoint to read an implementation plan from the database based on the job ID
 */
type Params = { jobId: string };

export async function GET(
  request: NextRequest,
  context: { params: Params }
): Promise<NextResponse> {
  // Get the job ID from the parameters
  const params = await Promise.resolve(context.params);
  
  if (!params || !params.jobId) {
    return errorResponse(400, 'Missing job ID');
  }
  
  const jobId = params.jobId;

  try {
    // Set up the database connection
    await setupDatabase();

    // Dynamically import the background job repository
    const { backgroundJobRepository } = await import('@core/lib/db/repositories');

    // Fetch the background job details
    const backgroundJob = await backgroundJobRepository.getBackgroundJob(jobId);

    // Check if the job exists
    if (!backgroundJob) {
      return errorResponse(404, `Implementation plan not found for job ID: ${jobId}`);
    }

    // Verify this is an implementation plan job
    if (backgroundJob.taskType !== 'implementation_plan') {
      return errorResponse(400, `Job is not an implementation plan: ${jobId}`);
    }

    // Handle different job statuses
    if (backgroundJob.status === 'running') {
      // Return partial content for running jobs that are streaming
      if (backgroundJob.metadata?.isStreaming === true && backgroundJob.response) {
        return NextResponse.json({
          content: backgroundJob.response,
          isPartial: true,
          streamProgress: backgroundJob.metadata.streamProgress,
          jobId
        });
      } else {
        return errorResponse(202, 'Implementation plan generation is in progress');
      }
    }

    if (backgroundJob.status === 'failed' || backgroundJob.status === 'canceled') {
      return errorResponse(
        500,
        `Implementation plan generation ${backgroundJob.status}: ${backgroundJob.errorMessage || 'Unknown error'}`
      );
    }

    if (backgroundJob.status !== 'completed') {
      return errorResponse(202, `Implementation plan is not ready: ${backgroundJob.status}`);
    }

    // For completed jobs - handle both file-based and DB-stored plans
    
    // If there's an outputFilePath, this is a legacy file-based plan
    if (backgroundJob.outputFilePath) {
      // Inform the client this is a file-based plan
      return NextResponse.json({ 
        redirectToFile: true,
        filePath: backgroundJob.outputFilePath,
        jobId
      });
    }

    // For DB-stored plans, return the plan content directly from the job response
    if (!backgroundJob.response) {
      return errorResponse(404, 'Implementation plan content not found');
    }

    // Return the plan content directly from the job response
    return NextResponse.json({ 
      content: backgroundJob.response,
      jobId
    });

  } catch (error) {
    console.error(`[read-implementation-plan] Error reading plan for job ${jobId}:`, error);
    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Failed to fetch implementation plan'
    );
  }
}