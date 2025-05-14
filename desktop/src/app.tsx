/**
 * Main App Component for Vibe Manager Desktop
 * 
 * This component serves as the entry point for the desktop application.
 * It wraps the core app with desktop-specific functionality:
 * - Authentication via Firebase
 * - Database access via Tauri SQLite
 * - API access via server proxying
 * - Subscription management
 */

import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import LoginPage from './pages/login';
import { ThemeProvider } from '@core/components/theme-provider';
import { Toaster } from '@core/components/ui/toaster';
import SubscriptionManager from './components/billing/SubscriptionManager';

// Import core components - these are what we want to reuse from the core app
import { AppShell } from '@core/app/components/app-shell';
import { ProvidersWrapper } from '@core/app/components/providers-wrapper';

// Custom provider for desktop-specific functionality
import { DesktopBridgeProvider } from './providers/desktop-bridge-provider';

// Loading indicator component
function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading Vibe Manager...</p>
      </div>
    </div>
  );
}

// Authentication gate component
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return <LoginPage />;
  }
  
  return <>{children}</>;
}

// Main application with authentication wrapper
export default function App() {
  const [appReady, setAppReady] = useState(false);
  
  // Set app as ready immediately
  useEffect(() => {
    setAppReady(true);
  }, []);
  
  if (!appReady) {
    return <LoadingScreen />;
  }
  
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <AuthGate>
          {/* Desktop bridge provider to inject desktop adapters */}
          <DesktopBridgeProvider>
            {/* Reuse the ProvidersWrapper from core */}
            <ProvidersWrapper>
              {/* Reuse the AppShell from core */}
              <AppShell>
                {/* The core app will render its content here */}
                {/* Add subscription manager in a fixed position */}
                <div className="fixed top-4 right-4 z-50 w-80">
                  <SubscriptionManager />
                </div>
              </AppShell>
            </ProvidersWrapper>
          </DesktopBridgeProvider>
        </AuthGate>
      </AuthProvider>
      <Toaster />
    </ThemeProvider>
  );
}