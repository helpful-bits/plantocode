"use client";

import { AlertCircle } from "lucide-react";
import { FC } from "react";

interface StatusMessagesProps {
  error: Error | null;
  clearFeedback: string | null;
  isCollapsed: boolean;
}

/**
 * Component for rendering error and feedback messages
 * Typically used in sidebar or control panels
 */
export const StatusMessages: FC<StatusMessagesProps> = ({
  error,
  clearFeedback,
  isCollapsed,
}) => {
  // Don't render anything if collapsed or no messages to show
  if (isCollapsed || (!error && !clearFeedback)) return null;

  return (
    <>
      {/* Error message */}
      {error && (
        <div className="bg-warning/10 border border-warning/30 text-warning px-4 py-3 text-xs mx-4 mt-3 rounded-lg shadow-soft backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertCircle className="h-4 w-4 text-warning" />
            <span className="font-medium">Error</span>
          </div>
          <div className="text-xs text-balance text-warning">{error.message}</div>
        </div>
      )}

      {/* Feedback message for clear operations */}
      {clearFeedback && (
        <div className="bg-success/15 border border-success/30 text-success px-4 py-3 text-xs mx-4 mt-3 mb-3 rounded-lg shadow-soft backdrop-blur-sm">
          <div className="text-xs text-balance text-success">{clearFeedback}</div>
        </div>
      )}
    </>
  );
};

StatusMessages.displayName = "StatusMessages";