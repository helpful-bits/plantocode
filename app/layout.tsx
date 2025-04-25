import type { Metadata } from "next";
import "./globals.css"; // Keep globals.css import
import { ProjectProvider } from "@/lib/contexts/project-context"; // Keep ProjectProvider import
import { ThemeProvider } from "@/components/theme-provider"; // Keep ThemeProvider import
import { DatabaseProvider } from "@/lib/contexts/database-context"; // Keep DatabaseProvider import
import { InitializationProvider } from "@/lib/contexts/initialization-context"; // Add InitializationProvider import
import { BackgroundRequestsProvider } from "@/lib/contexts/background-requests-context"; // Add BackgroundRequestsProvider
import { BackgroundRequestsSidebar } from "./_components/background-requests-sidebar/background-requests-sidebar"; // Add sidebar component
import { Toaster } from "@/components/ui/toaster"
import { Navigation } from "./_components/navigation";

export const metadata: Metadata = {
  title: "AI Architect Studio",
  description: "Generate architectural plans and instructions for AI-driven software development"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <DatabaseProvider>
            <InitializationProvider>
              <ProjectProvider>
                <BackgroundRequestsProvider>
                  {/* Main content layout with sidebar */}
                  <div className="flex min-h-screen">
                    {/* Background requests sidebar */}
                    <BackgroundRequestsSidebar />
                    
                    {/* Main content area with padding for the sidebar */}
                    <div className="flex-1 ml-64"> {/* 64 is the width of the expanded sidebar */}
                      <div className="container mx-auto px-4">
                        <Navigation />
                        {children}
                      </div>
                    </div>
                  </div>
                </BackgroundRequestsProvider>
              </ProjectProvider>
            </InitializationProvider>
          </DatabaseProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  ); 
}