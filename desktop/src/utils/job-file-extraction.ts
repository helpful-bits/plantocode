export function extractFilePathsFromJobResponse(jobResponse: string): string[] {
  try {
    const parsed = JSON.parse(jobResponse);
    const allPaths: string[] = [];

    if (parsed.verifiedPaths && Array.isArray(parsed.verifiedPaths)) {
      allPaths.push(...parsed.verifiedPaths);
    }

    if (parsed.unverifiedPaths && Array.isArray(parsed.unverifiedPaths)) {
      allPaths.push(...parsed.unverifiedPaths);
    }

    if (parsed.filePaths && Array.isArray(parsed.filePaths)) {
      allPaths.push(...parsed.filePaths);
    }

    if (parsed.paths && Array.isArray(parsed.paths)) {
      allPaths.push(...parsed.paths);
    }

    if (parsed.files && Array.isArray(parsed.files)) {
      allPaths.push(...parsed.files);
    }

    if (parsed.filteredFiles && Array.isArray(parsed.filteredFiles)) {
      allPaths.push(...parsed.filteredFiles);
    }

    if (parsed.relevantFiles && Array.isArray(parsed.relevantFiles)) {
      const relevantFilePaths = parsed.relevantFiles.map((item: any) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object' && item.file) {
          return item.file;
        }
        if (item && typeof item === 'object' && item.path) {
          return item.path;
        }
        return null;
      }).filter((path: any) => path !== null);
      allPaths.push(...relevantFilePaths);
    }

    return [...new Set(allPaths.filter(path => typeof path === 'string'))];
  } catch {
    return [];
  }
}