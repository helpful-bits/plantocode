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
    readonly VITE_TAURI_DEV_HOST?: string;
    readonly TAURI_ENV_PLATFORM?: string;
    readonly TAURI_ENV_DEBUG?: string;
    readonly [key: string]: string | undefined;
  };
}

declare module "vite/client" {
  interface ImportMetaEnv {
    readonly VITE_DEBUG?: string;
    readonly VITE_ENABLE_ANALYTICS?: string;
    readonly VITE_TAURI_DEV_HOST?: string;
    readonly TAURI_ENV_PLATFORM?: string;
    readonly TAURI_ENV_DEBUG?: string;
  }
}
