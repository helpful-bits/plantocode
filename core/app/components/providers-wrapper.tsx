"use client";

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';

// Force client-side only rendering to avoid hydration issues
// This component will only render its children when running in browser
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? <>{children}</> : null;
}

// Dynamically import providers with loading fallback
// Using custom loading component that returns null to prevent hydration issues
const loadingFallback = { loading: () => null };

const ProjectProvider = dynamic(
  () => import("@core/lib/contexts/project-context").then(mod => ({ default: mod.ProjectProvider })),
  { ...loadingFallback, ssr: false }
);

const DatabaseProvider = dynamic(
  () => import("@core/lib/contexts/database-context").then(mod => ({ default: mod.DatabaseProvider })),
  { ...loadingFallback, ssr: false }
);

const BackgroundJobsProvider = dynamic(
  () => import("@core/lib/contexts/background-jobs-context").then(mod => ({ default: mod.BackgroundJobsProvider })),
  { ...loadingFallback, ssr: false }
);

// Use the safe version of SessionProvider to prevent initial freezing
const SessionProvider = dynamic(
  () => import("@core/lib/contexts/session-init").then(mod => ({ default: mod.SessionProviderSafe })),
  { ...loadingFallback, ssr: false }
);

const UILayoutProvider = dynamic(
  () => import("@core/lib/contexts/ui-layout-context").then(mod => ({ default: mod.UILayoutProvider })),
  { ...loadingFallback, ssr: false }
);

// Simple notification provider with hydration safety
const NotificationProvider = dynamic(
  () => import("@core/lib/contexts/notification-context").then(mod => ({ default: mod.NotificationProvider })),
  { ...loadingFallback, ssr: false }
);

interface ProvidersWrapperProps {
  children: React.ReactNode;
}

export function ProvidersWrapper({ children }: ProvidersWrapperProps) {
  return (
    // Force client-side only rendering to break hydration issues
    <ClientOnly>
      <NotificationProvider>
        <DatabaseProvider>
          <UILayoutProvider>
            <ProjectProvider>
              <SessionProvider>
                <BackgroundJobsProvider>
                  {children}
                </BackgroundJobsProvider>
              </SessionProvider>
            </ProjectProvider>
          </UILayoutProvider>
        </DatabaseProvider>
      </NotificationProvider>
    </ClientOnly>
  );
}