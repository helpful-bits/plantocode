import { type ReadDirectoryResultData } from "../file-system/read-directory-job.actions";

/**
 * Parses the job response data from a read directory job
 * @param responseData The response data from the background job
 * @returns The parsed result data
 */
export function parseReadDirectoryJobData(
  responseData: string
): ReadDirectoryResultData {
  try {
    return JSON.parse(responseData) as ReadDirectoryResultData;
  } catch (error) {
    console.error("Error parsing read directory job data:", error);
    throw new Error("Failed to parse read directory job data");
  }
}
