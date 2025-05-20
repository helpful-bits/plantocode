import type { Config } from "tailwindcss";
import path from "path";
import { fileURLToPath } from "url";

// Create __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tailwind configuration for Vibe Manager Desktop
 */
const config: Config = {
  darkMode: "class",
  content: [
    // Only include specific paths to absolutely avoid node_modules
    path.join(__dirname, "index.html"),
    // More specific paths that explicitly avoid node_modules
    path.join(__dirname, "src", "app", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "ui", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "hooks", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "utils", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "contexts", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "actions", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "adapters", "**", "*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src", "types", "**", "*.{js,jsx,ts,tsx}"),
  ],
  // Explicitly ignore node_modules warning
  hideNodeModulesWarning: true,
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          background: "hsl(var(--warning-background))",
          border: "hsl(var(--warning-border))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "collapsible-down": "collapsible-down 0.2s ease-out",
        "collapsible-up": "collapsible-up 0.2s ease-out",
        appear: "appear 0.3s ease-out",
        "progress-indeterminate":
          "progress-indeterminate 2s ease-in-out infinite",
      },
      keyframes: {
        "collapsible-down": {
          "0%": { height: "0", opacity: "0" },
          "100%": {
            height: "var(--radix-collapsible-content-height)",
            opacity: "1",
          },
        },
        "collapsible-up": {
          "0%": {
            height: "var(--radix-collapsible-content-height)",
            opacity: "1",
          },
          "100%": { height: "0", opacity: "0" },
        },
        appear: {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "progress-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;