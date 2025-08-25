// Step 5: Text Improvement Mock - Exactly matches desktop behavior
'use client';

import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { Sparkles, CheckCircle, Trash2, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';
import { useTimedCycle, useTweenNumber } from '../hooks';

interface TextImprovementMockProps {
  isInView: boolean;
  resetKey?: number;
}


// Define phases outside component to prevent recreation on each render
const TEXT_IMPROVEMENT_PHASES = [
  { name: 'idle' as const, durationMs: 800 },           // Brief initial state
  { name: 'text-selecting' as const, durationMs: 1200 }, // Animated text selection
  { name: 'text-selected' as const, durationMs: 1500 },   // Selection complete, then button appears after delay
  { name: 'button-clicked' as const, durationMs: 400 },  // Button click animation
  { name: 'processing' as const, durationMs: 4000 },     // Background job processing
  { name: 'completed' as const, durationMs: 3000 },      // Results shown
  { name: 'wait' as const, durationMs: 1000 }            // Brief pause before loop
];

export function TextImprovementMock({ isInView }: TextImprovementMockProps) {
  const { setTextEnhancementState } = useInteractiveDemoContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { phaseName: enhancementState, phaseProgress01: phaseProgress } = useTimedCycle({
    active: isInView,
    phases: TEXT_IMPROVEMENT_PHASES,
    loop: true,
    resetOnDeactivate: true
  });
  
  // Use tween for job progress during processing phase
  const { value: jobProgress } = useTweenNumber({
    from: 0,
    to: 95, // Progress to 95% during processing, then disappears
    active: enhancementState === 'processing',
    durationMs: 3800, // Match most of the processing phase duration (4000ms)
    loop: false // Single smooth progression, no looping
  });
  
  // Token streaming animation - simulate output tokens being generated
  const { value: outputTokens } = useTweenNumber({
    from: 216, // Starting input tokens
    to: 288, // Final output tokens (216 input + 72 output)
    active: enhancementState === 'processing',
    durationMs: 3800, // Match processing duration
    loop: false
  });
  
  
  // State-derived properties
  const textValue = enhancementState === 'completed' 
    ? "I need to understand how user auth works in React app. The login stuff and maybe JWT tokens or something, also need to check routes are protected and users can't access things they shouldn't. Want to make sure sessions work properly and security is good."
    : "i need to understadn how user auth works in react app. the login stuff and maybe jwt tokens or something, also need to check routes are protected and users cant access things they shouldnt. want to make sure sessions work properly and securtiy is good";
  
  // Selection should show during selecting, selected, button-clicked, and processing phases
  const showSelection = ['text-selecting', 'text-selected', 'button-clicked', 'processing'].includes(enhancementState);
  const showHighlight = enhancementState === 'completed';
  const popoverPosition = { x: 300, y: 80 };
  const buttonClicked = enhancementState === 'button-clicked';
  // Button appears with a 500ms delay after text selection is complete
  const showSparklesButton = (enhancementState === 'text-selected' && phaseProgress > 0.33) || enhancementState === 'button-clicked';
  const isSelecting = enhancementState === 'text-selecting';
  const selectionProgress = isSelecting ? phaseProgress : 1;

  // Publish state to context
  useEffect(() => {
    let contextState: 'idle' | 'completed' | 'text-selected' | 'processing';
    
    if (enhancementState === 'wait' || enhancementState === 'idle') {
      contextState = 'idle';
    } else if (enhancementState === 'text-selecting' || enhancementState === 'text-selected' || enhancementState === 'button-clicked') {
      contextState = 'text-selected';
    } else if (enhancementState === 'processing') {
      contextState = 'processing';
    } else if (enhancementState === 'completed') {
      contextState = 'completed';
    } else {
      contextState = 'idle';
    }
    
    setTextEnhancementState(contextState);
  }, [enhancementState, setTextEnhancementState]);


  const handleTextareaSelection = () => {
    // This would normally handle real user selection
    // For the demo, we control this through the animation
  };

  // Helper function to render text with selection or correction highlighting
  const renderHighlightedText = () => {
    // Show selection highlighting during selecting, selected, button-clicked, and processing phases
    if (showSelection && ['text-selecting', 'text-selected', 'button-clicked', 'processing'].includes(enhancementState)) {
      // Calculate how much text should be highlighted based on selection progress
      const textLength = textValue.length;
      const highlightLength = Math.floor(textLength * selectionProgress);
      const highlightedPart = textValue.slice(0, highlightLength);
      const remainingPart = textValue.slice(highlightLength);
      
      const highlightedText = `<span style="background-color: rgba(34, 197, 94, 0.3); padding: 2px 4px; border-radius: 4px; transition: all 150ms;">${highlightedPart}</span>${remainingPart}`;
      
      return <div dangerouslySetInnerHTML={{ __html: highlightedText }} />;
    }

    // Show teal correction highlighting when completed
    if (showHighlight && enhancementState === 'completed') {
      return (
        <div className="whitespace-pre-wrap">
          <span className="bg-primary/15 rounded px-0.5 transition-opacity duration-200">
            {textValue}
          </span>
        </div>
      );
    }

    // Default return for all other states
    return textValue;
  };


  return (
    <div className="w-full space-y-4">
      {/* Custom CSS for visible text selection and cursor animation */}
      <style jsx>{`
        .selection-visible::selection {
          background-color: #3b82f6 !important;
          color: white !important;
        }
        .selection-visible::-moz-selection {
          background-color: #3b82f6 !important;
          color: white !important;
        }
        .text-selecting {
          cursor: text !important;
        }
        .text-selecting::after {
          content: '';
          display: inline-block;
          width: 1px;
          height: 1.2em;
          background: currentColor;
          animation: blink 1s infinite;
          margin-left: 2px;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">
          Task Description
        </label>
        <div className="relative">
          {(showSelection && ['text-selecting', 'text-selected', 'button-clicked', 'processing'].includes(enhancementState)) || (showHighlight && enhancementState === 'completed') ? (
            <div 
              className={cn(
                "min-h-[120px] w-full rounded-xl border border-[oklch(0.90_0.04_195_/_0.5)] bg-background backdrop-blur-sm text-foreground px-3 py-2 text-sm font-normal shadow-soft transition-all duration-300 whitespace-pre-wrap",
                isSelecting && "text-selecting"
              )}
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
          
          {/* Enhancement Popover - appears when text is fully selected */}
          {showSparklesButton && (
            <div 
              className={cn(
                "absolute z-10 transition-all duration-200",
                enhancementState === 'text-selected' ? "animate-in fade-in-0 zoom-in-95" : "",
                buttonClicked ? "animate-pulse" : ""
              )}
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
                  "h-7 w-7 p-0 bg-card/90 hover:bg-card border border-[oklch(0.90_0.04_195_/_0.4)] backdrop-blur-sm cursor-pointer shadow-lg transition-all duration-150",
                  buttonClicked && "bg-primary/30 border-primary/60 scale-90 shadow-inner",
                  !buttonClicked && enhancementState === 'text-selected' && "hover:scale-105 hover:shadow-xl"
                )}
                aria-label="Improve text"
              >
                <Sparkles className={cn(
                  "h-3 w-3 transition-all duration-150",
                  buttonClicked ? "text-primary scale-110" : "text-foreground"
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
                className="h-7 w-7 p-0 bg-card/90 hover:bg-card border border-[oklch(0.90_0.04_195_/_0.4)] backdrop-blur-sm cursor-pointer shadow-lg"
                disabled
                aria-label="Improving text..."
              >
                <Sparkles className="h-3 w-3 text-foreground animate-pulse" />
              </DesktopButton>
            </div>
          )}
        </div>
      </div>

      {/* Text Enhancement Job Card - Only appears with delay after button click */}
      {(enhancementState === 'processing' || enhancementState === 'completed' || enhancementState === 'wait') && (
        <div className="animate-in slide-in-from-bottom-4 duration-500 delay-300">
          <div
            className={cn(
              "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-[320px] overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
            )}
            style={{
              minHeight: "140px",
            }}
            role="button"
            tabIndex={0}
          >
            {/* TOP ROW: Icon + Job Name + Badge | Close Button */}
            <div className="flex items-center justify-between mb-2 w-full min-w-0">
              <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
                  {(enhancementState === 'completed' || enhancementState === 'wait') ? (
                    <CheckCircle className="h-3 w-3 text-success" />
                  ) : enhancementState === 'processing' ? (
                    <Loader2 className="h-3 w-3 text-primary animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 text-info" />
                  )}
                </span>
                <span className="truncate text-foreground">Text Improvement</span>
                <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                  Text Improvement
                </DesktopBadge>
              </div>
              <div className="w-6 h-6 flex-shrink-0">
                <DesktopButton
                  variant="ghost"
                  size="xs"
                  className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Delete job"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </DesktopButton>
              </div>
            </div>

            {/* TIME ROW */}
            <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
              <span>{enhancementState === 'processing' ? 'just now' : (enhancementState === 'completed' || enhancementState === 'wait') ? 'just now' : 'just now'}</span>
            </div>

            {/* PROGRESS BAR (only for running jobs) */}
            {enhancementState === 'processing' && (
              <div className="mt-2 mb-1">
                <DesktopProgress value={jobProgress} className="h-1" />
                <div className="flex justify-between items-center min-w-0 overflow-hidden">
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                    Improving text clarity and accuracy...
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                    {Math.round(jobProgress)}%
                  </p>
                </div>
              </div>
            )}

            {/* TOKEN/MODEL INFO (for LLM tasks) */}
            <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
              <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                <span className="flex items-center gap-1 overflow-hidden min-w-0">
                  <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                  <span className="font-mono text-foreground text-[9px] flex-shrink-0">216</span>
                  <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                  <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                    {enhancementState === 'processing' ? Math.round(outputTokens - 216) : 
                     (enhancementState === 'completed' || enhancementState === 'wait') ? '72' : '72'}
                  </span>
                </span>
                <span className="text-[9px] text-muted-foreground truncate max-w-full" title="anthropic/claude-sonnet-4-20250514">
                  anthropic/claude-sonnet-4-20250514
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                {enhancementState === 'completed' || enhancementState === 'wait' ? '2.3s' : '—'}
              </span>
            </div>

            {/* BOTTOM SECTION: Results + Cost */}
            <div className="flex-1 flex flex-col justify-end">
              <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {enhancementState === 'completed' || enhancementState === 'wait' ? (
                      <div className="space-y-2">
                        <span className="font-medium text-foreground">
                          Text improved
                        </span>
                        <div className="bg-muted/50 p-2 rounded text-[9px] max-h-16 overflow-y-auto">
                          <div className="text-foreground line-clamp-3 whitespace-pre-wrap">
                            I need to understand how user authentication works in React app. The login functionality and JWT tokens implementation, ensuring routes are protected and users can't access unauthorized content. Sessions must work properly with security best practices.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="font-medium text-foreground">
                        Improving text clarity and accuracy...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[9px] text-foreground">
                      {enhancementState === 'completed' || enhancementState === 'wait' ? '$0.001728' : '$0.00'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
export default TextImprovementMock;

