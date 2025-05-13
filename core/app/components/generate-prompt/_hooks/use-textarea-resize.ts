import { useEffect, RefObject, useCallback } from 'react';

// Hook to automatically resize a textarea based on its content
export function useTextareaResize(
  textareaRef: RefObject<HTMLTextAreaElement>,
  content: string,
  options: {
    minHeight?: number;
    maxHeight?: number;
    extraHeight?: number;
  } = {}
) {
  const { 
    minHeight = 200, 
    maxHeight = 600,
    extraHeight = 24  // Extra height for padding and to prevent scrollbar flashing
  } = options;

  // Function to adjust the height of the textarea - memoized to avoid dependency cycles
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto first to get the correct scrollHeight measurement
    textarea.style.height = 'auto';

    // Use the scrollHeight of the textarea, which is more reliable than our previous calculations
    // scrollHeight includes all content, including what would be scrolled
    const scrollHeight = textarea.scrollHeight;

    // Add extra height padding to prevent scrollbar flashing during typing
    const calculatedHeight = scrollHeight + extraHeight;

    // Set the height within bounds, never less than minHeight or more than maxHeight
    textarea.style.height = `${Math.max(minHeight, Math.min(maxHeight, calculatedHeight))}px`;

    // Log resize for debugging purposes (uncomment when needed)
    // console.log(`[useTextareaResize] Adjusted textarea height to ${textarea.style.height}, content length: ${content.length}, scrollHeight: ${scrollHeight}`);
  // We include content in dependencies even though it's not used directly in the callback
  // This ensures the textarea is resized whenever content changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textareaRef, minHeight, maxHeight, extraHeight]);

  // Adjust height whenever content changes
  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, content]);

  // Also adjust when window resizes (which affects text wrapping)
  useEffect(() => {
    window.addEventListener('resize', adjustHeight);
    return () => {
      window.removeEventListener('resize', adjustHeight);
    };
  }, [adjustHeight]);

  return {
    adjustHeight
  };
}