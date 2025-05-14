"use server";
import { ActionState } from "@core/types";
import { generateRegexPatternPrompt } from "@core/lib/prompts/regex-prompts";
import { createBackgroundJob, enqueueJob } from "@core/lib/jobs/job-helpers";
import { JobType } from "@core/lib/jobs/job-types";

export async function generateRegexPatternsAction(
  taskDescription: string,
  directoryTree?: string,
  projectDirectory?: string,
  sessionId?: string
): Promise<ActionState<{ titleRegex?: string; contentRegex?: string; negativeTitleRegex?: string; negativeContentRegex?: string } | { jobId: string }>> {
  if (!taskDescription || !taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty." };
  }

  // Add strict session ID validation
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    return { isSuccess: false, message: "Active session required to generate regex patterns." };
  }

  try {
    console.log(`[generateRegexPatternsAction] Starting regex generation for task: "${taskDescription.substring(0, 50)}..."`);

    // Generate the prompt content
    const promptContent = generateRegexPatternPrompt(taskDescription, directoryTree);

    // Define Claude API parameters
    const claudeParameters = {
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1024,
      temperature: 0.2 // Lower temperature for more precise regex
    };

    console.log("[generateRegexPatternsAction] Creating regex generation background job");

    // Create a background job using the standardized helper
    const backgroundJob = await createBackgroundJob(
      sessionId,
      {
        apiType: 'claude',
        taskType: 'regex_generation',
        model: claudeParameters.model, // Set model directly in options
        rawInput: promptContent,
        includeSyntax: true,
        maxOutputTokens: claudeParameters.max_tokens, // Use maxOutputTokens for the standard parameter
        temperature: claudeParameters.temperature,
        metadata: {
          // Model and maxOutputTokens are now provided directly in options
        }
      },
      projectDirectory
    );

    if (!backgroundJob || !backgroundJob.id) {
      console.error("[generateRegexPatternsAction] Failed to create background job");
      return { isSuccess: false, message: "Failed to create background job for regex generation" };
    }

    const jobId = backgroundJob.id;

    // Enqueue the job using the standardized helper
    await enqueueJob(
      'REGEX_GENERATION',
      {
        backgroundJobId: jobId,
        sessionId,
        projectDirectory,
        taskDescription,
        directoryTree
      },
      5 // Medium priority
    );

    console.log(`[generateRegexPatternsAction] Regex generation job created and enqueued with ID: ${jobId}`);
    return {
      isSuccess: true,
      message: "Regex generation job started",
      data: { jobId }
    };
  } catch (error) {
    console.error(`[generateRegexPatternsAction] Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to generate regex patterns",
    };
  }
}
