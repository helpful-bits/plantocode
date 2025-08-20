// Step 1: Project Directory Selector Mock
'use client';

import { DesktopInput } from '../desktop-ui/DesktopInput';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { useAutoFillText, useDelayedVisibility } from '../hooks/useScrollOrchestration';
import { FolderOpen, X } from 'lucide-react';

interface ProjectSelectorMockProps {
  isInView: boolean;
  progress: number;
}

export function ProjectSelectorMock({ isInView, progress }: ProjectSelectorMockProps) {
  const samplePath = "/Users/sarah/dev/my-awesome-project";
  const autoFilledText = useAutoFillText(samplePath, isInView && progress > 0.2, 500);
  const showSuccessHint = useDelayedVisibility(progress > 0.7, 300);

  return (
    <div className="w-full">
      <form className="w-full">
        <div className="flex flex-col space-y-3 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <label className="text-xs sm:text-sm font-medium text-foreground flex-shrink-0">
              Project root:
            </label>
            <div className="flex items-center flex-1 group">
              <div className="relative flex-1 border border-border/50 rounded-l-lg bg-background/80 backdrop-blur-sm focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-ring/50 transition-all duration-200 hover:border-border/70">
                <DesktopInput
                  value={autoFilledText}
                  placeholder="Enter project directory path"
                  className="border-0 bg-transparent focus-visible:ring-0 pr-12 sm:pr-16 h-8 sm:h-10 text-xs sm:text-sm"
                />
                {autoFilledText && (
                  <button
                    type="button"
                    className="absolute right-8 sm:right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-ring rounded-sm p-1 hover:bg-accent/50 transition-colors"
                    aria-label="Clear input"
                  >
                    <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </button>
                )}
              </div>

              <DesktopButton
                variant="outline"
                size="sm"
                className="h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center border-l-0 rounded-l-none rounded-r-lg hover:bg-accent/80 transition-colors group-focus-within:border-primary/30 group-focus-within:ring-2 group-focus-within:ring-ring/50"
                aria-label="Browse directories"
              >
                <FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </DesktopButton>
            </div>
          </div>

          {showSuccessHint && (
            <p className="text-xs px-1 text-green-500">
              Perfect! Project directory selected successfully.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}