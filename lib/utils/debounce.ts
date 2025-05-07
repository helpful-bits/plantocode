/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @returns A debounced version of the function with cancel and flush methods.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void, flush: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  
  // Use an arrow function to automatically capture the correct 'this' context
  const debounced = function(...args: Parameters<T>): void {
    // Store arguments for later use
    lastArgs = args;
    
    const later = () => {
      timeout = null;
      if (lastArgs) {
        func(...lastArgs);
        // Clear references to prevent memory leaks
        lastArgs = null;
      }
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };

  // Add cancel method
  debounced.cancel = function() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    // Clear references
    lastArgs = null;
  };
  
  // Add flush method to immediately invoke the function with the last arguments
  debounced.flush = function() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
      
      if (lastArgs !== null) {
        const args = lastArgs;
        // Clear references
        lastArgs = null;
        // Execute the function immediately
        func(...args);
      }
    }
  };
  
  return debounced;
}

// Also export as default for modules that import it as default
export default debounce; 