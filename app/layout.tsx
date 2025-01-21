import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { FormatProvider } from "@/lib/contexts/format-context";
import { ProjectProvider } from "@/lib/contexts/project-context";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900"
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900"
});

export const metadata: Metadata = {
  title: "O1 Pro Flow",
  description: "Generate prompts for and apply changes from the O1 pro model in ChatGPT"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ProjectProvider>
            <FormatProvider>
              {children}
            </FormatProvider>
          </ProjectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
