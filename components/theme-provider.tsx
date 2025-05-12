"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Cast to 'any' to bypass the TypeScript attribute type error
  const nextThemesProps = {
    attribute: "class",
    defaultTheme: "system",
    enableSystem: true,
    disableTransitionOnChange: false,
    ...props
  } as any; // Using 'any' to bypass TypeScript constraint issues
  
  return <NextThemesProvider {...nextThemesProps}>{children}</NextThemesProvider>
}