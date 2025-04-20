import type { Metadata } from "next";
import "./globals.css"; // Keep globals.css import
import { ProjectProvider } from "@/lib/contexts/project-context"; // Keep ProjectProvider import
import { ThemeProvider } from "@/components/theme-provider"; // Keep ThemeProvider import
import { DatabaseProvider } from "@/lib/contexts/database-context"; // Keep DatabaseProvider import
import { InitializationProvider } from "@/lib/contexts/initialization-context"; // Add InitializationProvider import
import { Toaster } from "@/components/ui/toaster"
import { Navigation } from "./_components/navigation";

export const metadata: Metadata = {
  title: "O1 Pro Flow", // Keep title
  description: "Generate prompts for and apply changes from the O1 pro model in ChatGPT"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <DatabaseProvider>
            <InitializationProvider>
              <ProjectProvider>
                <div className="container mx-auto px-4">
                  <Navigation />
                  {children}
                </div>
              </ProjectProvider>
            </InitializationProvider>
          </DatabaseProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  ); 
}