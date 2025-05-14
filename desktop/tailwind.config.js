/** @type {import('tailwindcss').Config} */
export default {
  // Reuse the core Tailwind configuration for consistency
  presets: [require('../core/tailwind.config.ts')],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Include core components that we're reusing
    "../core/components/**/*.{js,ts,jsx,tsx}",
    "../core/app/components/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: ["class"],
  plugins: [],
}