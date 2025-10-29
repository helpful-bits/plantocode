"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { ScrollArea } from "@/ui/scroll-area";
import { useNotification } from "@/contexts/notification-context";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { getPersistentNotifications, dismissNotification, dismissNotificationsByTag } = useNotification();

  const terminalNotifications = getPersistentNotifications('terminal');
  const notificationCount = terminalNotifications.length;

  const handleClearAll = () => {
    dismissNotificationsByTag('terminal');
    setOpen(false);
  };

  if (notificationCount === 0) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          title={`${notificationCount} agent${notificationCount === 1 ? '' : 's'} require${notificationCount === 1 ? 's' : ''} attention`}
        >
          <Terminal className="h-[1.2rem] w-[1.2rem]" />
          {notificationCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {notificationCount > 9 ? "9+" : notificationCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-80" align="end">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Agent Requires Attention</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{notificationCount}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-6 px-2 text-xs"
            >
              Clear all
            </Button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <ScrollArea className="max-h-96">
          <div className="p-1">
            {terminalNotifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-2 p-3"
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex-1 min-w-0 w-full">
                  <h4 className="font-medium text-sm leading-none">
                    {n.title}
                  </h4>
                  {n.message && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {n.message}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    const sessionId = n.data?.jobId;
                    if (sessionId) {
                      window.dispatchEvent(new CustomEvent('open-terminal-session', { detail: { sessionId } }));
                      window.dispatchEvent(new CustomEvent('open-plan-terminal', { detail: { jobId: sessionId } }));
                    }
                    dismissNotification(n.id);
                  }}
                >
                  Open Terminal
                </Button>
              </DropdownMenuItem>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}