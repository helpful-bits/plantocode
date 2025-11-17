"use server";

export async function startTaskEdit(_sessionId?: string) {
  return;
}

export async function endTaskEdit(_sessionId?: string) {
  return;
}

export function createDebouncer<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delayMs);
  };
}
