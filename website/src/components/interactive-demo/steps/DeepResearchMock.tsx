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
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { CheckCircle, Brain, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';
import { useTimedCycle, useTweenNumber } from '../hooks';
import { useDebounced } from '../hooks/useDebounced';

interface DeepResearchMockProps {
  isInView: boolean;
  resetKey?: number;
}

// Define phases outside component to prevent recreation on each render
const DEEP_RESEARCH_PHASES = [
  { name: 'idle', durationMs: 500 },           // Brief initial state
  { name: 'button-ready', durationMs: 1500 }, // Time to see button ready
  { name: 'prompts-generating', durationMs: 3500 }, // Realistic AI prompt generation time
  { name: 'prompts-complete', durationMs: 800 },    // Brief pause to show completion
  { name: 'search-executing', durationMs: 5200 },   // Realistic web search execution time
  { name: 'research-complete', durationMs: 2500 },  // Time to see final results
  { name: 'wait', durationMs: 1000 }               // Brief pause before loop
];

export function DeepResearchMock({ isInView }: DeepResearchMockProps) {
  const { setDeepResearchState, setTaskDescription, taskDescription } = useInteractiveDemoContext();
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [taskText] = useState("I need to understand how user authentication works in this React application. Specifically, I want to analyze the login functionality and JWT token implementation, ensuring that routes are properly protected so users cannot access unauthorized content. Additionally, I want to verify that session management is working correctly and that security best practices are being followed throughout the application.");

  const { phaseName: currentState } = useTimedCycle({ 
    active: isInView, 
    phases: DEEP_RESEARCH_PHASES, 
    loop: true, // Keep looping for demo continuity
    resetOnDeactivate: true
  });

  // Context state for communication with other components
  const contextState = currentState === 'completed' ? 'completed' : 
                      currentState === 'processing' ? 'processing' : 'idle';
  
  const debouncedSetDeepResearchState = useDebounced(setDeepResearchState, 50);

  useEffect(() => {
    debouncedSetDeepResearchState(contextState);
  }, [contextState, debouncedSetDeepResearchState]);

  // Inject research findings into task description when research completes
  useEffect(() => {
    if (currentState === 'research-complete' && isInView) {
      // Only inject if not already injected (avoid loops)
      if (!taskDescription.includes('<task_context>')) {
        // Create realistic research findings based on the sample from desktop app
        const researchFindings = `<task_context>
  <original_task>
${taskDescription}
  </original_task>
  
  <web_search_findings count="2">
<research_finding index="1">
  <title>JWT Token Implementation Best Practices</title>
  <content>
JSON Web Tokens (JWT) should be implemented with proper security measures including:
- Using HTTPS for all authentication endpoints
- Setting appropriate token expiration times (15-30 minutes for access tokens)
- Implementing refresh token rotation
- Storing tokens securely (httpOnly cookies for web apps)
- Validating tokens on every request using middleware
- Using strong signing algorithms (RS256 recommended over HS256)
  </content>
</research_finding>

<research_finding index="2">
  <title>React Route Protection Patterns</title>
  <content>
Modern React applications implement route protection through:
- Higher-order components (HOCs) or custom hooks for authentication checks
- Protected route components that redirect unauthenticated users
- Context providers for managing authentication state globally
- Middleware patterns that verify user permissions before rendering components
- Integration with React Router for seamless navigation control
- Session validation on app initialization and route changes
  </content>
</research_finding>
  </web_search_findings>
</task_context>`;
        
        setTaskDescription(researchFindings);
      }
    }
  }, [currentState, isInView, taskDescription, setTaskDescription]);

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      if ((debouncedSetDeepResearchState as any).cleanup) {
        (debouncedSetDeepResearchState as any).cleanup();
      }
    };
  }, [debouncedSetDeepResearchState]);

  // Job 1: Prompt generation progress (realistic AI processing curve)
  const { value: promptGenerationProgress } = useTweenNumber({
    active: currentState === 'prompts-generating',
    from: 0,
    to: 100,
    durationMs: 3500, // Realistic time for AI to analyze and generate prompts
    loop: false
  });

  // Job 2: Web search execution progress (realistic search + processing time)
  const { value: webSearchProgress } = useTweenNumber({
    active: currentState === 'search-executing',
    from: 0,
    to: 100,
    durationMs: 5200, // Realistic time for multiple web searches + processing
    loop: false
  });
  
  // Job 1: Token streaming for prompt generation (input known, output streams)
  const { value: promptTokensOut } = useTweenNumber({
    from: 850, // Input tokens (known immediately)
    to: 1180, // Output tokens stream in (850 input + 330 output)
    active: currentState === 'prompts-generating',
    durationMs: 3200, // Stream slightly faster than progress for realism
    loop: false
  });
  
  // Job 2: Token streaming for web search execution (larger output due to research results)
  const { value: searchTokensOut } = useTweenNumber({
    from: 1200, // Input tokens (search prompts + context)
    to: 2850, // Output tokens stream in (1200 input + 1650 output)
    active: currentState === 'search-executing',
    durationMs: 4800, // Stream slightly faster than progress
    loop: false
  });

  // Update component state based on timing phases
  useEffect(() => {
    if (!isInView) {
      setShowWebSearch(false);
      return;
    }

    // Show web search card only after prompt generation completes
    const shouldShowWebSearch = [
      'search-executing', 
      'research-complete'
    ].includes(currentState);
    
    setShowWebSearch(shouldShowWebSearch);
  }, [isInView, currentState]);

  // Updated state mappings for new realistic workflow
  const showFirstJob = [
    'prompts-generating', 'prompts-complete', 'search-executing', 'research-complete'
  ].includes(currentState);
  
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
            className="border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft  border-[oklch(0.90_0.04_195_/_0.5)]"
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
                "w-full font-medium",
                showButton ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
              )}
              disabled={showFirstJob && currentState !== 'research-complete'}
            >
              {currentState === 'research-complete' ? 'Research Complete' : 
               showFirstJob ? 'Researching...' : 'Deep Research'}
            </DesktopButton>
          </div>
        </div>
      </div>

      {/* Background Jobs Cards - EXACT match to desktop structure */}
      <div className="space-y-3 mt-6  transition-all duration-300 ease-in-out">
        <div className="relative">
          <div className={cn(
            "transition-all duration-500 ease-in-out",
            showFirstJob ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
          )}>
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
                    {['prompts-complete', 'search-executing', 'research-complete'].includes(currentState) ? (
                      <CheckCircle className="h-3 w-3 text-success" />
                    ) : currentState === 'prompts-generating' ? (
                      <Loader2 className="h-3 w-3 text-primary animate-spin" />
                    ) : (
                      <Brain className="h-3 w-3 text-info" />
                    )}
                  </span>
                  <span className="truncate text-foreground">Web Search Prompts</span>
                  <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                    Web Search Prompts
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
                <span>just now</span>
              </div>

              {/* PROGRESS BAR (only for running jobs) */}
              {currentState === 'prompts-generating' && (
                <div className="mt-2 mb-1">
                  <DesktopProgress value={promptGenerationProgress} className="h-1" />
                  <div className="flex justify-between items-center min-w-0 overflow-hidden">
                    <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                      Analyzing task and generating search prompts...
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                      {Math.round(promptGenerationProgress)}%
                    </p>
                  </div>
                </div>
              )}

              {/* TOKEN/MODEL INFO */}
              <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between  w-full min-w-0">
                <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                  <span className="flex items-center gap-1 overflow-hidden min-w-0">
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                    <span className="font-mono text-foreground text-[9px] flex-shrink-0">2.1K</span>
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                    <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                      {currentState === 'prompts-generating' ? 
                        (Math.round(promptTokensOut - 850) / 1000).toFixed(1) + 'K' : '0.33K'}
                    </span>
                  </span>
                  <span className="text-[9px] text-muted-foreground truncate max-w-full" title="anthropic/claude-sonnet-4-5-20250929">
                    anthropic/claude-sonnet-4-5-20250929
                  </span>
                </div>
                <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                  {['prompts-complete', 'search-executing', 'research-complete'].includes(currentState) ? '3.4s' : '-'}
                </span>
              </div>

              {/* BOTTOM SECTION: Results + Cost */}
              <div className="flex-1 flex flex-col justify-end">
                <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                      <span className="font-medium text-foreground">
                        {['prompts-complete', 'search-executing', 'research-complete'].includes(currentState) ? 
                          '3 search prompts generated' : 'Generating search prompts...'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-[9px] text-foreground">
                        {/* Only show cost after job completes */}
                        {['prompts-complete', 'search-executing', 'research-complete'].includes(currentState) && (
                          '$0.009384'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="relative">
          <div className={cn(
            "transition-all duration-500 ease-in-out",
            showWebSearch ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
          )}>
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
                    {currentState === 'research-complete' ? (
                      <CheckCircle className="h-3 w-3 text-success" />
                    ) : (
                      <Loader2 className="h-3 w-3 text-primary animate-spin" />
                    )}
                  </span>
                  <span className="truncate text-foreground">Web Search Execution</span>
                  <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                    Web Search Execution
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
                <span>just now</span>
              </div>

              {/* PROGRESS BAR (only for running jobs) */}
              {currentState === 'search-executing' && (
                <div className="mt-2 mb-1">
                  <DesktopProgress value={webSearchProgress} className="h-1" />
                <div className="flex justify-between items-center min-w-0 overflow-hidden">
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                    {webSearchProgress < 40 ? 'Executing web searches...' :
                     webSearchProgress < 85 ? 'Processing search results...' :
                     'Generating research findings...'}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                    {Math.round(webSearchProgress)}%
                  </p>
                </div>
              </div>
              )}

              {/* TOKEN/MODEL INFO */}
              <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between  w-full min-w-0">
                <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                  <span className="flex items-center gap-1 overflow-hidden min-w-0">
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                    <span className="font-mono text-foreground text-[9px] flex-shrink-0">1.2K</span>
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                    <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                      {currentState === 'search-executing' ? 
                        (searchTokensOut / 1000).toFixed(1) + 'K' : '2.9K'}
                    </span>
                  </span>
                  <span className="text-[9px] text-muted-foreground truncate max-w-full" title="openai/o4-mini">
                    openai/o4-mini
                  </span>
                </div>
                <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                  {currentState === 'research-complete' ? '5.2s' : '-'}
                </span>
              </div>

              {/* BOTTOM SECTION: Results + Cost */}
              <div className="flex-1 flex flex-col justify-end">
                <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                      <span className="font-medium text-foreground">
                        {currentState === 'research-complete' ? 
                          '2 research findings ready' : 'Executing web searches...'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-[9px] text-foreground">
                        {/* Only show cost after job completes */}
                        {currentState === 'research-complete' && (
                          '$0.012456'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Completion summary - matches TaskDescriptionMock styling */}
      <div className={cn(
        "mt-6 p-4 border border-[oklch(0.90_0.04_195_/_0.3)] rounded-lg bg-card  transition-all duration-300 ease-in-out",
        currentState === 'research-complete' ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <h3 className="font-semibold text-sm">Research Complete</h3>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• Found 4 critical authentication vulnerabilities</div>
          <div>• Generated 2 detailed research findings</div>
          <div>• Identified 12 security improvements</div>
        </div>
      </div>
    </div>
  );
}
export default DeepResearchMock;