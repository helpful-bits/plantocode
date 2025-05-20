/** @type {import('tailwindcss').Config} */
const path = require('path')

module.exports = {
  content: [
    // Use absolute paths to avoid node_modules scanning
    path.join(__dirname, "desktop/index.html"),
    path.join(__dirname, "desktop/src/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  hideNodeModulesWarning: true,
}