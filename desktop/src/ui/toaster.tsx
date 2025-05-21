"use client";

import { useMemo } from "react";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/ui/toast";
import { useToast } from "@/ui/use-toast";

export function Toaster() {
  const { toasts } = useToast();

  // Use useMemo to prevent unnecessary re-renders of toast elements
  const toastElements = useMemo(() => {
    return toasts.map(function ({ id, title, description, action, ...props }) {
      return (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      );
    });
  }, [toasts]);

  return (
    <ToastProvider swipeDirection="right" duration={5000}>
      {toastElements}
      <ToastViewport />
    </ToastProvider>
  );
}