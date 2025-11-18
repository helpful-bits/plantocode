// Step 10-11: Plan Selection & Merge Instructions - Complete workflow simulation
'use client';

import React, { useState, useEffect } from 'react';
import { useTimedCycle, useTypewriter } from '../hooks';
import { Eye, Plus, Check, ChevronLeft, ChevronRight, Copy, StickyNote, GripVertical, Info, Trash2, Merge, ChevronDown, ChevronUp, Code, Search } from 'lucide-react';
import { DesktopCard, DesktopCardHeader, DesktopCardTitle, DesktopCardDescription, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopCheckbox } from '../desktop-ui/DesktopCheckbox';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { MonacoCodeViewer } from '../desktop-ui/MonacoCodeViewer';
import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopCollapsible, DesktopCollapsibleTrigger, DesktopCollapsibleContent } from '../desktop-ui/DesktopCollapsible';

// Mock plan data that simulates real implementation plans
const mockPlans = [
  {
    id: 'plan-service-oriented',
    title: 'Implementation Plan',
    planTitle: 'Plan B: Service-Oriented Architecture Design',
    model: 'Google Gemini 3 Pro',
    tokens: 7890,
    completionTime: '2m 15s',
    timeAgo: 'just now',
    status: 'completed' as const,
    content: `<implementation_plan>
  <agent_instructions>
    Read the following plan CAREFULLY, COMPREHEND IT, and IMPLEMENT it COMPLETELY. THINK HARD!
    DO NOT add unnecessary comments.
    DO NOT introduce backward compatibility approaches; leverage fully modern, forward-looking features exclusively.
    This plan refactors the monolithic authentication system into a service-oriented architecture with microservices pattern.
  </agent_instructions>

  <steps>
    <step number="1">
      <title>Create Authentication Service</title>
      <description>
        Extract authentication logic into a dedicated service to establish the foundation of the service-oriented architecture. This separates concerns and enables independent scaling of authentication functionality.
      </description>
      <confidence>High</confidence>
      <file_operations>
        <operation type="create">
          <path>src/services/auth-service.ts</path>
          <changes>
            Create new AuthenticationService class with methods for authenticateUser, verifyPassword, and token management. Include proper TypeScript interfaces for LoginCredentials and AuthResult.
          </changes>
          <validation>
            Run 'npm run typecheck' to verify TypeScript compilation and 'npm test src/services/auth-service.spec.ts' to validate functionality.
          </validation>
        </operation>
        <operation type="modify">
          <path>src/utils/auth-utils.ts</path>
          <changes>
            Refactor existing utility functions to support the new service architecture. Move password hashing and token utilities to support the AuthenticationService.
          </changes>
          <validation>
            Grep for import statements to ensure all references are updated: 'rg "auth-utils" --type ts src/'
          </validation>
        </operation>
        <operation type="modify">
          <path>src/middleware/auth-middleware.ts</path>
          <changes>
            Update middleware to use the new AuthenticationService instead of direct authentication logic. Inject service dependency properly.
          </changes>
          <validation>
            Test middleware integration: 'npm test src/middleware/auth-middleware.spec.ts'
          </validation>
        </operation>
      </file_operations>
      <bash_commands>mkdir -p src/services && touch src/services/auth-service.ts</bash_commands>
    </step>

    <step number="2">
      <title>Implement API Gateway Pattern</title>
      <description>
        Create an API gateway to centralize route management and provide a single entry point for authentication-related requests. This enables better monitoring, security, and load balancing.
      </description>
      <confidence>High</confidence>
      <file_operations>
        <operation type="create">
          <path>src/gateway/api-gateway.ts</path>
          <changes>
            Create ApiGateway class with route setup for authentication endpoints. Include middleware integration and request routing logic to appropriate services.
          </changes>
          <validation>
            Start development server and test endpoints: 'npm run dev' and verify /auth/login responds correctly
          </validation>
        </operation>
        <operation type="modify">
          <path>src/routes/auth-routes.ts</path>
          <changes>
            Update existing auth routes to work with the new API gateway pattern. Remove redundant route handlers and delegate to gateway.
          </changes>
          <validation>
            Run integration tests: 'npm test src/routes/auth-routes.spec.ts'
          </validation>
        </operation>
      </file_operations>
      <bash_commands>mkdir -p src/gateway && rg "router\.(post|get)" src/routes/ --type ts</bash_commands>
    </step>
  </steps>
</implementation_plan>`,
  },
  {
    id: 'plan-event-driven',
    title: 'Implementation Plan', 
    planTitle: 'Plan C: Event-Driven Architecture Pattern',
    model: 'GPT-5.1',
    tokens: 9156,
    completionTime: '3m 42s',
    timeAgo: 'just now',
    status: 'completed' as const,
    content: `<implementation_plan>
  <agent_instructions>
    Read the following plan CAREFULLY, COMPREHEND IT, and IMPLEMENT it COMPLETELY. THINK HARD!
    DO NOT add unnecessary comments.
    DO NOT introduce backward compatibility approaches; leverage fully modern, forward-looking features exclusively.
    This plan transforms the authentication system to use event-driven architecture with message queues and event sourcing.
  </agent_instructions>

  <steps>
    <step number="1">
      <title>Setup Event Infrastructure</title>
      <description>
        Create event bus and message queue system to enable decoupled, event-driven communication between authentication components. This establishes the foundation for scalable, reactive authentication flows.
      </description>
      <confidence>High</confidence>
      <file_operations>
        <operation type="create">
          <path>src/events/event-bus.ts</path>
          <changes>
            Create EventBus class with typed event handling for authentication events. Include emit, subscribe, and unsubscribe methods with proper TypeScript generics for type safety.
          </changes>
          <validation>
            Run unit tests to verify event emission and subscription: 'npm test src/events/event-bus.spec.ts'
          </validation>
        </operation>
        <operation type="create">
          <path>src/events/auth-events.ts</path>
          <changes>
            Define AuthEvents interface with strongly typed event payloads for login attempts, successes, failures, and logout events. Include timestamp and metadata fields.
          </changes>
          <validation>
            Check TypeScript compilation: 'npx tsc --noEmit --skipLibCheck'
          </validation>
        </operation>
        <operation type="create">
          <path>src/queues/message-queue.ts</path>
          <changes>
            Implement message queue abstraction for handling authentication events asynchronously. Include retry logic and dead letter queue support for failed events.
          </changes>
          <validation>
            Test message queue functionality: 'npm test src/queues/message-queue.spec.ts'
          </validation>
        </operation>
      </file_operations>
      <bash_commands>mkdir -p src/events src/queues && rg "interface.*Events" --type ts src/</bash_commands>
    </step>

    <step number="2">
      <title>Implement Event Sourcing</title>
      <description>
        Store authentication events for audit trail and replay capabilities. This enables comprehensive logging of all authentication activities and supports debugging and compliance requirements.
      </description>
      <confidence>Medium</confidence>
      <assumptions>Database supports efficient event storage and querying by aggregate ID</assumptions>
      <file_operations>
        <operation type="create">
          <path>src/events/event-store.ts</path>
          <changes>
            Create EventStore class with methods to append, retrieve, and query authentication events. Include event versioning, aggregate ID indexing, and persistence layer integration.
          </changes>
          <validation>
            Test event storage and retrieval: 'npm test src/events/event-store.spec.ts'
          </validation>
        </operation>
        <operation type="create">
          <path>src/services/auth-event-service.ts</path>
          <changes>
            Implement AuthEventService to coordinate between authentication logic and event sourcing. Include event projection and state reconstruction capabilities.
          </changes>
          <validation>
            Integration test with authentication flow: 'npm test src/services/auth-event-service.integration.spec.ts'
          </validation>
        </operation>
      </file_operations>
      <bash_commands>grep -r "generateUUID" src/ --include="*.ts" && npm list uuid</bash_commands>
      <exploration_commands>rg "class.*Store" --type ts src/ -A 10</exploration_commands>
    </step>
  </steps>
</implementation_plan>`,
  },
];

// Plan card component
interface PlanRowProps {
  plan: typeof mockPlans[0];
  isSelected: boolean;
  onToggle: (planId: string) => void;
  onViewContent: (plan: typeof mockPlans[0]) => void;
  buttonPressed?: string;
}

function PlanRow({ plan, isSelected, onToggle, onViewContent, buttonPressed }: PlanRowProps) {
  const tokenCountDisplay = plan.tokens.toLocaleString();
  const hasContent = true; // completed plans have content

  return (
    <DesktopCard className={`relative mb-2 sm:mb-4 mx-1 sm:mx-0 overflow-hidden min-h-[160px] transition-all duration-300 ${
      isSelected ? 'teal-glow-subtle ring-2 ring-primary/20' : ''
    }`}>
      {/* Status indicator strip on the left side - green for completed plans */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />

      <DesktopCardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-2 flex-1">
            {/* Checkbox for completed plans only - matching step 9 styling */}
            <div className="flex items-center mt-1">
              <DesktopCheckbox
                checked={isSelected}
                onChange={() => onToggle(plan.id)}
              />
            </div>
            <div className="flex-1">
              <DesktopCardTitle className="text-base">
                {plan.planTitle}
              </DesktopCardTitle>
              <DesktopCardDescription className="flex flex-wrap gap-x-2 text-xs mt-1">
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
        {/* Actions bar - matching desktop implementation plans exactly with all buttons */}
        <div className="flex justify-between mt-2">
          <div className="space-x-1 flex flex-wrap">
            <DesktopButton
              variant="outline"
              size="sm"
              className={`text-xs h-7 px-2 py-1 transition-all duration-200 ${
                buttonPressed === `view-content-${plan.id}` 
                  ? 'bg-primary/20 border-primary/40 scale-95 shadow-inner ring-2 ring-primary/30' 
                  : 'hover:bg-accent/50'
              }`}
              disabled={!hasContent}
              onClick={() => onViewContent(plan)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              View Content
            </DesktopButton>

            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              onClick={() => {}}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </DesktopButton>

            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              onClick={() => {}}
            >
              <Code className="mr-1 h-3.5 w-3.5" />
              Parallel Claude Coding Agents
            </DesktopButton>

            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              onClick={() => {}}
            >
              <Search className="mr-1 h-3.5 w-3.5" />
              Investigate Results
            </DesktopButton>
          </div>

          <div className="space-x-1">
            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              onClick={() => {}}
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
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </DesktopButton>
          </div>
        </div>
      </DesktopCardContent>
    </DesktopCard>
  );
}

// MergePlansSection component
interface MergePlansSectionProps {
  selectedCount: number;
  mergeInstructions: string;
  isMerging: boolean;
  onMergeInstructionsChange: (instructions: string) => void;
  onMerge: () => void;
  onClearSelection: () => void;
  buttonPressed?: string;
}

function MergePlansSection({
  selectedCount,
  mergeInstructions,
  isMerging,
  onMergeInstructionsChange,
  onMerge,
  onClearSelection,
  buttonPressed,
}: MergePlansSectionProps & { buttonPressed?: string }) {
  const [isOpen, setIsOpen] = useState(true);
  const [localInstructions, setLocalInstructions] = useState(mergeInstructions);

  useEffect(() => {
    setLocalInstructions(mergeInstructions);
  }, [mergeInstructions]);

  const handleInstructionsChange = (value: string) => {
    setLocalInstructions(value);
    onMergeInstructionsChange(value);
  };

  return (
    <DesktopCard className="bg-primary/5 border-primary/20 mb-2 sm:mb-4 mx-1 sm:mx-0">
      <DesktopCollapsible open={isOpen} onOpenChange={setIsOpen}>
        <DesktopCollapsibleTrigger asChild>
          <div className="px-2 py-2 sm:px-4 sm:py-3 cursor-pointer hover:bg-primary/10 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Merge className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectedCount} plans selected for merge
                </span>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </DesktopCollapsibleTrigger>
        <DesktopCollapsibleContent>
          <DesktopCardContent className="pt-0 pb-2 px-2 sm:pb-4 sm:px-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="merge-instructions" className="text-sm text-muted-foreground mb-1 block">
                  Merge Instructions (optional)
                </label>
                <DesktopTextarea
                  placeholder="Provide specific instructions for how to merge these plans..."
                  value={localInstructions}
                  onChange={(e) => handleInstructionsChange(e.target.value)}
                  className="min-h-[80px] resize-y border-[oklch(0.90_0.04_195_/_0.5)] focus:border-primary/60"
                />
              </div>
              
              <div className="flex gap-2">
                <DesktopButton
                  onClick={onMerge}
                  disabled={isMerging || selectedCount < 2}
                  size="sm"
                  className={`flex-1 transition-all duration-200 ${
                    buttonPressed === 'merge-plans' 
                      ? 'bg-primary/20 border-primary/40 scale-95 shadow-inner ring-2 ring-primary/30' 
                      : 'hover:bg-primary/10'
                  }`}
                >
                  <Merge className="h-4 w-4 mr-2" />
                  Merge Plans
                </DesktopButton>
                <DesktopButton
                  onClick={onClearSelection}
                  variant="outline"
                  size="sm"
                  disabled={isMerging}
                >
                  Clear Selection
                </DesktopButton>
              </div>
              
              <p className="text-xs text-muted-foreground">
                The AI will combine the selected plans into a single comprehensive implementation plan.
              </p>
            </div>
          </DesktopCardContent>
        </DesktopCollapsibleContent>
      </DesktopCollapsible>
    </DesktopCard>
  );
}

// Floating merge instructions for editor view
interface FloatingMergeInstructionsProps {
  isVisible: boolean;
  instructions: string;
  onInstructionsChange: (value: string) => void;
}

function FloatingMergeInstructions({ isVisible, instructions, onInstructionsChange }: FloatingMergeInstructionsProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute top-4 right-4 w-80 max-w-[calc(100vw-2rem)] bg-card/95 backdrop-blur-sm border border-[oklch(0.90_0.04_195_/_0.4)] rounded-lg shadow-lg p-4 z-10">
      <div className="flex items-center gap-2 mb-2">
        <StickyNote className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium text-foreground flex-1">Merge Instructions</h3>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="relative">
        <DesktopTextarea
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder="Add notes about what you like or don't like in this plan..."
          className="w-full resize-none h-32 !border-[oklch(0.90_0.04_195_/_0.5)] focus:!border-primary/60"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Use this to take notes while reviewing implementation plans for merging.
      </p>
    </div>
  );
}

// Complete workflow with proper button press → action delays
const MERGE_INSTRUCTIONS_PHASES = [
  { name: 'plan-list' as const, durationMs: 2500 },          // Time to see plan list and understand interface
  { name: 'button-press-delay' as const, durationMs: 800 },  // Button press feedback BEFORE modal opens  
  { name: 'view-plan1' as const, durationMs: 3000 },         // Read plan 1 details in modal
  { name: 'select-plan1' as const, durationMs: 1200 },       // Selection action with visual feedback
  { name: 'navigate-to-plan2' as const, durationMs: 800 },   // Navigation to next plan
  { name: 'view-plan2' as const, durationMs: 3000 },         // Read plan 2 details
  { name: 'select-plan2' as const, durationMs: 1200 },       // Selection action with visual feedback
  { name: 'edit-instructions' as const, durationMs: 4000 },  // Type merge instructions
  { name: 'back-to-list' as const, durationMs: 1500 },       // Return to appreciate the merge setup
  { name: 'execute-merge' as const, durationMs: 800 },       // Click "Merge Plans" button with visual feedback
  { name: 'job-running' as const, durationMs: 4000 },        // Show job running with progress like "9 Implementation Plans"
  { name: 'job-completed' as const, durationMs: 2000 },      // Job completes, show result
  { name: 'wait' as const, durationMs: 1000 }                // Pause before loop restart
];

export function MergeInstructionsMock({ isInView }: { isInView: boolean; resetKey?: number }) {

  const { phaseName: phase, phaseProgress01: phaseProgress } = useTimedCycle({
    active: isInView,
    phases: MERGE_INSTRUCTIONS_PHASES,
    loop: true,
    resetOnDeactivate: true
  });
  
  // Derive state from current phase - natural user behavior  
  const currentView = phase === 'plan-list' || phase === 'button-press-delay' || phase === 'back-to-list' || phase === 'execute-merge' || phase === 'job-running' || phase === 'job-completed' || phase === 'wait' ? 'plan-list' : 'editor';
  
  const currentPlanIndex = (() => {
    if (currentView === 'plan-list') return 0;
    if (phase === 'view-plan1' || phase === 'select-plan1') return 0;  // Viewing plan 1
    if (phase === 'navigate-to-plan2' || phase === 'view-plan2' || phase === 'select-plan2' || phase === 'edit-instructions') return 1; // Viewing plan 2
    return 0;
  })();
  
  // Natural selection progression - no flickering states
  const selectedPlans = (() => {
    const selected = new Set<string>();
    
    // Plan 1 gets selected during select-plan1 phase and stays selected
    if (phase === 'select-plan1' && phaseProgress > 0.5) {
      selected.add(mockPlans[0]?.id || '');
    }
    if (phase === 'navigate-to-plan2' || phase === 'view-plan2' || phase === 'select-plan2' || phase === 'edit-instructions' || phase === 'back-to-list' || phase === 'execute-merge' || phase === 'job-running' || phase === 'job-completed' || phase === 'wait') {
      selected.add(mockPlans[0]?.id || ''); // Plan 1 stays selected
    }
    
    // Plan 2 gets selected during select-plan2 phase and stays selected  
    if (phase === 'select-plan2' && phaseProgress > 0.5) {
      selected.add(mockPlans[1]?.id || '');
    }
    if (phase === 'edit-instructions' || phase === 'back-to-list' || phase === 'execute-merge' || phase === 'job-running' || phase === 'job-completed' || phase === 'wait') {
      selected.add(mockPlans[1]?.id || ''); // Plan 2 stays selected
    }
    
    return selected;
  })();
  
  // Use typewriter during edit-instructions phase
  const instructionsText = 'Focus on maintaining compatibility between the service-oriented and event-driven approaches. Prioritize the authentication service foundation from Plan B, then layer in the event infrastructure from Plan C.';
  const { displayText: typedInstructions } = useTypewriter({
    text: instructionsText,
    active: phase === 'edit-instructions',
    durationMs: 3500  // Slower typing to match longer phase duration
  });
  
  // Instructions persist after typing (natural behavior)
  const mergeInstructions = (phase === 'edit-instructions') ? typedInstructions : 
                            (phase === 'back-to-list' || phase === 'wait') ? instructionsText : '';
  
  // Button press states with clear feedback BEFORE actions
  const buttonStates = {
    [`view-content-${mockPlans[0]?.id || 'unknown'}`]: phase === 'plan-list' && phaseProgress > 0.7 || phase === 'button-press-delay', // Button stays pressed during delay
    'nav-next': phase === 'navigate-to-plan2' && phaseProgress > 0.3,  // More deliberate navigation
    'select-plan': (phase === 'select-plan1' && phaseProgress > 0.4) || (phase === 'select-plan2' && phaseProgress > 0.4), // Later selection clicks
    'back-to-list': phase === 'back-to-list' && phaseProgress > 0.3,  // More deliberate return navigation
    'merge-plans': (phase === 'back-to-list' && phaseProgress > 0.8) || (phase === 'execute-merge')   // Merge button press feedback - starts in back-to-list and continues through execute-merge
  };
  
  const currentPlan = mockPlans[currentPlanIndex];
  const isCurrentPlanSelected = currentPlan ? selectedPlans.has(currentPlan.id) : false;
  const [isMerging] = useState(false);

  // Event handlers (dummy functions for demo)
  const handleTogglePlanSelection = () => {};
  const handleViewContent = () => {};
  const handleNavigate = (_direction: string) => {};
  const handleSelectPlan = () => {};
  const handleMergePlans = () => {};
  const handleClearSelection = () => {};
  const setMergeInstructions = () => {};

  // Render plan list view
  if (currentView === 'plan-list') {
    return (
      <div className="space-y-2 sm:space-y-4 px-1 py-2 sm:p-4 max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-foreground">Implementation Plans</h2>
        </header>
        
        {/* Merge Plans Section */}
        {selectedPlans.size > 0 && (
          <MergePlansSection
            selectedCount={selectedPlans.size}
            mergeInstructions={mergeInstructions}
            isMerging={isMerging}
            onMergeInstructionsChange={setMergeInstructions}
            onMerge={handleMergePlans}
            onClearSelection={handleClearSelection}
            {...(buttonStates['merge-plans'] && { buttonPressed: 'merge-plans' })}
          />
        )}

        {/* Job Running Progress Card - Similar to "9 Implementation Plans" step */}
        {(phase === 'job-running' || phase === 'job-completed') && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <DesktopCard className="relative mb-4 overflow-hidden">
              {/* Status indicator strip */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                phase === 'job-completed' ? 'bg-success' : 'bg-primary'
              }`} />

              <DesktopCardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-2 flex-1">
                    <div className="flex-1">
                      <DesktopCardTitle className="text-base">
                        {phase === 'job-completed' ? 'Merged Implementation Plan' : 'Merging Implementation Plans'}
                      </DesktopCardTitle>
                      <DesktopCardDescription className="flex flex-wrap gap-x-2 text-xs mt-1">
                        <span>GPT-5.1</span>
                        <span>•</span>
                        <span>{phase === 'job-completed' ? '12,847' : 'Calculating...'} tokens</span>
                      </DesktopCardDescription>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">just now</div>
                </div>
              </DesktopCardHeader>

              <DesktopCardContent className="pb-4 pt-0">
                {/* Progress indicator for streaming jobs - exact desktop logic */}
                {phase === 'job-running' && (
                  <div className="mb-3">
                    {(() => {
                      // Show indeterminate progress if no accurate progress available
                      const displayProgress = phaseProgress * 100;
                      
                      if (displayProgress !== undefined) {
                        return (
                          <React.Fragment key="progress-fragment">
                            <DesktopProgress value={displayProgress} className="h-1.5" />
                            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                              <span>Merging plans with custom instructions...</span>
                              <span>{Math.round(displayProgress)}%</span>
                            </div>
                          </React.Fragment>
                        );
                      } else {
                        // Show indeterminate progress when no progress data available
                        return (
                          <React.Fragment key="progress-fragment">
                            <DesktopProgress className="h-1.5" />
                            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                              <span>Merging plans with custom instructions...</span>
                              <span>Processing...</span>
                            </div>
                          </React.Fragment>
                        );
                      }
                    })()}
                  </div>
                )}

                {/* Actions bar - matching other implementation plan jobs exactly */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {/* First row of buttons */}
                  <div className="flex gap-1 flex-wrap">
                    <DesktopButton
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2 py-1"
                      disabled={phase === 'job-running'}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {phase === 'job-running' ? 'View Stream' : 'View Content'}
                    </DesktopButton>

                    {/* Copy buttons - only show for completed jobs, matching other implementation plans */}
                    {phase === 'job-completed' && (
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
                      disabled={phase === 'job-running'}
                    >
                      <Info className="mr-1 h-3.5 w-3.5" />
                      Details
                    </DesktopButton>

                    <DesktopButton
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 px-2 py-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={phase === 'job-running'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </DesktopButton>
                  </div>
                </div>
              </DesktopCardContent>
            </DesktopCard>
          </div>
        )}
        
        {/* Plan Cards */}
        <div className="space-y-3">
          {mockPlans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              isSelected={selectedPlans.has(plan.id)}
              onToggle={handleTogglePlanSelection}
              onViewContent={handleViewContent}
              {...(buttonStates[`view-content-${plan.id}`] && { buttonPressed: `view-content-${plan.id}` })}
            />
          ))}
        </div>
      </div>
    );
  }

  // Guard against undefined currentPlan
  if (!currentPlan) {
    return <div className="text-center text-muted-foreground">Loading plan...</div>;
  }

  // Render editor view
  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col h-[80vh] bg-card rounded-xl shadow-lg border border-[oklch(0.90_0.04_195_/_0.4)] text-foreground">
      {/* Header - Exact desktop app layout */}
      <div className="flex flex-row items-start justify-between space-y-0 pb-2 p-6 flex-shrink-0 border-b border-[oklch(0.90_0.04_195_/_0.2)]">
        <h2 className="text-lg font-semibold">
          Implementation Plan: {currentPlan.planTitle}
        </h2>
        
        <div className="flex items-start gap-2">
          {/* Status */}
          <div className="text-sm text-muted-foreground min-w-[200px] flex justify-center">
            <div className="flex flex-col items-center">
              <span>Completed</span>
              <span className="text-xs">{currentPlan.timeAgo}</span>
              <span className="text-xs text-muted-foreground mt-1">{currentPlan.model}</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-wrap gap-2">
            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7"
              title="Launch Parallel Claude Coding Agents"
            >
              Parallel Claude Coding Agents
            </DesktopButton>
          </div>
        </div>
      </div>

      {/* Content - Exact desktop app layout */}
      <div className="flex-1 min-h-0 relative">
        <MonacoCodeViewer
          content={currentPlan.content}
          title="Implementation Plan"
          language="xml"
          height="100%"
          showCopy={false}
          className="border-0 rounded-none"
        />
        
        {/* Navigation overlay at the bottom - Exact desktop app layout */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-[oklch(0.90_0.04_195_/_0.5)] rounded-full px-3 py-1.5 shadow-lg">
            <DesktopButton
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate('previous')}
              disabled={currentPlanIndex === 0}
              className="h-7 w-7 p-0 hover:bg-accent/50"
              title="Previous plan (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </DesktopButton>
            
            <span className="text-xs text-muted-foreground px-2 min-w-[60px] text-center">
              {currentPlanIndex + 1} of {mockPlans.length}
            </span>
            
            <DesktopButton
              variant="ghost" 
              size="sm"
              onClick={() => handleNavigate('next')}
              disabled={currentPlanIndex === mockPlans.length - 1}
              className={`h-7 w-7 p-0 hover:bg-accent/50 ${
                buttonStates['nav-next'] ? 'bg-accent/50' : ''
              }`}
              title="Next plan (→)"
            >
              <ChevronRight className="h-4 w-4" />
            </DesktopButton>

            <div className="w-px h-4 bg-border mx-1" />
            
            {isCurrentPlanSelected ? (
              <DesktopButton
                variant="ghost"
                size="sm"
                onClick={handleSelectPlan}
                className={`h-7 px-2 text-xs hover:bg-red-50 dark:hover:bg-red-950/20 text-green-600 dark:text-green-400 hover:text-red-600 dark:hover:text-red-400 border border-green-200 dark:border-green-800 hover:border-red-200 dark:hover:border-red-800 transition-all duration-200 ${
                  buttonStates['select-plan'] ? 'bg-green-100 dark:bg-green-950/30' : ''
                }`}
                title="Remove from selection"
              >
                <Check className="h-3 w-3 mr-1" />
                Selected
              </DesktopButton>
            ) : (
              <DesktopButton
                variant="ghost"
                size="sm"
                onClick={handleSelectPlan}
                className={`h-7 px-2 text-xs hover:bg-green-50 dark:hover:bg-green-950/20 text-muted-foreground hover:text-green-600 dark:hover:text-green-400 border border-dashed border-muted-foreground/30 hover:border-green-200 dark:hover:border-green-800 transition-all duration-200 ${
                  buttonStates['select-plan'] ? 'bg-green-50 dark:bg-green-950/20' : ''
                }`}
                title="Add to selection for merging"
              >
                <Plus className="h-3 w-3 mr-1" />
                Select
              </DesktopButton>
            )}
          </div>
        </div>

        {/* Floating Merge Instructions - Exact desktop app behavior */}
        <FloatingMergeInstructions
          isVisible={selectedPlans.size > 0}
          instructions={mergeInstructions}
          onInstructionsChange={setMergeInstructions}
        />
      </div>
    </div>
  );
}
export default MergeInstructionsMock;

