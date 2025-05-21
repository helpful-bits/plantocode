import { Loader2 } from "lucide-react";
import type { FC, ReactNode } from "react";

import { Card } from "./card";


interface DataCardProps {
  title: string;
  description?: string;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  children: ReactNode;
  headerAction?: ReactNode;
  footerAction?: ReactNode;
}

/**
 * DataCard component
 *
 * A consistent card pattern for displaying data with loading and error states
 * Includes optional header and footer action slots
 */
export const DataCard: FC<DataCardProps> = ({
  title,
  description,
  isLoading = false,
  error = null,
  className = "",
  children,
  headerAction,
  footerAction,
}) => {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
        {headerAction && <div className="ml-4">{headerAction}</div>}
      </div>

      {/* Content area */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Loading data...</p>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
            {error}
          </div>
        ) : (
          children
        )}
      </div>

      {/* Footer with optional action */}
      {footerAction && (
        <div className="border-t px-4 py-3 bg-muted/30">{footerAction}</div>
      )}
    </Card>
  );
};

export default DataCard;
