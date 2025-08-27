// Global type declarations for analytics libraries

declare global {
  interface Window {
    // Plausible Analytics
    plausible: (
      event: string, 
      options?: { 
        props?: Record<string, string | number | boolean>;
        callback?: () => void;
        revenue?: { currency: string; amount: number | string };
        interactive?: boolean;
        u?: string;
      }
    ) => void;
    
    // X (Twitter) Pixel
    twq: {
      (action: string, ...args: any[]): void;
      exe?: (...args: any[]) => void;
      queue?: any[];
      version?: string;
      loaded?: boolean;
    };
  }
}

export {};