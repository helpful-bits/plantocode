"use client";

import { Home, Settings, MoreHorizontal, Loader2 } from "lucide-react";

import { useSessionStateContext } from "@/contexts/session";
import { useUILayout } from "@/contexts/ui-layout-context";
import { ThemeToggle } from "@/ui";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { GlobalLoadingIndicator } from "@/ui/global-loading-indicator";
import { TokenUsageIndicator } from "@/ui/token-usage-indicator";
import { isDesktopApp } from "@/utils/platform";

export function Navigation() {
  // Use window.location.pathname instead of Next.js usePathname
  const pathname = window.location.pathname;
  const { isAppBusy, busyMessage } = useUILayout();
  // Using useSessionStateContext for potential future usage
  useSessionStateContext();

  const isBusy = isAppBusy;

  return (
    <>
      {/* Global loading indicator at the top of the app */}
      <GlobalLoadingIndicator isLoading={isBusy} message={busyMessage} />

      <div className="flex items-center justify-between py-4 border-b border-border mb-8">
        <div className="flex gap-2">
          <Button
            onClick={() => (window.location.pathname = "/")}
            variant={pathname === "/" ? "default" : "ghost"}
            size="sm"
          >
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          <Button
            onClick={() => (window.location.pathname = "/settings")}
            variant={pathname === "/settings" ? "default" : "ghost"}
            size="sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Show a small indicator when the app is busy */}
          {isBusy && (
            <div className="flex items-center text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted/30">
              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              <span>{busyMessage || "Loading..."}</span>
            </div>
          )}

          {/* Only show token usage indicator in desktop app */}
          {isDesktopApp() && (
            <div className="mr-2">
              <TokenUsageIndicator cost={0.05} trialDaysLeft={14} compact />
            </div>
          )}

          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => (window.location.href = "/")}>
                Reload Application
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}
