import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Vite alias configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../core'),
      '@core/lib': path.resolve(__dirname, '../core/lib'),
      '@core/components': path.resolve(__dirname, '../core/components'),
      '@core/app': path.resolve(__dirname, '../core/app'),
      '@core/types': path.resolve(__dirname, '../core/types')
    },
  },

  // Prevent vite from obscuring rust errors
  clearScreen: false,
  
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST,
    hmr: {
      port: 1421,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  
  // To make use of `TAURI_ENV_PLATFORM`, `TAURI_ENV_ARCH`, `TAURI_ENV_FAMILY`,
  // `TAURI_ENV_PLATFORM_VERSION`, `TAURI_ENV_PLATFORM_TYPE` and `TAURI_ENV_DEBUG`
  // env variables, as well as all our application environment variables
  envPrefix: ["FIREBASE_", "SERVER_", "TAURI_ENV_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari13",
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});