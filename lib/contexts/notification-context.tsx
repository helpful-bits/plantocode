"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { toast } from "@/components/ui/use-toast";
import type { ToastOptions } from "@/components/ui/use-toast";

// Re-export ToastOptions for use elsewhere
export type { ToastOptions };

interface NotificationType {
  title: string;
  message: string;
  type?: "default" | "success" | "error" | "warning" | "info";
  duration?: number;
  clipboardFeedback?: boolean;
}

interface NotificationContextType {
  showNotification: (notification: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  showNotification: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const showNotification = ({ title, message, type = "default", duration = 5000, clipboardFeedback = false }: NotificationType) => {
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
      // For now, we'll just pass the property through
      (options as any).clipboardFeedback = true;
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