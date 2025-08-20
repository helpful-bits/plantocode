// Step 5: Text Improvement Mock - Exactly matches desktop behavior
'use client';

import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopJobCard } from '../desktop-ui/DesktopJobCard';
import { Sparkles, CheckCircle, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';

interface TextImprovementMockProps {
  isInView: boolean;
  progress: number;
}


export function TextImprovementMock({ isInView: _isInView, progress }: TextImprovementMockProps) {
  const { setTextEnhancementState } = useInteractiveDemoContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derive enhancement state from progress
  const enhancementState = (() => {
    if (progress < 0.2) return 'idle' as const;
    if (progress < 0.4) return 'text-selected' as const;
    if (progress < 0.8) return 'processing' as const;
    return 'completed' as const;
  })();
  
  // Progress-derived state
  const textValue = enhancementState === 'completed' 
    ? "I need to understand how user auth works in React app. The login stuff and maybe JWT tokens or something, also need to check routes are protected and users can't access things they shouldn't. Want to make sure sessions work properly and security is good."
    : "i need to understadn how user auth works in react app. the login stuff and maybe jwt tokens or something, also need to check routes are protected and users cant access things they shouldnt. want to make sure sessions work properly and securtiy is good";
  
  const showSelection = enhancementState === 'text-selected';
  const showHighlight = enhancementState === 'completed';
  const jobProgress = enhancementState === 'processing' ? Math.min(95, Math.floor(((progress - 0.4) / 0.4) * 95)) : enhancementState === 'completed' ? 100 : 0;
  const popoverPosition = { x: 300, y: 80 };
  const buttonClicked = progress >= 0.35 && progress < 0.4;

  // Publish state to context
  useEffect(() => {
    setTextEnhancementState(enhancementState);
  }, [enhancementState, setTextEnhancementState]);


  const handleTextareaSelection = () => {
    // This would normally handle real user selection
    // For the demo, we control this through the animation
  };

  // Helper function to render text with selection or correction highlighting
  const renderHighlightedText = () => {
    // Show blue selection highlighting when text is selected (ALL text)
    if (showSelection && enhancementState === 'text-selected') {
      const highlightedText = `<span class="bg-primary/20 dark:bg-primary/10 px-1 rounded transition-all duration-300">${textValue}</span>`;
      
      return <div dangerouslySetInnerHTML={{ __html: highlightedText }} />;
    }

    // Show teal correction highlighting when completed
    if (showHighlight && enhancementState === 'completed') {
      // Define all the corrections made (original -> corrected)
      const corrections = [
        { original: "i need", corrected: "I need" },
        { original: "understadn", corrected: "understand" },
        { original: "react app", corrected: "React app" },
        { original: "jwt tokens", corrected: "JWT tokens" },
        { original: "cant access", corrected: "can't access" },
        { original: "shouldnt", corrected: "shouldn't" },
        { original: "want to make", corrected: "Want to make" },
        { original: "securtiy", corrected: "security" },
        { original: "is good", corrected: "is good." }
      ];

      // Highlight only the corrected parts
      let highlightedText = textValue;
      corrections.forEach(({ corrected }) => {
        highlightedText = highlightedText.replace(
          corrected,
          `<span class="bg-gradient-to-r from-teal-100 via-teal-200 to-teal-100 dark:from-teal-800/40 dark:via-teal-700/60 dark:to-teal-800/40 px-1 rounded transition-all duration-1000 ease-in-out animate-pulse">${corrected}</span>`
        );
      });
      
      return <div dangerouslySetInnerHTML={{ __html: highlightedText }} />;
    }

    // Default return for all other states
    return textValue;
  };


  return (
    <div className="w-full space-y-4">
      {/* Custom CSS for visible text selection */}
      <style jsx>{`
        .selection-visible::selection {
          background-color: #3b82f6 !important;
          color: white !important;
        }
        .selection-visible::-moz-selection {
          background-color: #3b82f6 !important;
          color: white !important;
        }
      `}</style>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">
          Task Description
        </label>
        <div className="relative">
          {(showSelection && enhancementState === 'text-selected') || (showHighlight && enhancementState === 'completed') ? (
            <div 
              className="w-full border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 resize-y font-normal shadow-soft transition-all duration-300 min-h-[120px] whitespace-pre-wrap text-sm"
              style={{ 
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif', 
                fontSize: '14px', 
                lineHeight: '1.5' 
              }}
            >
              {renderHighlightedText()}
            </div>
          ) : (
            <DesktopTextarea
              ref={textareaRef}
              value={textValue}
              onChange={() => {}} // Read-only in demo
              onSelect={handleTextareaSelection}
              placeholder="Describe what you want to implement..."
              rows={(enhancementState as 'idle' | 'text-selected' | 'processing' | 'completed') === 'completed' ? 5 : 4}
              className="w-full border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 resize-y font-normal shadow-soft transition-all duration-300"
              readOnly
            />
          )}
          
          {/* Enhancement Popover - appears near selected text */}
          {enhancementState === 'text-selected' && (
            <div 
              className="absolute z-10 animate-in fade-in-0 zoom-in-95 duration-200"
              style={{
                left: `${popoverPosition.x}px`,
                top: `${popoverPosition.y}px`,
                transform: 'translate(-50%, 0)'
              }}
            >
              <DesktopButton
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 w-7 p-0 bg-card/90 hover:bg-card border border-border/50 backdrop-blur-sm cursor-pointer shadow-lg transition-all duration-150",
                  buttonClicked && "bg-primary/20 border-primary/40 scale-95"
                )}
                aria-label="Improve text"
              >
                <Sparkles className={cn(
                  "h-3 w-3 transition-all duration-150",
                  buttonClicked ? "text-primary" : "text-foreground"
                )} />
              </DesktopButton>
            </div>
          )}
          
          {/* Processing Popover - shows loading state */}
          {enhancementState === 'processing' && (
            <div 
              className="absolute z-10 animate-in fade-in-0 zoom-in-95 duration-200"
              style={{
                left: `${popoverPosition.x}px`,
                top: `${popoverPosition.y}px`,
                transform: 'translate(-50%, 0)'
              }}
            >
              <DesktopButton
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 bg-card/90 hover:bg-card border border-border/50 backdrop-blur-sm cursor-pointer shadow-lg"
                disabled
                aria-label="Improving text..."
              >
                <Sparkles className="h-3 w-3 text-foreground animate-pulse" />
              </DesktopButton>
            </div>
          )}
        </div>
      </div>

      {/* Text Enhancement Job Card - Exactly matches desktop screenshot */}
      {(enhancementState === 'processing' || enhancementState === 'completed') && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <DesktopJobCard>
            
            {/* Header Row - Icon, Status, Title, Close */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex-shrink-0",
                  enhancementState === 'completed' ? "text-green-600" : "text-gray-600"
                )}>
                  {enhancementState === 'completed' ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <span className={cn(
                  "font-medium text-xs",
                  enhancementState === 'completed' ? "text-foreground" : "text-foreground"
                )}>
                  {enhancementState === 'completed' ? 'Completed' : 'Processing'}
                </span>
                <span className="font-medium text-foreground text-xs">
                  Text Improvement
                </span>
              </div>
              <div className="flex-shrink-0">
                {enhancementState === 'completed' ? (
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
                ) : (
                  <div className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Timestamp */}
            <div className="mb-3">
              <span className="text-muted-foreground text-xs">
                {enhancementState === 'completed' ? '13 minutes ago' : 'just now'}
              </span>
            </div>

            {/* Progress Section - only show when processing */}
            {enhancementState === 'processing' && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground text-xs">Finding available processor...</span>
                  <span className="text-muted-foreground text-xs font-medium">{jobProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                  <div 
                    className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${jobProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Model Info */}
            {enhancementState === 'processing' ? (
              <div className="flex items-center justify-between mb-3">
                <span className="text-muted-foreground text-xs">
                  anthropic/claude-sonnet-4-20250514
                </span>
                <span className="text-muted-foreground text-xs">1s</span>
              </div>
            ) : (
              <div className="space-y-1 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    Tokens: <span className="text-foreground font-medium">216 → 72</span>
                  </span>
                  <span className="text-muted-foreground text-xs">2s</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  anthropic/claude-sonnet-4-20250514
                </div>
              </div>
            )}

            {/* Results Section - only show when completed */}
            {enhancementState === 'completed' && (
              <>
                <div className="mb-3">
                  <span className="text-foreground font-medium text-xs">
                    Text improved
                  </span>
                </div>
                <div className="flex justify-end">
                  <span className="text-muted-foreground text-xs">
                    $0.001728
                  </span>
                </div>
              </>
            )}
          </DesktopJobCard>
        </div>
      )}
      
    </div>
  );
}