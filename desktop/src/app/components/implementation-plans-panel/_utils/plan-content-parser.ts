export const parsePlanResponseContent = (response: string | undefined | null): string => {
  if (!response || response.trim() === '') {
    return 'No content available.';
  }

  const startMarker = '&lt;!-- ORIGINAL_CONTENT --&gt;';
  const endMarker = '&lt;!-- /ORIGINAL_CONTENT --&gt;';
  
  const startIndex = response.indexOf(startMarker);
  const endIndex = response.indexOf(endMarker);
  
  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    const extractedContent = response.substring(startIndex + startMarker.length, endIndex).trim();
    return extractedContent;
  }
  
  return response.trim();
};