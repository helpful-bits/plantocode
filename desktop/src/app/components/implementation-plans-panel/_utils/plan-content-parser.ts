export const parsePlanResponseContent = (response: string | undefined | null): string => {
  if (!response || response.trim() === '') {
    return 'No content available.';
  }
  
  return response.trim();
};