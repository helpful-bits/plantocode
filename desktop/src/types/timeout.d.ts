// Define TimerHandler type if not already imported
type TimerHandler = string | ((...args: unknown[]) => void);

// Define timer functions to return number instead of NodeJS.Timeout
declare function setTimeout(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
declare function setInterval(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
declare function clearTimeout(timeoutId?: number): void;
declare function clearInterval(intervalId?: number): void;

// Ensure window interface is consistent
interface Window {
  setTimeout(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
  clearTimeout(timeoutId?: number): void;
  setInterval(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): number;
  clearInterval(intervalId?: number): void;
}
