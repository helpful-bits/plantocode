// Step 1: Project Directory Selector Mock
'use client';

import { DesktopInput } from '../desktop-ui/DesktopInput';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { useTimedLoop, useTypewriter } from '../hooks';
import { FolderOpen, X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ProjectSelectorMockProps {
  isInView: boolean;
  resetKey?: number;
}

export function ProjectSelectorMock({ isInView }: ProjectSelectorMockProps) {
  const samplePath = "/Users/sarah/dev/my-awesome-project";
  const [successVisible, setSuccessVisible] = useState(false);
  
  // Use timing-based loop with 5s cycle and 200ms idle delay
  const { t } = useTimedLoop(isInView, 5000, { idleDelayMs: 200, resetOnDeactivate: true });
  
  // Use typewriter for path during 0.1-0.5 window, but keep text after completion
  const showTyping = t >= 0.1 && t < 0.5;
  const { displayText: typedText } = useTypewriter({ active: showTyping, text: samplePath, durationMs: 1500 });
  
  // Keep the full text visible after typing completes
  const autoFilledText = t >= 0.5 ? samplePath : typedText;
  
  // Show success hint during 0.6-1.0 window (after typing completes)

  useEffect(() => {
    if (!isInView) { setSuccessVisible(false); return; }
    if (t < 0.6) {
      setSuccessVisible(false);
    } else {
      setSuccessVisible(true);
    }
  }, [t, isInView]);

  return (
    <div className="w-full">
      <form className="w-full">
        <div className="flex flex-col space-y-3 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <label className="text-xs sm:text-sm font-medium text-foreground flex-shrink-0">
              Project root:
            </label>
            <div className="flex items-center flex-1 group">
              <div className="relative flex-1 border border-[oklch(0.90_0.04_195_/_0.5)] rounded-l-lg bg-background/80 backdrop-blur-sm focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-ring/50 transition-all duration-200 hover:border-[oklch(0.90_0.04_195_/_0.7)]">
                <DesktopInput
                  value={autoFilledText}
                  placeholder="Enter project directory path"
                  className="border-0 bg-transparent focus-visible:ring-0 pr-12 sm:pr-16 h-8 sm:h-10 text-xs sm:text-sm"
                />
                {autoFilledText && (
                  <DesktopButton
                    variant="ghost"
                    size="xs"
                    className="absolute right-8 sm:right-10 top-1/2 -translate-y-1/2 h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    aria-label="Clear input"
                  >
                    <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </DesktopButton>
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

          {successVisible && (
            <p className="text-xs px-1 text-green-500">
              Perfect! Project directory selected successfully.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

export default ProjectSelectorMock;