"use client";

import { RefreshCw, X, Trash2, ChevronRight, Clock } from "lucide-react";


import { Button } from "@/ui/button";
import { CollapsibleTrigger } from "@/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/tooltip";

import type React from "react";

interface SidebarHeaderProps {
  isCollapsed: boolean;
  isRefreshing: boolean;
  isClearing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
  onClearHistory: (daysToKeep?: number) => void;
}

/**
 * Header component for a sidebar that includes:
 * - Title
 * - Refresh button
 * - Clear history dropdown
 * - Collapse toggle
 */
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  isCollapsed,
  isRefreshing,
  isClearing,
  refreshDisabled,
  onRefresh,
  onClearHistory,
}) => {
  return (
    <div className="px-4 py-3 border-b flex items-center justify-between h-14">
      <h2
        className={`font-medium text-sm text-balance ${isCollapsed ? "opacity-0" : "opacity-100"}`}
        style={{ minWidth: "100px", transition: "opacity 150ms ease" }}
      >
        Background Tasks
      </h2>

      <div className="flex items-center gap-2 ml-auto">
        {!isCollapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={onRefresh}
                  disabled={isRefreshing || refreshDisabled}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {!isCollapsed && (
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={isClearing}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Job history options</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onClearHistory(-1)}
                disabled={isClearing}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete all completed/failed/canceled jobs</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onClearHistory()}
                disabled={isClearing}
              >
                <Clock className="mr-2 h-4 w-4" />
                <span>Delete jobs older than 90 days</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onClearHistory(7)}
                disabled={isClearing}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Hide jobs older than 7 days</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onClearHistory(3)}
                disabled={isClearing}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Hide jobs older than 3 days</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onClearHistory(1)}
                disabled={isClearing}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Hide jobs older than 1 day</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <CollapsibleTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
      </div>
    </div>
  );
};

SidebarHeader.displayName = "SidebarHeader";
