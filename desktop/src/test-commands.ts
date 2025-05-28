// This is a test script for verifying the Tauri command implementations
// Run this with `node -r esbuild-register desktop/src/test-commands.ts`

import {
  getActiveJobsAction,
  getBackgroundJobAction,
  cancelBackgroundJobAction,
  clearJobHistoryAction,
} from "./actions";

import type { BackgroundJob } from "./types/session-types";

async function testBackgroundJobCommands() {
  try {
    // Get all active jobs
    const jobsResult = await getActiveJobsAction();
    const jobs = jobsResult.data as BackgroundJob[] | undefined;
    // Use _ prefix for unused variables to satisfy linter
    const _jobCount = jobs?.length || 0;
    // eslint-disable-next-line no-console
    console.log(`Found ${_jobCount} active jobs`);

    if (jobs && jobs.length > 0) {
      const firstJob = jobs[0];

      // Get a specific job
      const jobResult = await getBackgroundJobAction(firstJob.id);
      const job = jobResult.data as BackgroundJob | undefined;

      // Test job cancellation (only if not already completed/failed/cancelled)
      if (
        job && !["completed", "failed", "cancelled", "canceled"].includes(
          firstJob.status
        )
      ) {
        await cancelBackgroundJobAction(firstJob.id);
      }


      // Get updated job
      const updatedJobResult = await getBackgroundJobAction(firstJob.id);
      updatedJobResult.data; // Access data to confirm API works
      // eslint-disable-next-line no-console
      console.log(`Retrieved updated job ${firstJob.id}`);
    }

    // Test clear job history (0 days deletes jobs older than 90 days)
    await clearJobHistoryAction(0);
  } catch (error) {
    console.error("Error testing background job commands:", error);
  }
}

// Run the tests
testBackgroundJobCommands().catch(console.error);
