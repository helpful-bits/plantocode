"use client";

import { RefreshCw, Trash2, ChevronRight, ChevronLeft, Bell } from "lucide-react";
import { FC, ComponentType } from "react";

import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

interface SidebarHeaderProps {
  isCollapsed: boolean;
  isRefreshing: boolean;
  isClearing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
  onClearHistory: (daysToKeep?: number) => void;
  onToggleMonitoringView?: () => void;
  alertCount?: number;
  onAlertClick?: () => void;
  CollapsibleTrigger: ComponentType<any>;
}

/**
 * Header component for a sidebar that includes:
 * - Title
 * - Refresh button
 * - Clear history dropdown
 * - Collapse toggle
 */
export const SidebarHeader: FC<SidebarHeaderProps> = ({
  isCollapsed,
  isRefreshing,
  isClearing,
  refreshDisabled,
  onRefresh,
  onClearHistory,
  onToggleMonitoringView,
  alertCount,
  onAlertClick,
  CollapsibleTrigger,
}) => {
  return (
    <div className={`${isCollapsed ? 'px-2' : 'px-4'} border-b border-border/60 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} bg-background/80 backdrop-blur-sm`} style={{ height: '48px' }}>
      {!isCollapsed && (
        <h2
          className="font-medium text-sm text-balance text-foreground"
          style={{ minWidth: "100px", transition: "opacity 150ms ease" }}
        >
          Background Tasks
        </h2>
      )}

      <div className={`flex items-center gap-2 ${isCollapsed ? 'w-full justify-center' : 'ml-auto'}`}>
        {!isCollapsed && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onRefresh}
              disabled={isRefreshing || refreshDisabled}
            >
              <RefreshCw className="h-4 w-4 text-foreground" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={isClearing}
                >
                  <Trash2 className="h-4 w-4 text-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onClearHistory(-1)}
                  disabled={isClearing}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4 text-foreground" />
                  <span>Delete all Jobs</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onClearHistory(-2)}
                  disabled={isClearing}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4 text-foreground" />
                  <span>Delete all Jobs and Implementation Plans</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {(onToggleMonitoringView || onAlertClick) && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 relative"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onAlertClick) {
                    onAlertClick();
                  } else if (onToggleMonitoringView) {
                    onToggleMonitoringView();
                  }
                }}
              >
                <Bell className="h-4 w-4 text-foreground" />
                {alertCount > 0 && (
                  <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-medium">
                      {alertCount > 9 ? '9+' : alertCount}
                    </span>
                  </div>
                )}
              </Button>
            )}
          </>
        )}

        <CollapsibleTrigger asChild>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 flex-shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
      </div>
    </div>
  );
};

SidebarHeader.displayName = "SidebarHeader";