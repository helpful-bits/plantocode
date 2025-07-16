'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem 
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}