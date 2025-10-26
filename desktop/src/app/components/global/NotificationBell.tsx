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

  const handleNotificationClick = (notification: any) => {
    const id = notification.data?.jobId;
    if (id) {
      window.dispatchEvent(new CustomEvent('open-plan-terminal', { detail: { jobId: id } }));
      window.dispatchEvent(new CustomEvent('open-terminal-session', { detail: { sessionId: id } }));
      dismissNotification(notification.id);
    }
    setOpen(false);
  };

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
            {terminalNotifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="flex flex-col items-start gap-2 p-3 cursor-pointer"
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm leading-none">
                    {notification.title}
                  </h4>
                  {notification.message && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                  )}
                </div>
                <div className="text-xs text-primary">Click to open terminal</div>
              </DropdownMenuItem>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}