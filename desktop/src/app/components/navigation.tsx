"use client";

import { useEffect, useState } from "react";
import { Home, Settings, RotateCcw, Loader2 } from "lucide-react";

import { useSessionStateContext } from "@/contexts/session";
import { useUILayout } from "@/contexts/ui-layout-context";
import { ThemeToggle } from "@/ui";
import { Button } from "@/ui/button";
import { GlobalLoadingIndicator } from "@/ui/global-loading-indicator";
import { TokenUsageIndicator } from "@/ui/token-usage-indicator";
import { isTauriEnvironment } from "@/utils/platform";

export function Navigation() {
  // Track current pathname and update on route changes
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePathChange = () => {
      setPathname(window.location.pathname);
    };
    // Initial set
    handlePathChange();

    window.addEventListener('popstate', handlePathChange);
    window.addEventListener('routeChange', handlePathChange as EventListener); // Cast if needed

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
    <>
      {/* Global loading indicator at the top of the app */}
      <GlobalLoadingIndicator isLoading={isBusy} />

      <nav className="bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-soft sticky top-0 z-40">
        <div className="container mx-auto px-6 flex items-center justify-between max-w-7xl">
          <div className="flex">
            <button
              onClick={() => window.history.pushState({}, '', '/')}
              className={`
                flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                ${pathname === "/" 
                  ? "text-primary border-b-2 border-primary bg-primary/5" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
              `}
            >
              <Home className="h-4 w-4 mr-2 text-current" />
              Home
            </button>
            <button
              onClick={() => window.history.pushState({}, '', '/settings')}
              className={`
                flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                ${pathname === "/settings" 
                  ? "text-primary border-b-2 border-primary bg-primary/5" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }
              `}
            >
              <Settings className="h-4 w-4 mr-2 text-current" />
              Settings
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Show a small indicator when the app is busy */}
            {isBusy && (
              <div className="flex items-center px-3 py-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20">
                <Loader2 className="h-3 w-3 animate-spin mr-2 text-current" />
                <span className="font-medium text-xs">{busyMessage || "Loading..."}</span>
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
            {/* Token usage indicator in the top right */}
            {isTauriEnvironment() && (
              <div className="hidden md:block">
                <TokenUsageIndicator compact={true} showRefreshButton={true} />
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
