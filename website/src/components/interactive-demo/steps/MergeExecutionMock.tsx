// Step 13: Merge Execution Mock - Ultra-simplified, always renders
'use client';

import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';

export function MergeExecutionMock({ isInView: _isInView, progress }: { isInView: boolean; progress: number }) {
  const shouldPulse = progress > 0.3 && progress < 0.6;
  const shouldShowLoading = progress > 0.6 && progress < 0.8;
  const shouldShowSuccess = progress > 0.8;

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="relative">
        {!shouldShowLoading && !shouldShowSuccess ? (
          <DesktopButton
            variant="default"
            size="lg"
            className={`
              transition-all duration-300 px-8 py-3 text-base font-semibold
              ${shouldPulse ? 'animate-pulse bg-primary/90 shadow-lg ring-2 ring-primary/30' : ''}
            `}
          >
            <span className="flex items-center gap-2">
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" 
                />
              </svg>
              Execute Merge Plans
            </span>
          </DesktopButton>
        ) : shouldShowLoading ? (
          <DesktopButton
            variant="default"
            size="lg"
            isLoading
            disabled
            className="px-8 py-3 text-base font-semibold"
          >
            Merging Branches...
          </DesktopButton>
        ) : (
          <DesktopBadge 
            variant="success" 
            className="px-6 py-3 text-base font-semibold animate-pulse"
          >
            <span className="flex items-center gap-2">
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M5 13l4 4L19 7" 
                />
              </svg>
              Merged Successfully!
            </span>
          </DesktopBadge>
        )}
      </div>
      
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {shouldShowSuccess 
          ? "All branches have been merged without conflicts. Ready for testing."
          : shouldShowLoading
          ? "Applying merge strategy and resolving conflicts..."
          : "Click to execute the AI-generated merge plan"
        }
      </p>
    </div>
  );
}