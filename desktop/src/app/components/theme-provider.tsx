"use client";

import { createContext, useContext, useEffect, useState } from "react";

import type * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
  enableSystem?: boolean;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vibe-theme",
  attribute = "class", // This is properly defined in ThemeProviderProps
  enableSystem = false, // This is properly defined in ThemeProviderProps
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage?.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    // Clear existing theme values
    if (attribute === "class") {
      root.classList.remove("light", "dark");
    } else {
      root.removeAttribute(attribute);
    }

    // Function to apply theme
    const applyTheme = (themeValue: "light" | "dark") => {
      if (attribute === "class") {
        root.classList.add(themeValue);
      } else {
        root.setAttribute(attribute, themeValue);
      }
    };

    // Handle system theme
    if (theme === "system" && enableSystem) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      
      const handleSystemThemeChange = () => {
        const systemTheme = mediaQuery.matches ? "dark" : "light";
        
        // Clear current theme
        if (attribute === "class") {
          root.classList.remove("light", "dark");
        } else {
          root.removeAttribute(attribute);
        }
        
        applyTheme(systemTheme);
      };

      // Apply initial system theme
      handleSystemThemeChange();

      // Listen for system theme changes
      mediaQuery.addEventListener("change", handleSystemThemeChange);

      // Cleanup listener
      return () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    } else if (theme === "system" && !enableSystem) {
      // If system theme is selected but not enabled, fallback to light
      applyTheme("light");
      return undefined;
    } else {
      // Apply the specific theme (light or dark)
      applyTheme(theme as "light" | "dark");
      return undefined;
    }
  }, [theme, attribute, enableSystem]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage?.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
