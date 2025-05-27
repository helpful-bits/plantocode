const fs = require('node:fs');
const path = require('node:path');

// Paths to check
const filePaths = [
  './app/components/generate-prompt/_hooks/use-guidance-generation.ts',
  './app/components/generate-prompt/_hooks/use-regex-state.ts'
];

// Check for unsafe TypeScript usage
function checkForUnsafeUsage(content) {
  const issues = [];
  
  // Check for useBackgroundJob
  if (content.includes('const regexJob = useBackgroundJob(') ||
      content.includes('const guidanceJobResult = useBackgroundJob(')) {
    issues.push('Unsafe usage of useBackgroundJob without proper typing');
  }
  
  // Check for unsafe member access
  if (content.includes('.job)') ||
      content.includes('.metadata)') ||
      content.includes('.status)')) {
    issues.push('Potential unsafe member access on error typed value');
  }
  
  // Check for type assertions that could be made safer
  if (content.includes(' as BackgroundJob')) {
    issues.push('Type assertion used - could be replaced with a safer approach');
  }
  
  return issues;
}

// Main function
function checkFiles() {
  let hasIssues = false;
  
  for (const filePath of filePaths) {
    const fullPath = path.resolve(__dirname, filePath);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const issues = checkForUnsafeUsage(content);
      
      if (issues.length > 0) {
        hasIssues = true;
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
      hasIssues = true;
    }
  }
  
  return hasIssues ? 1 : 0;
}

// Run the check
process.exit(checkFiles());