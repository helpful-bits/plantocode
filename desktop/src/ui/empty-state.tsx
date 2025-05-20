import { FolderOpen, Search, AlertCircle } from "lucide-react";

import { Button } from "./button";

import type React from "react";


type EmptyStateVariant = "default" | "no-data" | "no-results" | "error";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

/**
 * EmptyState component
 *
 * A consistent pattern for displaying empty states, such as:
 * - No data available
 * - No search results
 * - Error states
 * - Custom empty states
 *
 * Includes support for primary and secondary actions
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = "default",
  title,
  description,
  icon,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  className = "",
}) => {
  // Default icons based on variant
  const getDefaultIcon = () => {
    switch (variant) {
      case "no-data":
        return <FolderOpen className="h-12 w-12 text-muted-foreground/70" />;
      case "no-results":
        return <Search className="h-12 w-12 text-muted-foreground/70" />;
      case "error":
        return <AlertCircle className="h-12 w-12 text-destructive/70" />;
      default:
        return <FolderOpen className="h-12 w-12 text-muted-foreground/70" />;
    }
  };

  // Variant-specific classes
  const variantClasses = {
    default: "bg-muted/30",
    "no-data": "bg-muted/30",
    "no-results": "bg-muted/30",
    error: "bg-destructive/5",
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 rounded-lg border border-dashed ${variantClasses[variant]} ${className}`}
    >
      <div className="text-center">
        <div className="mx-auto mb-4">{icon || getDefaultIcon()}</div>

        <h3
          className={`text-lg font-medium mb-2 ${variant === "error" ? "text-destructive" : "text-foreground"}`}
        >
          {title}
        </h3>

        {description && (
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            {description}
          </p>
        )}

        {(actionText || secondaryActionText) && (
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            {actionText && onAction && (
              <Button
                onClick={onAction}
                variant={variant === "error" ? "destructive" : "default"}
                size="sm"
              >
                {actionText}
              </Button>
            )}

            {secondaryActionText && onSecondaryAction && (
              <Button onClick={onSecondaryAction} variant="outline" size="sm">
                {secondaryActionText}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
