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
import { DesktopJobCard } from '../desktop-ui/DesktopJobCard';
import { Search, CheckCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';

interface DeepResearchMockProps {
  isInView: boolean;
  progress: number;
}

type ResearchState = 'idle' | 'button-ready' | 'processing' | 'completed';


export function DeepResearchMock({ isInView, progress }: DeepResearchMockProps) {
  const { setDeepResearchState } = useInteractiveDemoContext();
  const [researchState, setResearchState] = useState<ResearchState>('idle');
  const [buttonPressed, setButtonPressed] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [webSearchProgress, setWebSearchProgress] = useState(0);
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [taskText, setTaskText] = useState("I need to understand how user authentication works in this React application. Specifically, I want to analyze the login functionality and JWT token implementation, ensuring that routes are properly protected so users cannot access unauthorized content. Additionally, I want to verify that session management is working correctly and that security best practices are being followed throughout the application.");
  
  const originalTaskText = "I need to understand how user authentication works in this React application. Specifically, I want to analyze the login functionality and JWT token implementation, ensuring that routes are properly protected so users cannot access unauthorized content. Additionally, I want to verify that session management is working correctly and that security best practices are being followed throughout the application.";
  
  const researchFindings = `

<research_finding_1>
## Critical Authentication Security Issues Found

### Outdated Dependencies & Security Vulnerabilities
- **JWT Library**: Currently using jsonwebtoken@8.5.1 - contains known vulnerability CVE-2022-23529
- **Missing Verification**: No signature verification in /api/auth/refresh.js:23
- **Weak Hashing**: bcrypt rounds set to 10 instead of recommended 12+ in models/User.js:45
- **Plain Text Storage**: Password reset tokens stored unencrypted in users.reset_token column

### Deprecated React Patterns
- **Legacy Lifecycle**: Using deprecated componentWillMount for auth checks in components/AuthGuard.jsx:18
- **Insecure Storage**: JWT tokens stored in localStorage instead of secure httpOnly cookies
- **Missing Protection**: No CSRF protection on authentication endpoints
- **No Rate Limiting**: Password reset endpoint /api/auth/reset-password lacks rate limiting

### Modern Security Recommendations
- **Upgrade JWT**: Update to jsonwebtoken@9.0.0+ with proper RS256 signature verification
- **Secure Storage**: Move to httpOnly cookies with SameSite=Strict and Secure flags
- **React Modernization**: Replace class components with useAuth/useProtectedRoute hooks
- **Security Headers**: Add helmet.js middleware for comprehensive security headers
- **Account Protection**: Implement 5-attempt account lockout and TOTP 2FA for admin users
</research_finding_1>`;

  // Progress-driven state calculation 
  const currentState: ResearchState = (() => {
    if (!isInView) return 'idle';
    if (progress < 0.3) return 'idle';
    if (progress < 0.4) return 'button-ready';
    if (progress < 0.8) return 'processing';
    return 'completed';
  })();

  // Map to context state
  const contextState = currentState === 'button-ready' ? 'ready' : currentState;

  // Publish state to context
  useEffect(() => {
    setDeepResearchState(contextState);
  }, [contextState, setDeepResearchState]);

  // Auto-animation system
  useEffect(() => {
    if (!isInView) {
      setResearchState('idle');
      setButtonPressed(false);
      setAnalysisProgress(0);
      setWebSearchProgress(0);
      setShowWebSearch(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    let analysisInterval: NodeJS.Timeout | null = null;
    let webSearchInterval: NodeJS.Timeout | null = null;

    const runAnimation = () => {
      // Clear any existing timers
      timers.forEach(timer => clearTimeout(timer));
      timers.length = 0;
      if (analysisInterval) {
        clearInterval(analysisInterval);
        analysisInterval = null;
      }
      if (webSearchInterval) {
        clearInterval(webSearchInterval);
        webSearchInterval = null;
      }

      // Reset state
      setResearchState('idle');
      setButtonPressed(false);
      setAnalysisProgress(0);
      setWebSearchProgress(0);
      setShowWebSearch(false);
      setTaskText(originalTaskText);

      // Step 1: Show button ready state (1s delay)
      timers.push(setTimeout(() => {
        setResearchState('button-ready');
      }, 1000));

      // Step 2: Simulate button press and start analysis (4s)
      timers.push(setTimeout(() => {
        setButtonPressed(true);
        setResearchState('processing');
        setAnalysisProgress(0);
        
        // Simulate analysis progress (3 seconds from 4s to 7s)
        let currentAnalysisProgress = 0;
        const analysisIncrement = 95 / 15; // ~6.3% per interval
        
        analysisInterval = setInterval(() => {
          currentAnalysisProgress += analysisIncrement;
          if (currentAnalysisProgress >= 95) {
            setAnalysisProgress(95);
            if (analysisInterval) {
              clearInterval(analysisInterval);
              analysisInterval = null;
            }
          } else {
            setAnalysisProgress(Math.round(currentAnalysisProgress));
          }
        }, 200); // Update every 200ms
        
        timers.push(setTimeout(() => setButtonPressed(false), 300));
      }, 4000));

      // Step 3: Complete analysis and start web search (7s)
      timers.push(setTimeout(() => {
        if (analysisInterval) {
          clearInterval(analysisInterval);
          analysisInterval = null;
        }
        setAnalysisProgress(100);
        setShowWebSearch(true);
        setWebSearchProgress(0);
        
        // Simulate web search progress (4 seconds from 7s to 11s)
        let currentWebSearchProgress = 0;
        const webSearchIncrement = 95 / 20; // ~4.75% per interval
        
        webSearchInterval = setInterval(() => {
          currentWebSearchProgress += webSearchIncrement;
          if (currentWebSearchProgress >= 95) {
            setWebSearchProgress(95);
            if (webSearchInterval) {
              clearInterval(webSearchInterval);
              webSearchInterval = null;
            }
          } else {
            setWebSearchProgress(Math.round(currentWebSearchProgress));
          }
        }, 200); // Update every 200ms
      }, 7000));

      // Step 4: Complete everything and paste research findings (11s)
      timers.push(setTimeout(() => {
        if (webSearchInterval) {
          clearInterval(webSearchInterval);
          webSearchInterval = null;
        }
        setResearchState('completed');
        setWebSearchProgress(100);
        
        // Paste research findings into task description
        setTaskText(originalTaskText + researchFindings);
      }, 11000));

      // Reset and restart (15s)
      timers.push(setTimeout(() => {
        runAnimation(); // Loop
      }, 15000));
    };

    runAnimation();

    return () => {
      timers.forEach(timer => clearTimeout(timer));
      if (analysisInterval) clearInterval(analysisInterval);
      if (webSearchInterval) clearInterval(webSearchInterval);
    };
  }, [isInView]);


  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Task Description
          </label>
          
          <div className="relative">
            <DesktopTextarea
              className={cn(
                "border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft border-border/60 transition-all duration-500",
                researchState === 'completed' ? "min-h-[400px]" : "min-h-[120px]"
              )}
              value={taskText}
              placeholder="Clearly describe the changes or features you want the AI to implement..."
              readOnly
            />

            {/* Bottom button */}
            <div className="flex flex-col gap-3 mt-4">
              <DesktopButton 
                variant="outline" 
                size="sm"
                className={cn(
                  "flex items-center justify-center gap-2 w-full text-foreground transition-all duration-200",
                  researchState === 'processing' && "opacity-50 cursor-not-allowed",
                  buttonPressed && 'scale-95 bg-primary/80'
                )}
                disabled={researchState === 'idle' || researchState === 'processing'}
              >
                <Search className="h-4 w-4" />
                Deep Research
                <span className="text-xs ml-1 opacity-70">(can be expensive)</span>
              </DesktopButton>
            </div>
          </div>
        </div>
      </div>

      {/* Job Cards - Matching TextImprovementMock style with workflow grouping */}
      <div className="mt-8">
        {/* Workflow Group with Dashed Border - like desktop Background Tasks */}
        {(researchState === 'processing' || researchState === 'completed') && (
          <div className="relative border border-dashed border-muted-foreground/40 rounded-lg p-[3px] w-fit">
            
            {/* Web Search Prompts Generation Job Card */}
            <div className="animate-in slide-in-from-bottom-4 duration-500">
              <DesktopJobCard>
                
                {/* Header Row - Icon, Status, Title, Close */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex-shrink-0",
                      (researchState === 'completed' || analysisProgress === 100) ? "text-green-600" : "text-gray-600"
                    )}>
                      {(researchState === 'completed' || analysisProgress === 100) ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    <span className={cn(
                      "font-medium text-xs",
                      (researchState === 'completed' || analysisProgress === 100) ? "text-foreground" : "text-foreground"
                    )}>
                      {(researchState === 'completed' || analysisProgress === 100) ? 'Completed' : 'Processing'}
                    </span>
                    <span className="font-medium text-foreground text-xs">
                      Codebase Analysis
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    {(researchState === 'completed' || analysisProgress === 100) ? (
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
                    {(researchState === 'completed' || analysisProgress === 100) ? '8 minutes ago' : 'just now'}
                  </span>
                </div>

                {/* Progress Section - only show when processing */}
                {researchState === 'processing' && analysisProgress < 100 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground text-xs">Finding available processor...</span>
                      <span className="text-muted-foreground text-xs font-medium">{analysisProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                      <div 
                        className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Model Info */}
                {researchState === 'processing' && analysisProgress < 100 ? (
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-muted-foreground text-xs">
                      anthropic/claude-sonnet-4-20250514
                    </span>
                    <span className="text-muted-foreground text-xs">3s</span>
                  </div>
                ) : (
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        Tokens: <span className="text-foreground font-medium">1.2k → 847</span>
                      </span>
                      <span className="text-muted-foreground text-xs">3s</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      anthropic/claude-sonnet-4-20250514
                    </div>
                  </div>
                )}

                {/* Results Section - only show when completed */}
                {(researchState === 'completed' || analysisProgress === 100) && (
                  <>
                    <div className="mb-3">
                      <span className="text-foreground font-medium text-xs">
                        Analysis completed
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <span className="text-muted-foreground text-xs">
                        $0.003216
                      </span>
                    </div>
                  </>
                )}
                </DesktopJobCard>
            </div>

            {/* Web Search Execution Job Card */}
            {showWebSearch && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 mt-3">
                <DesktopJobCard>
                  
                  {/* Header Row - Icon, Status, Title, Close */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex-shrink-0",
                        (researchState === 'completed' || webSearchProgress === 100) ? "text-green-600" : "text-gray-600"
                      )}>
                        {(researchState === 'completed' || webSearchProgress === 100) ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <span className={cn(
                        "font-medium text-xs",
                        (researchState === 'completed' || webSearchProgress === 100) ? "text-foreground" : "text-foreground"
                      )}>
                        {(researchState === 'completed' || webSearchProgress === 100) ? 'Completed' : 'Processing'}
                      </span>
                      <span className="font-medium text-foreground text-xs">
                        Web Research
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      {(researchState === 'completed' || webSearchProgress === 100) ? (
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
                      {(researchState === 'completed' || webSearchProgress === 100) ? '5 minutes ago' : 'just now'}
                    </span>
                  </div>

                  {/* Progress Section - only show when processing */}
                  {webSearchProgress < 100 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Searching authentication best practices...</span>
                        <span className="text-muted-foreground text-xs font-medium">{webSearchProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${webSearchProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Model Info */}
                  {webSearchProgress < 100 ? (
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-muted-foreground text-xs">
                        web-search/perplexity
                      </span>
                      <span className="text-muted-foreground text-xs">4s</span>
                    </div>
                  ) : (
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs">
                          Tokens: <span className="text-foreground font-medium">2.1k → 1.3k</span>
                        </span>
                        <span className="text-muted-foreground text-xs">4s</span>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        web-search/perplexity
                      </div>
                    </div>
                  )}

                  {/* Results Section - only show when completed */}
                  {(researchState === 'completed' || webSearchProgress === 100) && (
                    <>
                      <div className="mb-3">
                        <span className="text-foreground font-medium text-xs">
                          Research findings generated
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <span className="text-muted-foreground text-xs">
                          $0.005216
                        </span>
                      </div>
                    </>
                  )}
                </DesktopJobCard>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}