import type { Config } from "tailwindcss";

/**
 * Tailwind CSS v4 configuration for Vibe Manager Desktop
 * Most theme configuration has been moved to @theme directive in globals.css
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./index.html", // For desktop/index.html
    "./src/**/*.{js,jsx,ts,tsx}", // For all relevant files in desktop/src
    "!./src/**/node_modules/**", // Explicitly exclude node_modules
  ],
  plugins: [require("tailwindcss-animate")],
};

export default config;