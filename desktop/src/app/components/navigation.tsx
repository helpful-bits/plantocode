"use client";

import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Home, Settings, User, MessageSquare, RotateCcw, Loader2 } from "lucide-react";

import { useUILayout } from "@/contexts/ui-layout-context";
import { useResetApp } from "@/hooks/use-reset-app";
import { ThemeToggle, Badge } from "@/ui";
import { Button } from "@/ui/button";
import { CostUsageIndicator } from "@/ui/cost-usage-indicator";
import { BillingHistoryModal } from "@/app/components/billing/billing-components";
import { NotificationBell } from "@/app/components/global/NotificationBell";

export function Navigation() {
  const [isBillingHistoryModalOpen, setIsBillingHistoryModalOpen] = useState(false);
  const { isAppBusy, busyMessage } = useUILayout();
  const resetApp = useResetApp();

  const isBusy = isAppBusy;

  return (
    <nav className="bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-soft sticky top-0 z-40">
        <div className="container mx-auto px-6 flex items-center justify-between max-w-7xl">
          <div className="flex">
            {[
              { path: '/', icon: Home, label: 'Home' },
              { path: '/settings', icon: Settings, label: 'Settings' },
              { path: '/account', icon: User, label: 'Account' },
              { path: '/feedback', icon: MessageSquare, label: 'Feedback' }
            ].map(({ path, icon: Icon, label }) => {
              return (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `
                    flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 relative cursor-pointer
                    focus-ring rounded-t-md
                    ${isActive
                      ? "text-primary border-b-2 border-primary bg-primary/5" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }
                  `}
                >
                  <Icon className="h-4 w-4 mr-2 text-current" />
                  {label}
                </NavLink>
              );
            })}
          </div>

          {/* Beta badge */}
          <Badge 
            variant="secondary" 
            className="ml-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 font-semibold text-xs px-2.5 py-0.5"
          >
            BETA
          </Badge>

          <div className="flex items-center gap-3 ml-auto">
            {/* Show a small indicator when the app is busy */}
            {isBusy && (
              <div className="nav-loading-indicator">
                <Loader2 className="h-3 w-3 animate-spin mr-2 text-current" />
                <span className="font-medium text-xs truncate max-w-32">
                  {busyMessage || "Loading..."}
                </span>
              </div>
            )}

            {/* Cost usage indicator to the left of theme toggle */}
            <CostUsageIndicator
              compact={true}
              showRefreshButton={false}
              onClick={() => setIsBillingHistoryModalOpen(true)}
            />
            <NotificationBell />
            <ThemeToggle />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={resetApp}
              title="Reset application"
            >
              <RotateCcw className="h-[1.2rem] w-[1.2rem] text-foreground" />
              <span className="sr-only">Reset application</span>
            </Button>
          </div>
        </div>
        
        <BillingHistoryModal
          open={isBillingHistoryModalOpen}
          onOpenChange={setIsBillingHistoryModalOpen}
        />
      </nav>
  );
}
