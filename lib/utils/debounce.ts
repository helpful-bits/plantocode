/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @returns A debounced version of the function.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = function(this: any, ...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func.apply(this, args);
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
  };
  
  return debounced;
}

// Also export as default for modules that import it as default
export default debounce; 