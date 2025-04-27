import type { Metadata } from "next";
import "./globals.css"; // Keep globals.css import
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { ThemeProvider } from "@/components/theme-provider"; // Keep ThemeProvider import
import { Toaster } from "@/components/ui/toaster";
import { BackgroundJobsSidebar, Navigation } from "./client-components";
import { DatabaseErrorHandler } from "./_components/client-wrappers";

// Dynamically import providers to reduce initial bundle size
const ProjectProvider = dynamic(() => import("@/lib/contexts/project-context").then(mod => ({ default: mod.ProjectProvider })), { ssr: true });
const DatabaseProvider = dynamic(() => import("@/lib/contexts/database-context").then(mod => ({ default: mod.DatabaseProvider })), { ssr: true });
const BackgroundJobsProvider = dynamic(() => import("@/lib/contexts/background-jobs-context").then(mod => ({ default: mod.BackgroundJobsProvider })), { ssr: true });
const NotificationProvider = dynamic(() => import("@/lib/contexts/notification-context").then(mod => ({ default: mod.NotificationProvider })), { ssr: true });

export const metadata: Metadata = {
  title: "AI Architect Studio",
  description: "Generate architectural plans and instructions for AI-driven software development"
};

// Loading fallback component
const LoadingFallback = () => <div className="flex items-center justify-center min-h-screen">Loading...</div>;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense fallback={<LoadingFallback />}>
            <NotificationProvider>
              <DatabaseProvider>
                <ProjectProvider>
                  <BackgroundJobsProvider>
                    {/* Main content layout with sidebar */}
                    <div className="flex min-h-screen">
                      {/* Background jobs sidebar */}
                      <Suspense fallback={<div className="w-64"></div>}>
                        <BackgroundJobsSidebar />
                      </Suspense>
                      
                      {/* Main content area with padding for the sidebar */}
                      <div className="flex-1 ml-64"> {/* 64 is the width of the expanded sidebar */}
                        <div className="container mx-auto px-6 py-4">
                          <Suspense fallback={<div className="h-16"></div>}>
                            <Navigation />
                          </Suspense>
                          {children}
                        </div>
                      </div>
                    </div>
                    
                    {/* Database error handler (displays in modal when there's a db issue) */}
                    <DatabaseErrorHandler />
                  </BackgroundJobsProvider>
                </ProjectProvider>
              </DatabaseProvider>
            </NotificationProvider>
          </Suspense>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  ); 
}