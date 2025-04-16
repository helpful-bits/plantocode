import type { Metadata } from "next";
import "./globals.css";
import { ProjectProvider } from "@/lib/contexts/project-context";
import { ThemeProvider } from "@/components/theme-provider";
import { DatabaseProvider } from "@/lib/contexts/database-context";

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
            <ProjectProvider>
              {children}
            </ProjectProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  ); 
} // Keep RootLayout component
