// Step 13: Merge Execution Mock - Ultra-simplified, always renders
'use client';

import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { useTimedCycle } from '../hooks';

// Define phases outside component to prevent recreation on each render
const MERGE_EXECUTION_PHASES = [
  { name: 'pulse' as const, durationMs: 3500 },   // Button pulsing (reduced from 4800ms)
  { name: 'loading' as const, durationMs: 1500 }, // Loading state (reduced from 2000ms)
  { name: 'success' as const, durationMs: 2000 }, // Success state
  { name: 'wait' as const, durationMs: 700 }      // Brief pause (reduced from 800ms)
];

export function MergeExecutionMock({ isInView }: { isInView: boolean; resetKey?: number }) {

  const { phaseName: phase } = useTimedCycle({
    active: isInView,
    phases: MERGE_EXECUTION_PHASES,
    loop: true,
    resetOnDeactivate: true
  });
  
  // Derive states from phaseName
  const shouldPulse = phase === 'pulse';
  const shouldShowLoading = phase === 'loading';
  const shouldShowSuccess = phase === 'success';

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