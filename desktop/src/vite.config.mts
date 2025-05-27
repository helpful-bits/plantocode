import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

// Create __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  
  // Set root to the desktop/ directory (parent of src/)
  root: path.resolve(__dirname, ".."),

  // Enable public directory and assets
  publicDir: path.resolve(__dirname, "../public"),
  
  // Ensure CSS is properly processed
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },

  // Vite alias configuration
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@desktop": path.resolve(__dirname, "."),
      "@ui": path.resolve(__dirname, "./ui"),
    },
  },

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: import.meta?.env?.VITE_TAURI_DEV_HOST || 'localhost',
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
  envPrefix: ["AUTH0_", "SERVER_", "TAURI_ENV_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target:
      import.meta?.env?.TAURI_ENV_PLATFORM === "windows"
        ? "chrome105"
        : "safari13",
    // Don't minify for debug builds
    minify: !import.meta?.env?.TAURI_ENV_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!import.meta?.env?.TAURI_ENV_DEBUG,
  },
});
