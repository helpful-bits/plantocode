import type { Metadata } from "next";
import "./globals.css"; // Keep globals.css import
import { Suspense } from 'react';
import React from 'react';
import { ThemeProvider } from "@/components/theme-provider"; // Keep ThemeProvider import
import { Toaster } from "@/components/ui/toaster";
import { ProvidersWrapper } from "@/app/components/providers-wrapper";
import { AppShell } from './components/app-shell';

export const metadata: Metadata = {
  title: "Vibe Manager",
  description: "Vibe Manager: Streamline your workflow and manage your projects."
};

// Loading fallback component - more subtle and non-invasive
const LoadingFallback = () => (
  <div className="min-h-screen">
    {/* Subtle progress bar at the top */}
    <div className="fixed top-0 left-0 right-0 h-1 bg-primary/30 z-50">
      <div className="h-full bg-primary w-1/3 animate-progress"></div>
    </div>

    {/* Basic layout skeleton to avoid layout shifts */}
    <div className="flex min-h-screen">
      {/* Sidebar placeholder */}
      <div className="w-12 transition-all duration-300 ease-in-out"></div>

      {/* Main content area placeholder */}
      <div className="flex-1 transition-all duration-300">
        <div className="container mx-auto px-6 py-8">
          {/* Navigation placeholder */}
          <div className="h-16 mb-8">
            <div className="h-8 w-32 bg-muted/20 rounded-md animate-pulse"></div>
          </div>

          {/* Content area placeholder */}
          <div className="flex flex-col gap-8">
            <div className="h-6 w-1/4 bg-muted/20 rounded-md animate-pulse"></div>
            <div className="h-80 bg-muted/10 rounded-md animate-pulse-slow"></div>
            <div className="h-40 bg-muted/10 rounded-md animate-pulse-slow"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense fallback={<LoadingFallback />}>
            <ProvidersWrapper>
              {/*
                The UILayoutProvider is rendered inside ProvidersWrapper,
                and we'll use the isAppInitializing state to conditionally
                render the AppInitializingScreen or the actual content.
              */}
              <AppShell>
                {children}
              </AppShell>
            </ProvidersWrapper>
          </Suspense>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}

