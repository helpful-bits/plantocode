"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";

import { NotificationBanner } from "@/ui/notification-banner";
import type { ButtonProps } from "@/ui/button";
import { Button } from "@/ui/button";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError, ErrorType } from "@/utils/error-handling";

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
  showError: (error: unknown, context?: string, userContext?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  showNotification: () => {},
  showError: () => {},
  showSuccess: () => {},
  showWarning: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<ActiveNotification[]>([]);
  
  // Store active timeouts for cleanup
  const activeTimeoutsRef = useRef<Map<string, number>>(new Map());

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

    // Auto-dismiss after duration with proper cleanup
    if (duration > 0) {
      const timeoutId = window.setTimeout(() => {
        try {
          setNotifications(prev => prev.filter(n => n.id !== id));
          // Remove from active timeouts map
          activeTimeoutsRef.current.delete(id);
        } catch (error) {
          console.error('[NotificationProvider] Error dismissing notification:', error);
        }
      }, duration);
      
      // Store timeout ID for cleanup
      activeTimeoutsRef.current.set(id, timeoutId);
    }
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    // Clear any pending timeout for this notification
    const timeoutId = activeTimeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeTimeoutsRef.current.delete(id);
    }
  }, []);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeoutId of activeTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      activeTimeoutsRef.current.clear();
    };
  }, []);

  const showError = useCallback((error: unknown, context?: string, userContext?: string) => {
    // Log error for debugging/monitoring
    void logError(error, context || 'User Notification');
    
    // Extract structured error information
    const errorInfo = extractErrorInfo(error);
    
    // Create user-friendly message
    const userMessage = createUserFriendlyErrorMessage(errorInfo, userContext);
    
    // Determine specific error types for enhanced handling
    const isBillingError = errorInfo.type === ErrorType.BILLING_ERROR;
    const isActionRequired = errorInfo.type === ErrorType.ACTION_REQUIRED;
    const isPermissionError = errorInfo.type === ErrorType.PERMISSION_ERROR;
    const isConfigError = errorInfo.type === ErrorType.CONFIGURATION_ERROR;
    const isNetworkError = errorInfo.type === ErrorType.NETWORK_ERROR;
    const isDatabaseError = errorInfo.type === ErrorType.DATABASE_ERROR;
    const isWorkflowError = errorInfo.type === ErrorType.WORKFLOW_ERROR;
    const isValidationError = errorInfo.type === ErrorType.VALIDATION_ERROR;
    const isNotFoundError = errorInfo.type === ErrorType.NOT_FOUND_ERROR;
    const isInternalError = errorInfo.type === ErrorType.INTERNAL_ERROR;
    const isUnknownError = errorInfo.type === ErrorType.UNKNOWN_ERROR;
    
    // Create enhanced title based on error type
    const getErrorTitle = () => {
      if (isBillingError) return "Billing Error";
      if (isActionRequired) return "Action Required";
      if (isPermissionError) return "Access Denied";
      if (isConfigError) return "Configuration Error";
      if (isNetworkError) return "Connection Error";
      if (isDatabaseError) return "Database Error";
      if (isWorkflowError) return "Workflow Error";
      if (isValidationError) return "Invalid Input";
      if (isNotFoundError) return "Not Found";
      if (isInternalError) return "System Error";
      if (isUnknownError) return "Unexpected Error";
      return "Error";
    };
    
    // Create action button based on error type
    const getActionButton = () => {
      if (isBillingError) {
        return {
          label: "View Billing",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      }
      
      if (isActionRequired) {
        return {
          label: "Add Payment Method",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      }
      
      if (isPermissionError || isConfigError) {
        return {
          label: "Check Settings",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "outline" as const
        };
      }
      
      if (isDatabaseError || isInternalError) {
        return {
          label: "Refresh Page",
          onClick: () => {
            window.location.reload();
          },
          variant: "outline" as const
        };
      }
      
      if (isNetworkError) {
        return {
          label: "Retry",
          onClick: () => {
            window.location.reload();
          },
          variant: "outline" as const
        };
      }
      
      if (isValidationError) {
        return {
          label: "Review Input",
          onClick: () => {
            // Focus on the active form or input area
            const activeElement = document.activeElement;
            if (activeElement && 'focus' in activeElement) {
              (activeElement as HTMLElement).focus();
            }
          },
          variant: "outline" as const
        };
      }
      
      if (isWorkflowError) {
        // Enhanced workflow error handling with context-aware actions
        if (errorInfo.workflowContext?.workflowId) {
          return {
            label: "View Workflow Details",
            onClick: () => {
              // Try to open the background jobs sidebar or workflow panel
              // This could trigger a custom event or state update
              const event = new CustomEvent('show-workflow-details', {
                detail: { workflowId: errorInfo.workflowContext?.workflowId }
              });
              window.dispatchEvent(event);
            },
            variant: "outline" as const
          };
        } else if (errorInfo.workflowContext?.stageJobId) {
          return {
            label: "View Stage Job",
            onClick: () => {
              const event = new CustomEvent('show-job-details', {
                detail: { jobId: errorInfo.workflowContext?.stageJobId }
              });
              window.dispatchEvent(event);
            },
            variant: "outline" as const
          };
        } else if (errorInfo.workflowContext?.stageId) {
          return {
            label: "View Stage Details",
            onClick: () => {
              const event = new CustomEvent('show-stage-details', {
                detail: { stageId: errorInfo.workflowContext?.stageId }
              });
              window.dispatchEvent(event);
            },
            variant: "outline" as const
          };
        } else if (errorInfo.workflowContext?.retryAttempt && errorInfo.workflowContext.retryAttempt > 1) {
          return {
            label: "View Retry History",
            onClick: () => {
              const event = new CustomEvent('show-background-jobs', {
                detail: { 
                  filter: { originalJobId: errorInfo.workflowContext?.originalJobId || errorInfo.workflowContext?.workflowId }
                }
              });
              window.dispatchEvent(event);
            },
            variant: "outline" as const
          };
        } else {
          return {
            label: "View Background Jobs",
            onClick: () => {
              const event = new CustomEvent('show-background-jobs');
              window.dispatchEvent(event);
            },
            variant: "outline" as const
          };
        }
      }
      
      if (isNotFoundError) {
        return {
          label: "Go Back",
          onClick: () => {
            window.history.back();
          },
          variant: "outline" as const
        };
      }
      
      return undefined;
    };
    
    // Determine duration based on error severity
    const getDuration = () => {
      if (isBillingError || isActionRequired || isConfigError || isDatabaseError || isInternalError) return 0; // Don't auto-dismiss critical errors
      if (isPermissionError || isWorkflowError || isNotFoundError) return 10000; // Longer for actionable errors
      if (isValidationError) return 8000; // Medium duration for user input errors
      if (isNetworkError) return 6000; // Shorter for network issues that might resolve
      return 8000; // Default duration
    };
    
    showNotification({
      title: getErrorTitle(),
      message: userMessage,
      type: "error",
      duration: getDuration(),
      actionButton: getActionButton()
    });
  }, [showNotification]);
  
  const showSuccess = useCallback((message: string, title?: string) => {
    showNotification({
      title: title || "Success",
      message,
      type: "success",
      duration: 4000
    });
  }, [showNotification]);
  
  const showWarning = useCallback((message: string, title?: string) => {
    showNotification({
      title: title || "Warning",
      message,
      type: "warning",
      duration: 6000
    });
  }, [showNotification]);

  return (
    <NotificationContext.Provider value={{ showNotification, showError, showSuccess, showWarning }}>
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
