// This parser is no longer needed since read-directory-job was removed
// Keeping file for compatibility but removing the functionality

export function parseReadDirectoryJobData(
  responseData: string
): any {
  try {
    return JSON.parse(responseData);
  } catch (error) {
    console.error("Error parsing directory job data:", error);
    throw new Error("Failed to parse directory job data");
  }
}
