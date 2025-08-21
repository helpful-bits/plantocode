/* Desktop Parity Mapping:
 * Sources: ImplementationPlanCard.tsx  
 * Classes: card root rounded-xl border border-border/60 bg-card shadow-soft; left status strip colors; footer border-top font-mono text-xs
 */
// Step 8: Implementation plan cards with streaming content exactly matching desktop styling
'use client';

import React, { useState } from 'react';
import { DesktopCard, DesktopCardContent, DesktopCardHeader, DesktopCardTitle, DesktopCardDescription } from '../desktop-ui/DesktopCard';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { DesktopCheckbox } from '../desktop-ui/DesktopCheckbox';
import { Eye, Trash2, Info, Copy, FileCode, ClipboardCopy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModelSelectorToggleMock } from './ModelSelectorToggleMock';
import { useTimedLoop, useIntervalGate } from '../hooks';
import dynamic from 'next/dynamic';

const PlanContentStreamingLazy = dynamic(() => import('./PlanContentStreamingMock').then(m => ({ default: m.PlanContentStreamingMock })), { ssr: false, loading: () => <div className="h-24" /> });



// Dynamic plan interface for simulation
interface SimulatedPlan {
  id: string;
  title: string;
  model: string;
  tokensSent: number;
  tokensReceived: number;
  status: 'streaming' | 'completed';
  timeAgo: string;
  planTitle: string;
  progress?: number;
  isMerged?: boolean;
  mergedFromCount?: number;
  creationProgress: number; // 0-1 for when this plan was created
  completionProgress: number; // 0-1 for when this plan completes
  isVisible: boolean; // Controls visibility without removing from DOM
}

function PlanCard({ 
  plan, 
  isActive: _isActive, 
  progress: _progress,
  onToggleContent,
  isExpanded: _isExpanded,
}: { 
  plan: SimulatedPlan; 
  isActive: boolean;
  progress: number;
  onToggleContent: (id: string) => void;
  isExpanded: boolean;
}) {
  // No state - pure component
  
  // Helper function to truncate long titles (exactly like desktop)
  const truncateTitle = (title: string, maxLength: number = 80) => {
    if (title.length <= maxLength) return title;
    return `${title.substring(0, maxLength - 3)}...`;
  };
  
  // Check if actively streaming (running status but no content yet) - exact desktop logic
  const hasResponseContent = false; // For demo, assume no content yet for streaming
  const isStreaming = plan.status === 'streaming' && !hasResponseContent;
  
  // Use live progress - in demo, use plan's progress or progress from scroll
  const displayProgress = isStreaming && plan.progress !== undefined ? plan.progress : undefined;
  
  // Display token count directly from plan object (server-provided data) - exact desktop logic
  let tokenCountDisplay = "N/A";
  const tokensSent = Number(plan.tokensSent || 0);
  const tokensReceived = Number(plan.tokensReceived || 0);
  const totalTokens = tokensSent + tokensReceived;
  
  if (totalTokens > 0) {
    tokenCountDisplay = totalTokens.toLocaleString();
  } else if (isStreaming) {
    tokenCountDisplay = "Thinking...";
  }
  
  // Determine if the job has content to display - exact desktop logic
  const hasContent = plan.status === 'completed' || isStreaming || hasResponseContent;

  return (
    <DesktopCard className="relative mb-2 sm:mb-4 mx-1 sm:mx-0 overflow-hidden min-h-[160px]">
      {/* Status indicator strip on the left side - green for completed/merged plans */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          plan.status === 'completed' || plan.isMerged ? "bg-green-500" : 
          plan.status === 'streaming' ? "bg-primary" : "bg-warning"
        )}
      />

      <DesktopCardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-2 flex-1">
            {/* Checkbox for completed plans only - no state, just visual */}
            {plan.status === 'completed' && (
              <div className="flex items-center mt-1">
                <DesktopCheckbox
                  checked={false}
                  onChange={() => {}}
                />
              </div>
            )}
            <div className="flex-1">
              <DesktopCardTitle className="text-base">
                {truncateTitle(plan.planTitle || plan.title)}
              </DesktopCardTitle>
              <DesktopCardDescription className="flex flex-wrap gap-x-2 text-xs mt-1">
                {plan.isMerged && (
                  <>
                    <span className="text-green-600 font-medium">Merged</span>
                    <span>•</span>
                  </>
                )}
                <span>{plan.model}</span>
                <span>•</span>
                <span>{tokenCountDisplay} tokens</span>
              </DesktopCardDescription>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1 sm:mt-0">{plan.timeAgo}</div>
        </div>
      </DesktopCardHeader>

      <DesktopCardContent className="pb-4 pt-0">
        {/* Progress indicator for streaming jobs - exact desktop logic */}
        {isStreaming && (
          <div className="mb-3">
            {displayProgress !== undefined ? (
              <>
                <DesktopProgress value={displayProgress} className="h-1.5" />
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Generating implementation plan...</span>
                  <span>{Math.round(displayProgress)}%</span>
                </div>
              </>
            ) : (
              <>
                <DesktopProgress value={0} className="h-1.5" />
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Generating implementation plan...</span>
                  <span>Processing...</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions bar - matching screenshot exactly */}
        <div className="flex flex-wrap gap-1 mt-2">
          {/* First row of buttons */}
          <div className="flex gap-1 flex-wrap">
            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              disabled={!hasContent}
              onClick={() => onToggleContent(plan.id)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              {isStreaming ? "View Stream" : "View Content"}
            </DesktopButton>

            {/* Copy buttons - only show for completed plans */}
            {!isStreaming && hasContent && (
              <>
                <DesktopButton
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2 py-1"
                  title="Copy"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </DesktopButton>
                
                <DesktopButton
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2 py-1"
                  title="Copy: Implementation"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Implementation
                </DesktopButton>
                
                <DesktopButton
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2 py-1"
                  title="Parallel Claude Coding Agents"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Parallel Claude Coding Agents
                </DesktopButton>
                
                <DesktopButton
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2 py-1"
                  title="Investigate Results"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Investigate Results
                </DesktopButton>
              </>
            )}

            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
            >
              <Info className="mr-1 h-3.5 w-3.5" />
              Details
            </DesktopButton>

            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={false}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </DesktopButton>
          </div>
        </div>
      </DesktopCardContent>
    </DesktopCard>
  );
}

export function PlanCardsStreamMock({ isInView }: { isInView: boolean }) {
  const [viewingPlan, setViewingPlan] = useState<string | null>(null);
  
  // Use timed loop with 20s cycle and 300ms idle delay
  const { t: timeProgress } = useTimedLoop(isInView, 20000, { idleDelayMs: 300, resetOnDeactivate: true });
  
  // Use interval gates for button pulses and plan windows
  const buttonClicked = useIntervalGate(timeProgress, [
    { startPct: 0.14, endPct: 0.17 },
    { startPct: 0.34, endPct: 0.37 },
    { startPct: 0.64, endPct: 0.67 },
    { startPct: 0.84, endPct: 0.87 }
  ]);

  const estimatedTokens = (isInView && timeProgress > 0.05) ? 83247 : 0;
  
  const handleToggleContent = (id: string) => {
    setViewingPlan(id);
  };

  // Get realistic time ago for plans (newer plans at top should have more recent timestamps)
  const getTimeAgo = (id: string) => {
    const timeMap: Record<string, string> = {
      'plan-gemini-2': 'just now', // Most recent
      'plan-gemini-1': '2 minutes ago',
      'plan-gpt5-2': '5 minutes ago', 
      'plan-gpt5-1': '8 minutes ago' // Oldest
    };
    return timeMap[id] || 'just now';
  };

  // Create plan data - ALWAYS return plan object to prevent flickering
  const createPlan = (id: string, title: string, model: string, tokensSent: number, 
                     tokensReceived: number, creationProgress: number, completionProgress: number) => {
    // Round progress more aggressively to prevent micro-fluctuations that cause flickering
    const isVisible = timeProgress >= creationProgress;
    const isCompleted = timeProgress >= completionProgress;
    
    // Safe progress calculation with bounds checking using time progress
    const progressRange = Math.max(0.01, completionProgress - creationProgress); // Prevent division by zero
    const currentProgress = Math.max(0, timeProgress - creationProgress);
    
    // Only calculate stream progress if we're in the streaming phase
    let streamProgress: number | undefined = undefined;
    if (!isCompleted && isVisible && progressRange > 0) {
      const rawProgress = (currentProgress / progressRange) * 100;
      streamProgress = Math.max(0, Math.min(100, Math.round(rawProgress))); // Round to whole numbers
    }
    
    // Safe token calculation - only update when visible and not completed
    let currentTokensReceived = 0;
    if (isCompleted) {
      currentTokensReceived = tokensReceived;
    } else if (isVisible && progressRange > 0) {
      const tokenProgress = Math.max(0, Math.min(1, currentProgress / progressRange));
      currentTokensReceived = Math.floor(tokensReceived * tokenProgress);
    }
    
    const status: 'completed' | 'streaming' = isCompleted ? 'completed' : 'streaming';
    
    return {
      id,
      title,
      planTitle: title,
      model,
      tokensSent,
      tokensReceived: Math.max(0, currentTokensReceived),
      status,
      timeAgo: isCompleted ? getTimeAgo(id) : 'just now',
      creationProgress,
      completionProgress,
      ...(streamProgress !== undefined && { progress: streamProgress }),
      isVisible // Add visibility flag instead of filtering
    };
  };

  // Generate all plans - NEWER PLANS AT TOP (reverse chronological order like real apps)
  const allPlans = [
    createPlan('plan-gemini-2', 'API Integration Layer', 'Gemini 2.5 Pro', 4800, 4300, 0.85, 1.0),
    createPlan('plan-gemini-1', 'Database Schema Design', 'Gemini 2.5 Pro', 6100, 5200, 0.65, 0.80),
    createPlan('plan-gpt5-2', 'User Interface Components', 'GPT-5', 5200, 4100, 0.35, 0.55),
    createPlan('plan-gpt5-1', 'Authentication System Architecture', 'GPT-5', 4247, 3800, 0.15, 0.35)
  ];

  const buttonState = buttonClicked ? 'clicking' : 'idle';
  const canCreatePlan = timeProgress > 0.1;

  return (
    <div className="space-y-2 sm:space-y-4 px-1 py-2 sm:p-4">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Implementation Plans</h2>
        <div className="flex items-center gap-2">
          {isInView && timeProgress > 0.05 && (
            <ModelSelectorToggleMock isInView={isInView} />
          )}
        </div>
      </header>

      {/* Create Implementation Plan Section */}
      {isInView && timeProgress > 0.02 && (
        <DesktopCard className="bg-card p-2 sm:p-6 rounded-lg border border-border shadow-sm mb-2 sm:mb-6">
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground">Create New Plan</h3>
            
            {/* Token count display */}
            {estimatedTokens && (
              <div className="mb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Estimated tokens*: <span className="text-foreground font-medium">
                      {estimatedTokens !== null ? estimatedTokens.toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    * This is an estimate. The final token count will be provided by your AI provider after processing and may differ between providers for the same content.
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex gap-2">
                <DesktopButton
                  variant="outline"
                  size="sm"
                  disabled={!canCreatePlan}
                  className="flex items-center justify-center w-full h-9"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Prompt
                </DesktopButton>
                <DesktopButton
                  variant="outline"
                  size="sm"
                  disabled={false}
                  className="flex items-center justify-center w-full h-9"
                >
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy
                </DesktopButton>
              </div>

              <DesktopButton
                variant="default"
                size="sm"
                disabled={!canCreatePlan}
                className={cn(
                  "flex items-center justify-center w-full h-9 transition-all duration-300",
                  buttonState === 'clicking' && "bg-primary/60 scale-[0.96] shadow-inner ring-2 ring-primary/30 border-primary/50"
                )}
              >
                <FileCode className="h-4 w-4 mr-2" />
                Create Implementation Plan
              </DesktopButton>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3 text-balance">
            Creates an implementation plan based on your task description and
            selected files. Token count is estimated automatically. Use "View Prompt" to see the exact prompt that would be sent to the AI.
          </p>
        </DesktopCard>
      )}
      
      <div className="space-y-3">
        {allPlans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "transition-all duration-500 ease-in-out min-h-[180px]",
              plan.isVisible 
                ? "opacity-100 transform translate-y-0 scale-100" 
                : "opacity-0 transform translate-y-2 scale-95 pointer-events-none"
            )}
          >
            <PlanCard 
              plan={plan} 
              isActive={isInView}
              progress={timeProgress}
              onToggleContent={handleToggleContent}
              isExpanded={false}
            />
          </div>
        ))}
      </div>
      
      {viewingPlan && (
        <PlanContentStreamingLazy isInView={isInView} />
      )}
    </div>
  );
}
export default PlanCardsStreamMock;

