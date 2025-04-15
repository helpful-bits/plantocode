import type { Metadata } from "next";
import "./globals.css";
import { FormatProvider } from "@/lib/contexts/format-context";
import { ProjectProvider } from "@/lib/contexts/project-context";
import { ThemeProvider } from "@/components/theme-provider";
import { DatabaseProvider } from "@/lib/contexts/database-context"; // Keep DatabaseProvider import

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
              <FormatProvider>
                {children}
              </FormatProvider>
            </ProjectProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  ); 
} // Keep RootLayout component
