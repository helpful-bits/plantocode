"use client";

import { createContext, useContext, type ReactNode } from "react";

import { toast } from "@/ui/use-toast";

import type { ToastOptions } from "@/ui/use-toast";

// Re-export ToastOptions for use elsewhere
export type { ToastOptions };

export interface NotificationType {
  title: string;
  message: string;
  type?: "default" | "success" | "error" | "warning" | "info";
  duration?: number;
  clipboardFeedback?: boolean;
}

export interface NotificationContextValue {
  showNotification: (notification: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  showNotification: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const showNotification = ({
    title,
    message,
    type = "default",
    duration = 5000,
    clipboardFeedback = false,
  }: NotificationType) => {
    const options: ToastOptions = {
      title,
      description: message,
      duration,
    };

    // Map type to variant
    if (type === "error") {
      options.variant = "destructive";
    } else if (type === "success") {
      // Use a custom class for better success indication since toast doesn't have a success variant
      options.variant = "default";
      options.className = "border-green-200 bg-green-50 text-green-800";
    } else if (type === "warning") {
      // Use the warning variant defined in toast.tsx
      options.variant = "warning";
    } else if (type === "info") {
      // Use a custom class for info messages
      options.variant = "default";
      options.className = "border-blue-200 bg-blue-50 text-blue-800";
    }

    // If clipboard feedback is enabled, add a custom class or style
    if (clipboardFeedback) {
      // You can either add a custom class or modify the options to indicate clipboard feedback
      if (typeof options === 'object') {
        (options as { clipboardFeedback?: string }).clipboardFeedback = 'true';
      }
    }

    toast(options);
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotification = () => useContext(NotificationContext);
