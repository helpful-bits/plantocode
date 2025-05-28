"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

import { NotificationBanner } from "@/ui/notification-banner";
import type { ButtonProps } from "@/ui/button";
import { Button } from "@/ui/button";

export interface NotificationType {
  title: string;
  message?: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
  actionButton?: { 
    label: string; 
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; 
    variant?: ButtonProps['variant']; 
    className?: string 
  };
}

interface ActiveNotification extends NotificationType {
  id: string;
}

export interface NotificationContextValue {
  showNotification: (notification: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  showNotification: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<ActiveNotification[]>([]);

  const showNotification = useCallback(({
    title,
    message,
    type = "info",
    duration = 5000,
    actionButton,
  }: NotificationType) => {
    const id = Math.random().toString(36).substr(2, 9);
    const notification: ActiveNotification = {
      id,
      title,
      message,
      type,
      duration,
      actionButton,
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      
      {/* Render active notifications */}
      <div className="fixed top-0 right-0 z-[100] max-w-[420px] w-full p-4 space-y-3 pointer-events-none">
        {notifications.map(notification => (
          <div key={notification.id} className="pointer-events-auto">
            <NotificationBanner
              variant={notification.type}
              title={notification.title}
              message={notification.message}
              isVisible={true}
              onDismiss={() => dismissNotification(notification.id)}
              autoClose={false} // We handle auto-close ourselves
            >
              {notification.actionButton && (
                <Button
                  size="sm"
                  variant={notification.actionButton.variant || "outline"}
                  onClick={notification.actionButton.onClick}
                  className={notification.actionButton.className}
                >
                  {notification.actionButton.label}
                </Button>
              )}
            </NotificationBanner>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotification = () => useContext(NotificationContext);
