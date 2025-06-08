export interface ParsedStep {
  number: string;
  title: string;
  content: string;
}

export const parsePlanResponseContent = (response: string | undefined | null): string => {
  if (!response || response.trim() === '') {
    return 'No content available.';
  }
  
  return response.trim();
};

export const extractStepsFromPlan = (response: string | undefined | null): ParsedStep[] => {
  if (!response || response.trim() === '') {
    return [];
  }

  const stepRegex = /<step\s+number="(\d+)">([\s\S]*?)<\/step>/g;
  const steps: ParsedStep[] = [];
  let match;

  while ((match = stepRegex.exec(response)) !== null) {
    const stepNumber = match[1];
    const stepContent = match[2].trim();
    
    // Extract title from the step content
    const titleMatch = stepContent.match(/<title>(.*?)<\/title>/s);
    const title = titleMatch ? titleMatch[1].trim() : `Step ${stepNumber}`;
    
    steps.push({
      number: stepNumber,
      title,
      content: match[0] // Full step content including tags
    });
  }

  return steps;
};

export const createPlanWithOnlyStep = (fullPlan: string, stepToKeep: string): string => {
  if (!fullPlan || !stepToKeep) return fullPlan;
  
  // Extract the specific step we want to keep
  const keepStepRegex = new RegExp(`<step\\s+number="${stepToKeep}">([\\s\\S]*?)<\\/step>`, 'g');
  const stepMatch = keepStepRegex.exec(fullPlan);
  const stepToKeepContent = stepMatch ? stepMatch[0] : '';
  
  if (!stepToKeepContent) {
    return fullPlan; // If step not found, return original
  }
  
  // Remove ALL step tags from the plan
  const allStepsRegex = /<step\s+number="\d+">([\s\S]*?)<\/step>/g;
  let planWithoutAnySteps = fullPlan.replace(allStepsRegex, '');
  
  // Check if we have a <steps> container and fix its structure
  if (planWithoutAnySteps.includes('<steps>') && planWithoutAnySteps.includes('</steps>')) {
    // Find the position where we should insert the step
    const stepsStartMatch = planWithoutAnySteps.match(/<steps>\s*/);
    const stepsEndMatch = planWithoutAnySteps.match(/\s*<\/steps>/);
    
    if (stepsStartMatch && stepsEndMatch) {
      const beforeSteps = planWithoutAnySteps.substring(0, stepsStartMatch.index! + stepsStartMatch[0].length);
      const afterSteps = planWithoutAnySteps.substring(stepsEndMatch.index!);
      
      // Reconstruct with the single step inside <steps>
      const result = beforeSteps + '\n    ' + stepToKeepContent + '\n  ' + afterSteps;
      return result.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    }
  }
  
  // Fallback: just append the step at the end
  const result = planWithoutAnySteps.trim() + '\n\n' + stepToKeepContent;
  return result.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
};