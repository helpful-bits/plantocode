import { Loader2 } from "lucide-react";
import { FC } from "react";

// Note: GlobalLoadingIndicator has been moved to its own file: global-loading-indicator.tsx

/**
 * Inline spinner component for use within buttons or form elements
 */
export const Spinner: FC<{
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}> = ({ className = "", size = "md" }) => {
  const sizeClasses = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
  );
};