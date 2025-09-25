"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
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
  const { getPersistentNotifications, dismissNotification } = useNotification();

  const terminalNotifications = getPersistentNotifications('terminal-input');
  const notificationCount = terminalNotifications.length;

  const handleNotificationClick = (notification: any) => {
    if (notification.onClick) {
      notification.onClick();
    } else if (notification.data?.jobId) {
      window.dispatchEvent(new CustomEvent('open-plan-terminal', {
        detail: { jobId: notification.data.jobId }
      }));
    }
    dismissNotification(notification.id);
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
          <Bell className="h-[1.2rem] w-[1.2rem]" />
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
          <Badge variant="secondary">{notificationCount}</Badge>
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