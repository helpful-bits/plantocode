export interface ParsedStep {
  number: string;
  title: string;
  content: string;
}


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

export const getContentForStep = (fullPlan: string, stepNumber: string): string => {
  if (!fullPlan || !stepNumber) return '';
  
  // Extract the specific step content
  const stepRegex = new RegExp(`<step\\s+number="${stepNumber}">([\\s\\S]*?)<\\/step>`, 'g');
  const stepMatch = stepRegex.exec(fullPlan);
  
  if (!stepMatch) {
    return ''; // Step not found
  }
  
  // Return the inner content of the step (without the step tags)
  return stepMatch[1].trim();
};
