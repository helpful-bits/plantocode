"use client";

import { useEffect } from "react";
import { DatabaseErrorHandler } from "@/ui";
import { TextImprovementPopover } from "@/contexts/text-improvement";
import { useAuth } from "@/contexts/auth-context";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";

import { BackgroundJobsSidebar } from "../client-components";
import { Navigation } from "./navigation";

import type { ReactNode } from "react";

/**
 * AppShell component that conditionally renders either the initialization screen
 * or the full application UI based on the app initialization state.
 *
 * This component is designed to work in both web and desktop environments.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { isTokenExpired, setTokenExpired, signIn } = useAuth();

  useEffect(() => {
    if (isTokenExpired) {
      // Handle token expiry by prompting user to sign in again
    }
  }, [isTokenExpired]);

  const handleReauthenticate = async () => {
    setTokenExpired(false);
    await signIn();
  };

  // AuthFlowManager controls when this component renders, so we can proceed directly with the full UI
  return (
    <>
      {/* Token expiry modal */}
      <AlertDialog open={isTokenExpired}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session Expired</AlertDialogTitle>
            <AlertDialogDescription>
              Your session has expired. Please sign in again to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleReauthenticate}>
              Sign In
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Background jobs sidebar - positioned outside flex layout */}
      <BackgroundJobsSidebar />

      {/* Main content area with dynamic margin based on sidebar state */}
      <div
        className="min-h-screen transition-all duration-300 ease-in-out min-w-0 bg-background"
        style={{ 
          marginLeft: "var(--sidebar-width, 320px)",
          maxWidth: "calc(100vw - var(--sidebar-width, 320px))"
        }}
      >
          {/* Navigation spans full width */}
          <div className="w-full bg-background">
            <Navigation />

            {/* Main content with container constraints */}
            <main className="container mx-auto px-6 pt-4 pb-8 max-w-7xl bg-background min-w-0">
              <div className="w-full min-w-0">
                {children}
              </div>
            </main>
          </div>
        </div>

      {/* Database error handler (displays in modal when there's a db issue) */}
      <DatabaseErrorHandler />
      
      {/* Text improvement popover for global text selection improvements */}
      <TextImprovementPopover />
    </>
  );
}
