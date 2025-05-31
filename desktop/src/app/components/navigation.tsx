"use client";

import { useEffect, useState } from "react";
import { Home, Settings, User, RotateCcw, Loader2 } from "lucide-react";

import { useSessionStateContext } from "@/contexts/session";
import { useUILayout } from "@/contexts/ui-layout-context";
import { ThemeToggle } from "@/ui";
import { Button } from "@/ui/button";
import { CostUsageIndicator } from "@/ui/cost-usage-indicator";
import { isTauriEnvironment } from "@/utils/platform";

export function Navigation() {
  // Track current pathname and update on route changes
  const [pathname, setPathname] = useState(() => {
    // Safe initialization for SSR compatibility
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePathChange = () => {
      setPathname(window.location.pathname);
    };
    
    // Set initial pathname
    handlePathChange();

    // Listen for browser navigation events
    window.addEventListener('popstate', handlePathChange);
    
    // Custom event for programmatic navigation
    window.addEventListener('routeChange', handlePathChange as EventListener);

    return () => {
      window.removeEventListener('popstate', handlePathChange);
      window.removeEventListener('routeChange', handlePathChange as EventListener);
    };
  }, []);
  const { isAppBusy, busyMessage } = useUILayout();
  // Using useSessionStateContext for potential future usage
  useSessionStateContext();

  const isBusy = isAppBusy;

  return (
    <nav className="bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-soft sticky top-0 z-40">
        <div className="container mx-auto px-6 flex items-center justify-between max-w-7xl">
          <div className="flex">
            {[
              { path: '/', icon: Home, label: 'Home' },
              { path: '/settings', icon: Settings, label: 'Settings' },
              { path: '/account', icon: User, label: 'Account' }
            ].map(({ path, icon: Icon, label }) => {
              const isActive = pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.history.pushState({}, '', path);
                      window.dispatchEvent(new Event('routeChange'));
                    }
                  }}
                  className={`
                    flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                    focus-ring rounded-t-md
                    ${isActive
                      ? "text-primary border-b-2 border-primary bg-primary/5" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4 mr-2 text-current" />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {/* Show a small indicator when the app is busy */}
            {isBusy && (
              <div className="nav-loading-indicator">
                <Loader2 className="h-3 w-3 animate-spin mr-2 text-current" />
                <span className="font-medium text-xs truncate max-w-32">
                  {busyMessage || "Loading..."}
                </span>
              </div>
            )}

            <ThemeToggle />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => (window.location.href = "/")}
              title="Reload application"
            >
              <RotateCcw className="h-[1.2rem] w-[1.2rem] text-foreground" />
              <span className="sr-only">Reload application</span>
            </Button>
            {/* Cost usage indicator in the top right */}
            {isTauriEnvironment() && (
              <div className="hidden md:block">
                <CostUsageIndicator compact={true} showRefreshButton={true} />
              </div>
            )}
          </div>
        </div>
      </nav>
  );
}
