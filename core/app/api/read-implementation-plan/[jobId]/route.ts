import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@core/lib/api/api-error-handling';
import { BackgroundJob, TaskType } from '@core/types/session-types';
import { getBackgroundJobAction } from '@core/actions/background-job-actions';

// For static export compatibility
export const dynamic = 'error';
export const revalidate = 0;

/**
 * API endpoint to read an implementation plan from the database based on the job ID
 */
type Params = { jobId: string };

/**
 * Interface for standardized API response
 */
interface StandardApiResponse {
  jobId: string;
  status: string;
  content: string;
  statusMessage: string;
  isPartial: boolean;
  streamProgress?: number;
  updatedAt?: number;
  lastStreamUpdateTime?: number;
  responseLength: number;
  isStreaming: boolean;
  estimatedTotalLength?: number;
  modelUsed: string | null;
  error?: string;
  redirectToFile?: boolean;
  filePath?: string;
}

/**
 * Helper function to standardize response format for all job states
 */
const standardizeResponseFormat = (job: BackgroundJob): StandardApiResponse => {
  // Base response format with consistent fields
  const responseData: StandardApiResponse = {
    jobId: job.id,
    status: job.status,
    content: job.response || '',
    statusMessage: job.statusMessage || '',
    isPartial: job.status !== 'completed',
    streamProgress: job.metadata?.streamProgress,
    updatedAt: job.updatedAt,
    lastStreamUpdateTime: job.metadata?.lastStreamUpdateTime,
    responseLength: job.metadata?.responseLength || job.response?.length || 0,
    isStreaming: job.metadata?.isStreaming === true && (job.status === 'running' || job.status === 'processing_stream'),
    estimatedTotalLength: job.metadata?.estimatedTotalLength,
    modelUsed: job.modelUsed
  };
  
  return responseData;
};

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
  let backgroundJob: BackgroundJob | null = null; // Define this at the function scope level for error handling

  try {
    console.log(`[read-implementation-plan API] Attempting to fetch job ${jobId}`);
    
    // Use the server action to fetch the job (handles database setup)
    const result = await getBackgroundJobAction(jobId);
    
    // If the job couldn't be fetched, return an error
    if (!result.isSuccess || !result.data) {
      return errorResponse(404, result.message || `Implementation plan not found for job ID: ${jobId}`);
    }
    
    // Get the job from the result
    backgroundJob = result.data;
    
    console.log(`[read-implementation-plan API] Fetched job ${jobId}, status: ${backgroundJob.status}, taskType: ${backgroundJob.taskType}`);
    
    // Verify this is an implementation plan job
    if (backgroundJob.taskType !== 'implementation_plan') {
      return errorResponse(400, `Job is not an implementation plan: ${jobId}`);
    }

    // For failed or canceled jobs, still return a standardized response with error info
    if (backgroundJob.status === 'failed' || backgroundJob.status === 'canceled') {
      const standardResponse = standardizeResponseFormat(backgroundJob);
      standardResponse.error = backgroundJob.errorMessage || 'Unknown error';
      return NextResponse.json(standardResponse);
    }

    // Return standardized response for all job types
    return NextResponse.json(standardizeResponseFormat(backgroundJob));

  } catch (error) {
    let jobDetailsForErrorReporting = "Job details not available or not fetched yet.";
    try {
      if (backgroundJob) {
        jobDetailsForErrorReporting = JSON.stringify({
          id: backgroundJob.id,
          status: backgroundJob.status,
          taskType: backgroundJob.taskType,
          updatedAt: backgroundJob.updatedAt,
          metadataKeys: Object.keys(backgroundJob.metadata || {})
        });
      }
    } catch (e) {
      jobDetailsForErrorReporting = "Error stringifying job details.";
    }
    
    console.error(`[read-implementation-plan API] Detailed error for job ${jobId}: `, 
      error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error, 
      `Job Context: ${jobDetailsForErrorReporting}`);
      
    console.error(`[read-implementation-plan] Error reading plan for job ${jobId}:`, error);
    
    // Return error in a standardized format that matches our other responses
    return NextResponse.json({
      jobId,
      error: error instanceof Error ? error.message : 'Failed to fetch implementation plan',
      status: 'error',
      content: '',
      isPartial: true,
      statusMessage: error instanceof Error ? error.message : 'Error fetching plan'
    }, { status: 500 });
  }
}