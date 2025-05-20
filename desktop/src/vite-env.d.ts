/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: {
    readonly NODE_ENV: "development" | "production" | "test";
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
    readonly SSR: boolean;
    readonly VITE_DEBUG?: string;
    readonly VITE_ENABLE_ANALYTICS?: string;
    readonly [key: string]: string | undefined;
  };
}

interface Window {
  __TAURI_IPC__?: unknown;
}
