"use client";

import * as React from "react"; // Keep React import
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes"; // Keep ThemeProviderProps type import
// Keep ThemeProvider component
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider> // Keep return statement
}