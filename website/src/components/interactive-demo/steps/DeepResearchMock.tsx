/* Desktop Parity Mapping:
 * Sources: desktop/src/app/components/generate-prompt/_sections/task-section.tsx (Deep Research button)
 * Classes: Similar to TaskDescriptionMock - textarea + button at bottom
 * Structure: Task description textarea with Deep Research button at bottom
 */
// Step 7: Deep Research Mock - Shows task description with Deep Research button
'use client';

import { useState, useEffect } from 'react';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { CheckCircle, Brain, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';
import { useTimedCycle, useTweenNumber } from '../hooks';

interface DeepResearchMockProps {
  isInView: boolean;
  resetKey?: number;
}

// Define phases outside component to prevent recreation on each render
const DEEP_RESEARCH_PHASES = [
  { name: 'idle', durationMs: 600 },           // Brief initial state
  { name: 'button-ready', durationMs: 2000 }, // Time to see button ready (reduced from 3000ms)
  { name: 'processing', durationMs: 4500 },   // Research processing (reduced from 7000ms)
  { name: 'completed', durationMs: 3000 },    // Time to see results (reduced from 4000ms)
  { name: 'wait', durationMs: 800 }           // Brief pause (reduced from 1000ms)
];

export function DeepResearchMock({ isInView }: DeepResearchMockProps) {
  const { setDeepResearchState } = useInteractiveDemoContext();
  const [buttonPressed, setButtonPressed] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [taskText] = useState("I need to understand how user authentication works in this React application. Specifically, I want to analyze the login functionality and JWT token implementation, ensuring that routes are properly protected so users cannot access unauthorized content. Additionally, I want to verify that session management is working correctly and that security best practices are being followed throughout the application.");

  const { phaseName: currentState } = useTimedCycle({ 
    active: isInView, 
    phases: DEEP_RESEARCH_PHASES, 
    loop: true,
    resetOnDeactivate: true
  });

  // Context state for communication with other components
  const contextState = currentState === 'completed' ? 'completed' : 
                      currentState === 'processing' ? 'processing' : 'idle';
  
  useEffect(() => {
    setDeepResearchState(contextState);
  }, [contextState, setDeepResearchState]);

  // Progress animation 
  const { value: analysisProgressValue } = useTweenNumber({
    active: currentState === 'processing' || currentState === 'completed', 
    from: 0,
    to: 100,
    durationMs: 4000
  });

  // Update component state based on timing phases
  useEffect(() => {
    if (!isInView) {
      setButtonPressed(false);
      setShowWebSearch(false);
      return;
    }

    setButtonPressed(currentState === 'processing' || currentState === 'completed');
    setShowWebSearch(analysisProgressValue >= 50);
  }, [isInView, currentState, analysisProgressValue]);

  const isProcessing = currentState === 'processing';
  const isCompleted = currentState === 'completed';
  const showButton = currentState !== 'idle';

  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              className="font-semibold text-base sm:text-lg text-foreground"
            >
              Task Description
            </label>
          </div>
        </div>

        <div className="relative">
          <DesktopTextarea
            className="border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft min-h-[400px] border-[oklch(0.90_0.04_195_/_0.5)]"
            value={taskText}
            placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
            readOnly
          />

          {/* Bottom buttons - EXACTLY like TaskDescriptionMock */}
          <div className="flex flex-col gap-3 mt-4">
            <DesktopButton 
              variant="outline" 
              size="sm"
              className={cn(
                "flex items-center justify-center gap-2 w-full text-foreground transition-all duration-200",
                showButton ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none",
                buttonPressed && "scale-95 bg-primary/80 ring-2 ring-primary/40"
              )}
              disabled={isProcessing}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              {isProcessing ? 'Researching...' : isCompleted ? 'Research Complete' : 'Deep Research'}
            </DesktopButton>
          </div>
        </div>
      </div>

      {/* Background Jobs Cards - Using proper SidebarJobsMock styling */}
      <div className="space-y-3 mt-6 min-h-[280px] transition-all duration-300 ease-in-out">
        <div className="relative">
          <DesktopCard className={cn(
            "transition-all duration-300 hover:shadow-md max-w-[300px] min-h-[120px]",
            (isProcessing || isCompleted) ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
          )}>
            <DesktopCardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "transition-colors duration-300",
                    analysisProgressValue >= 100 ? "text-green-600" : "text-blue-600"
                  )}>
                    <Brain className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-xs sm:text-sm truncate">Code Analysis</h4>
                    <p className="text-xs text-muted-foreground truncate">Claude 3.5 Sonnet</p>
                  </div>
                </div>
                <DesktopBadge variant={analysisProgressValue >= 100 ? "success" : "default"} className="text-xs">
                  {analysisProgressValue >= 100 ? 'Completed' : 'Running'}
                </DesktopBadge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Progress</span>
                  <span>{Math.round(analysisProgressValue)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{width: `${Math.round(analysisProgressValue)}%`}}></div>
                </div>
              </div>
              
              <div className="flex justify-between items-center mt-3 pt-2 border-t border-[oklch(0.90_0.04_195_/_0.2)]">
                <span className="text-xs sm:text-sm text-muted-foreground">Tokens</span>
                <span className="text-xs sm:text-sm font-mono">
                  {analysisProgressValue >= 100 ? '~4,247' : '~2,100'}
                </span>
              </div>
            </DesktopCardContent>
          </DesktopCard>
        </div>
        
        <div className="relative">
          <DesktopCard className={cn(
            "transition-all duration-300 hover:shadow-md max-w-[300px] min-h-[120px]",
            showWebSearch ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
          )}>
            <DesktopCardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="transition-colors duration-300 text-blue-600">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-xs sm:text-sm truncate">Web Research</h4>
                    <p className="text-xs text-muted-foreground truncate">GPT-4o</p>
                  </div>
                </div>
                <DesktopBadge variant="default" className="text-xs">
                  Running
                </DesktopBadge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Progress</span>
                  <span>78%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{width: '78%'}}></div>
                </div>
              </div>
              
              <div className="flex justify-between items-center mt-3 pt-2 border-t border-[oklch(0.90_0.04_195_/_0.2)]">
                <span className="text-xs sm:text-sm text-muted-foreground">Tokens</span>
                <span className="text-xs sm:text-sm font-mono">
                  ~1,890
                </span>
              </div>
            </DesktopCardContent>
          </DesktopCard>
        </div>
      </div>

      {/* Completion summary - matches TaskDescriptionMock styling */}
      <div className={cn(
        "mt-6 p-4 border border-[oklch(0.90_0.04_195_/_0.3)] rounded-lg bg-card min-h-[120px] transition-all duration-300 ease-in-out",
        isCompleted ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <h3 className="font-semibold text-sm">Research Complete</h3>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Found 4 critical authentication vulnerabilities</div>
          <div>• Generated implementation roadmap</div>
          <div>• Identified 12 security improvements</div>
        </div>
      </div>
    </div>
  );
}
export default DeepResearchMock;