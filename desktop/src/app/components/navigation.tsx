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
      <GlobalLoadingIndicator isLoading={isBusy} message={busyMessage} />

      <nav className="nav-bar">
        <div className="container mx-auto px-6 flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            onClick={() => window.history.pushState({}, '', '/')}
            variant="ghost"
            className={`nav-button ${pathname === "/" ? "active" : ""}`}
          >
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          <Button
            onClick={() => window.history.pushState({}, '', '/settings')}
            variant="ghost"
            className={`nav-button ${pathname === "/settings" ? "active" : ""}`}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>

        <div className="nav-actions">
          {/* Show a small indicator when the app is busy */}
          {isBusy && (
            <div className="nav-loading-indicator">
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
              <span className="font-medium">{busyMessage || "Loading..."}</span>
            </div>
          )}

          <ThemeToggle />
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => (window.location.href = "/")}
          >
            <RotateCcw className="h-[1.2rem] w-[1.2rem]" />
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
