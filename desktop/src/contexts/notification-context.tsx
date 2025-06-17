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

  // Helper function to create action buttons for billing errors
  const getActionButton = useCallback((errorType: ErrorType, workflowContext?: any) => {
    switch (errorType) {
      case ErrorType.PAYMENT_FAILED:
      case ErrorType.PAYMENT_DECLINED:
        return {
          label: "Manage Billing",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      
      case ErrorType.PAYMENT_METHOD_REQUIRED:
      case ErrorType.BILLING_ADDRESS_REQUIRED:
        return {
          label: "Add Payment Method",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      
      case ErrorType.PAYMENT_AUTHENTICATION_REQUIRED:
        return {
          label: "Complete Authentication",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      
      case ErrorType.SUBSCRIPTION_EXPIRED:
        return {
          label: "Upgrade Plan",
          onClick: () => {
            // Try to open subscription modal if on account page
            if (window.location.pathname === '/account') {
              const event = new CustomEvent('open-subscription-modal');
              window.dispatchEvent(event);
            } else {
              // Navigate to account page with upgrade parameter
              window.location.href = '/account?upgrade=true';
            }
          },
          variant: "default" as const
        };
      
      case ErrorType.SUBSCRIPTION_CANCELLED:
        return {
          label: "Renew Subscription",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      
      case ErrorType.CREDIT_INSUFFICIENT:
        return {
          label: "Buy Credits",
          onClick: () => {
            // Try to open credit manager if on account page
            if (window.location.pathname === '/account') {
              const event = new CustomEvent('open-credit-manager');
              window.dispatchEvent(event);
            } else {
              // Navigate to account page with credits parameter
              window.location.href = '/account?credits=true';
            }
          },
          variant: "default" as const
        };
      
      case ErrorType.PLAN_UPGRADE_REQUIRED:
        return {
          label: "Upgrade Plan",
          onClick: () => {
            // Try to open subscription modal if on account page
            if (window.location.pathname === '/account') {
              const event = new CustomEvent('open-subscription-modal');
              window.dispatchEvent(event);
            } else {
              // Navigate to account page with upgrade parameter
              window.location.href = '/account?upgrade=true';
            }
          },
          variant: "default" as const
        };
      
      case ErrorType.SPENDING_LIMIT_EXCEEDED:
        return {
          label: "Manage Limits",
          onClick: () => {
            // Try to open subscription modal if on account page for limit management
            if (window.location.pathname === '/account') {
              const event = new CustomEvent('open-subscription-modal');
              window.dispatchEvent(event);
            } else {
              // Navigate to account page with limits parameter
              window.location.href = '/account?limits=true';
            }
          },
          variant: "default" as const
        };
      
      case ErrorType.SUBSCRIPTION_CONFLICT:
      case ErrorType.INVOICE_ERROR:
        return {
          label: "Contact Support",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "outline" as const
        };
      
      case ErrorType.ACTION_REQUIRED:
        return {
          label: "Take Action",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "default" as const
        };
      
      case ErrorType.PERMISSION_ERROR:
      case ErrorType.CONFIGURATION_ERROR:
        return {
          label: "Check Settings",
          onClick: () => {
            window.location.pathname = '/settings';
          },
          variant: "outline" as const
        };
      
      case ErrorType.DATABASE_ERROR:
      case ErrorType.INTERNAL_ERROR:
        return {
          label: "Refresh Page",
          onClick: () => {
            window.location.reload();
          },
          variant: "outline" as const
        };
      
      case ErrorType.NETWORK_ERROR:
        return {
          label: "Retry",
          onClick: () => {
            window.location.reload();
          },
          variant: "outline" as const
        };
      
      case ErrorType.VALIDATION_ERROR:
        return {
          label: "Review Input",
          onClick: () => {
            const activeElement = document.activeElement;
            if (activeElement && 'focus' in activeElement) {
              (activeElement as HTMLElement).focus();
            }
          },
          variant: "outline" as const
        };
      
      case ErrorType.WORKFLOW_ERROR:
        if (workflowContext?.workflowId) {
          return {
            label: "View Workflow Details",
            onClick: () => {
              const event = new CustomEvent('show-workflow-details', {
                detail: { workflowId: workflowContext.workflowId }
              });
              window.dispatchEvent(event);
            },
            variant: "outline" as const
          };
        } else if (workflowContext?.stageJobId) {
          return {
            label: "View Stage Job",
            onClick: () => {
              const event = new CustomEvent('show-job-details', {
                detail: { jobId: workflowContext.stageJobId }
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
      
      case ErrorType.NOT_FOUND_ERROR:
        return {
          label: "Go Back",
          onClick: () => {
            window.history.back();
          },
          variant: "outline" as const
        };
      
      default:
        return undefined;
    }
  }, []);

  // Helper function to get error titles
  const getErrorTitle = useCallback((errorType: ErrorType) => {
    switch (errorType) {
      case ErrorType.PAYMENT_FAILED:
      case ErrorType.PAYMENT_DECLINED:
        return "Billing Error";
      case ErrorType.ACTION_REQUIRED:
      case ErrorType.PAYMENT_METHOD_REQUIRED:
      case ErrorType.BILLING_ADDRESS_REQUIRED:
      case ErrorType.PAYMENT_AUTHENTICATION_REQUIRED:
        return "Action Required";
      case ErrorType.SUBSCRIPTION_EXPIRED:
        return "Subscription Expired";
      case ErrorType.SUBSCRIPTION_CANCELLED:
        return "Subscription Cancelled";
      case ErrorType.CREDIT_INSUFFICIENT:
        return "Insufficient Credits";
      case ErrorType.PLAN_UPGRADE_REQUIRED:
        return "Upgrade Required";
      case ErrorType.SPENDING_LIMIT_EXCEEDED:
        return "Spending Limit Exceeded";
      case ErrorType.SUBSCRIPTION_CONFLICT:
        return "Subscription Conflict";
      case ErrorType.INVOICE_ERROR:
        return "Invoice Error";
      case ErrorType.PERMISSION_ERROR:
        return "Access Denied";
      case ErrorType.CONFIGURATION_ERROR:
        return "Configuration Error";
      case ErrorType.NETWORK_ERROR:
        return "Connection Error";
      case ErrorType.DATABASE_ERROR:
        return "Database Error";
      case ErrorType.WORKFLOW_ERROR:
        return "Workflow Error";
      case ErrorType.VALIDATION_ERROR:
        return "Invalid Input";
      case ErrorType.NOT_FOUND_ERROR:
        return "Not Found";
      case ErrorType.INTERNAL_ERROR:
        return "System Error";
      case ErrorType.UNKNOWN_ERROR:
        return "Unexpected Error";
      default:
        return "Error";
    }
  }, []);

  const showError = useCallback((error: unknown, context?: string, userContext?: string) => {
    void logError(error, context || 'User Notification');
    
    const errorInfo = extractErrorInfo(error);
    const userMessage = createUserFriendlyErrorMessage(errorInfo, userContext);
    
    const getDuration = () => {
      const criticalErrors = [
        ErrorType.PAYMENT_FAILED, ErrorType.PAYMENT_DECLINED, ErrorType.SUBSCRIPTION_EXPIRED,
        ErrorType.SUBSCRIPTION_CANCELLED, ErrorType.CREDIT_INSUFFICIENT, ErrorType.PLAN_UPGRADE_REQUIRED,
        ErrorType.PAYMENT_METHOD_REQUIRED, ErrorType.BILLING_ADDRESS_REQUIRED, ErrorType.PAYMENT_AUTHENTICATION_REQUIRED,
        ErrorType.SPENDING_LIMIT_EXCEEDED, ErrorType.SUBSCRIPTION_CONFLICT, ErrorType.INVOICE_ERROR,
        ErrorType.ACTION_REQUIRED, ErrorType.CONFIGURATION_ERROR, ErrorType.DATABASE_ERROR, ErrorType.INTERNAL_ERROR
      ];
      
      if (criticalErrors.includes(errorInfo.type)) return 0;
      if ([ErrorType.PERMISSION_ERROR, ErrorType.WORKFLOW_ERROR, ErrorType.NOT_FOUND_ERROR].includes(errorInfo.type)) return 10000;
      if (errorInfo.type === ErrorType.VALIDATION_ERROR) return 8000;
      if (errorInfo.type === ErrorType.NETWORK_ERROR) return 6000;
      
      return 8000;
    };
    
    showNotification({
      title: getErrorTitle(errorInfo.type),
      message: userMessage,
      type: "error",
      duration: getDuration(),
      actionButton: getActionButton(errorInfo.type, errorInfo.workflowContext)
    });
  }, [showNotification, getActionButton, getErrorTitle]);
  
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
