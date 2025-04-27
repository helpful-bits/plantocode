"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { toast, ToastOptions } from "@/components/ui/use-toast";

interface NotificationType {
  title: string;
  message: string;
  type?: "default" | "success" | "error" | "warning" | "info";
  duration?: number;
}

interface NotificationContextType {
  showNotification: (notification: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  showNotification: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const showNotification = ({ title, message, type = "default", duration = 5000 }: NotificationType) => {
    const options: ToastOptions = {
      title,
      description: message,
      duration,
    };

    // Map type to variant
    if (type === "error") {
      options.variant = "destructive";
    } else if (type === "success") {
      options.variant = "default";
    } else if (type === "warning" || type === "info") {
      options.variant = "default";
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