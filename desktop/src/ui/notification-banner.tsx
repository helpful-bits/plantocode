import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useState, useEffect, FC, ReactNode } from "react";

type NotificationVariant = "info" | "success" | "warning" | "error";

interface NotificationBannerProps {
  variant?: NotificationVariant;
  title: string;
  message?: string;
  isVisible?: boolean;
  onDismiss?: () => void;
  autoClose?: boolean;
  autoCloseDelay?: number;
  className?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * NotificationBanner component
 *
 * A consistent banner for displaying various types of notifications
 * with optional auto-close functionality
 */
export const NotificationBanner: FC<NotificationBannerProps> = ({
  variant = "info",
  title,
  message,
  isVisible = true,
  onDismiss,
  className = "",
  icon,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(isVisible);


  // Update open state when isVisible changes
  useEffect(() => {
    setIsOpen(isVisible);
  }, [isVisible]);

  // Handle dismiss click
  const handleDismiss = () => {
    setIsOpen(false);
    if (onDismiss) onDismiss();
  };

  // Don't render if not open
  if (!isOpen) return null;

  // Variant-specific styles
  const variantStyles = {
    info: {
      container: "bg-info/10 border-info/30",
      icon: <Info className="h-5 w-5 text-info" />,
      title: "text-info",
      message: "text-info",
    },
    success: {
      container: "bg-success/15 border-success/30",
      icon: <CheckCircle2 className="h-5 w-5 text-success" />,
      title: "text-success",
      message: "text-success",
    },
    warning: {
      container: "bg-warning/10 border-warning/30",
      icon: <AlertCircle className="h-5 w-5 text-warning" />,
      title: "text-warning",
      message: "text-warning",
    },
    error: {
      container: "bg-destructive/10 border-destructive/20",
      icon: <AlertCircle className="h-5 w-5 text-destructive" />,
      title: "text-destructive",
      message: "text-destructive/80",
    },
  };

  return (
    <div
      className={`border rounded-lg p-4 mb-4 shadow-soft backdrop-blur-sm ${variantStyles[variant].container} ${className}`}
    >
      <div className="flex">
        <div className="flex-shrink-0">
          {icon || variantStyles[variant].icon}
        </div>
        <div className="ml-3 flex-grow">
          <h3 className={`text-sm font-medium ${variantStyles[variant].title}`}>
            {title}
          </h3>
          {message && (
            <div className={`mt-1 text-sm ${variantStyles[variant].message}`}>
              <p>{message}</p>
            </div>
          )}
          {children && <div className="mt-2">{children}</div>}
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              type="button"
              className="inline-flex rounded-lg p-1.5 hover:bg-muted/50 focus-ring transition-colors"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationBanner;