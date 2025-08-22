// Step 10-11: Plan Selection & Merge Instructions - Complete workflow simulation
'use client';

import React, { useState, useEffect } from 'react';
import { useTimedCycle, useTypewriter } from '../hooks';
import { Eye, Plus, Check, ChevronLeft, ChevronRight, Copy, StickyNote, GripVertical, Info, Trash2, Merge, ChevronDown, ChevronUp } from 'lucide-react';
import { DesktopCard, DesktopCardHeader, DesktopCardTitle, DesktopCardDescription, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopCheckbox } from '../desktop-ui/DesktopCheckbox';
import { DesktopCodeViewer } from '../desktop-ui/DesktopCodeViewer';
import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopCollapsible, DesktopCollapsibleTrigger, DesktopCollapsibleContent } from '../desktop-ui/DesktopCollapsible';

// Mock plan data that simulates real implementation plans
const mockPlans = [
  {
    id: 'plan-service-oriented',
    title: 'Implementation Plan',
    planTitle: 'Plan B: Service-Oriented Architecture Design',
    model: 'GPT-4 Turbo',
    tokens: 7890,
    completionTime: '2m 15s',
    timeAgo: '5 minutes ago',
    status: 'completed' as const,
    content: `<implementation_plan>
<objective>
Refactor the current monolithic authentication system into a service-oriented architecture with microservices pattern.
</objective>

<steps>
<step number="1" title="Create Authentication Service">
<description>Extract authentication logic into a dedicated service</description>
<files_to_modify>
- src/services/auth-service.ts (new)
- src/utils/auth-utils.ts (refactor)
- src/middleware/auth-middleware.ts (update)
</files_to_modify>
<implementation>
// Create new authentication service
export class AuthenticationService {
  private tokenManager: TokenManager;
  private userRepository: UserRepository;
  
  async authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {
    // Validate credentials
    const user = await this.userRepository.findByEmail(credentials.email);
    if (!user || !await this.verifyPassword(credentials.password, user.hashedPassword)) {
      throw new AuthenticationError('Invalid credentials');
    }
    
    // Generate JWT token
    const token = await this.tokenManager.generateToken({
      userId: user.id,
      email: user.email,
      roles: user.roles
    });
    
    return { user, token };
  }
}
</implementation>
</step>

<step number="2" title="Implement API Gateway Pattern">
<description>Create an API gateway to route requests to appropriate services</description>
<files_to_modify>
- src/gateway/api-gateway.ts (new)
- src/routes/auth-routes.ts (update)
</files_to_modify>
<implementation>
export class ApiGateway {
  private authService: AuthenticationService;
  private userService: UserService;
  
  constructor() {
    this.setupRoutes();
  }
  
  private setupRoutes() {
    this.router.post('/auth/login', this.handleLogin.bind(this));
    this.router.post('/auth/logout', this.handleLogout.bind(this));
    this.router.get('/users/:id', this.authMiddleware, this.handleGetUser.bind(this));
  }
}
</implementation>
</step>
</steps>

<testing>
- Unit tests for AuthenticationService
- Integration tests for API Gateway
- End-to-end authentication flow tests
</testing>
</implementation_plan>`,
  },
  {
    id: 'plan-event-driven',
    title: 'Implementation Plan', 
    planTitle: 'Plan C: Event-Driven Architecture Pattern',
    model: 'Claude 3.5 Sonnet',
    tokens: 9156,
    completionTime: '3m 42s',
    timeAgo: '8 minutes ago',
    status: 'completed' as const,
    content: `<implementation_plan>
<objective>
Transform the authentication system to use event-driven architecture with message queues and event sourcing.
</objective>

<steps>
<step number="1" title="Setup Event Infrastructure">
<description>Create event bus and message queue system</description>
<files_to_modify>
- src/events/event-bus.ts (new)
- src/events/auth-events.ts (new)
- src/queues/message-queue.ts (new)
</files_to_modify>
<implementation>
// Event-driven authentication events
export interface AuthEvents {
  'user.login.attempt': { userId: string; timestamp: Date; ipAddress: string };
  'user.login.success': { userId: string; sessionId: string; timestamp: Date };
  'user.login.failed': { email: string; reason: string; timestamp: Date };
  'user.logout': { userId: string; sessionId: string; timestamp: Date };
}

export class EventBus {
  private eventHandlers: Map<string, Array<(event: any) => void>> = new Map();
  
  emit<T extends keyof AuthEvents>(event: T, payload: AuthEvents[T]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(payload));
    }
  }
  
  subscribe<T extends keyof AuthEvents>(event: T, handler: (payload: AuthEvents[T]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }
}
</implementation>
</step>

<step number="2" title="Implement Event Sourcing">
<description>Store authentication events for audit and replay capabilities</description>
<files_to_modify>
- src/events/event-store.ts (new)
- src/services/auth-event-service.ts (new)
</files_to_modify>
<implementation>
export class EventStore {
  private events: AuthEvent[] = [];
  
  async appendEvent(event: AuthEvent): Promise<void> {
    event.id = generateUUID();
    event.timestamp = new Date();
    event.version = this.getNextVersion();
    
    this.events.push(event);
    await this.persistEvent(event);
  }
  
  async getEvents(aggregateId: string): Promise<AuthEvent[]> {
    return this.events.filter(event => event.aggregateId === aggregateId);
  }
}
</implementation>
</step>
</steps>

<benefits>
- Improved scalability through decoupled components
- Better audit trail with event sourcing
- Enhanced resilience with message queues
- Easier debugging and monitoring
</benefits>
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
    <DesktopCard className="relative mb-2 sm:mb-4 mx-1 sm:mx-0 overflow-hidden">
      {/* Status indicator strip on the left side */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />

      <DesktopCardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-2 flex-1">
            <div className="flex items-center mt-1">
              <DesktopCheckbox
                checked={isSelected}
                onCheckedChange={() => onToggle(plan.id)}
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
          <div className="text-xs text-muted-foreground">{plan.timeAgo}</div>
        </div>
      </DesktopCardHeader>

      <DesktopCardContent className="pb-4 pt-0">
        {/* Actions bar */}
        <div className="flex justify-between mt-2">
          <div className="space-x-1 flex flex-wrap">
            <DesktopButton
              variant="outline"
              size="sm"
              className={`text-xs h-7 px-2 py-1 transition-colors ${
                buttonPressed === `view-content-${plan.id}` ? 'bg-accent/50' : ''
              }`}
              disabled={!hasContent}
              onClick={() => onViewContent(plan)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              View Content
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
              onClick={() => {}}
            >
              <Trash2 className="h-3.5 w-3.5" />
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
}

function MergePlansSection({
  selectedCount,
  mergeInstructions,
  isMerging,
  onMergeInstructionsChange,
  onMerge,
  onClearSelection,
}: MergePlansSectionProps) {
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
                  className="min-h-[80px] resize-y"
                />
              </div>
              
              <div className="flex gap-2">
                <DesktopButton
                  onClick={onMerge}
                  disabled={isMerging || selectedCount < 2}
                  size="sm"
                  className="flex-1"
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
          className="w-full resize-none h-32"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Use this to take notes while reviewing implementation plans for merging.
      </p>
    </div>
  );
}

// Define phases outside component to prevent recreation on each render
const MERGE_INSTRUCTIONS_PHASES = [
  { name: 'plan-list' as const, durationMs: 1000 },        // Time to see plan list (reduced from 1200ms)
  { name: 'editor-plan1' as const, durationMs: 1500 },    // Plan 1 editor view (reduced from 2000ms)  
  { name: 'editor-plan2' as const, durationMs: 1500 },    // Plan 2 editor view (reduced from 2000ms)
  { name: 'select-plan2' as const, durationMs: 500 },     // Quick selection (reduced from 600ms)
  { name: 'select-plan1' as const, durationMs: 500 },     // Quick selection (reduced from 600ms)
  { name: 'edit-instructions' as const, durationMs: 2000 }, // Edit instructions (reduced from 2500ms)
  { name: 'back-to-list' as const, durationMs: 800 },     // Return to list (reduced from 1000ms)
  { name: 'wait' as const, durationMs: 800 }              // Brief pause (reduced from 1000ms)
];

export function MergeInstructionsMock({ isInView }: { isInView: boolean; resetKey?: number }) {

  const { phaseName: phase, phaseProgress01: phaseProgress } = useTimedCycle({
    active: isInView,
    phases: MERGE_INSTRUCTIONS_PHASES,
    loop: true,
    resetOnDeactivate: true
  });
  
  // Derive state from current phase
  const currentView = phase === 'plan-list' || phase === 'back-to-list' || phase === 'wait' ? 'plan-list' : 'editor';
  
  const currentPlanIndex = (() => {
    if (currentView === 'plan-list') return 0;
    if (phase === 'editor-plan1' || phase === 'select-plan1') return 0;
    if (phase === 'editor-plan2' || phase === 'select-plan2') return 1;
    return 0;
  })();
  
  const selectedPlans = (() => {
    const selected = new Set<string>();
    if (phase === 'select-plan2' || phase === 'select-plan1' || phase === 'edit-instructions' || phase === 'back-to-list') {
      if (phase === 'select-plan2' && phaseProgress > 0.5) {
        selected.add(mockPlans[1]?.id || '');
      }
      if (phase === 'select-plan1' && phaseProgress > 0.5) {
        selected.add(mockPlans[0]?.id || '');
        selected.add(mockPlans[1]?.id || '');
      }
      if (phase === 'edit-instructions' || phase === 'back-to-list') {
        selected.add(mockPlans[0]?.id || '');
        selected.add(mockPlans[1]?.id || '');
      }
    }
    return selected;
  })();
  
  // Use typewriter during edit-instructions phase
  const instructionsText = 'Focus on maintaining compatibility between the service-oriented and event-driven approaches. Prioritize the authentication service foundation from Plan B, then layer in the event infrastructure from Plan C.';
  const { displayText: typedInstructions } = useTypewriter({
    text: instructionsText,
    active: phase === 'edit-instructions',
    durationMs: 2000
  });
  const mergeInstructions = phase === 'edit-instructions' ? typedInstructions : '';
  
  // Button press states based on phase
  const buttonStates = {
    [`view-content-${mockPlans[0]?.id || 'unknown'}`]: phase === 'plan-list' && phaseProgress > 0.5,
    'nav-next': phase === 'editor-plan1' && phaseProgress > 0.7,
    'select-plan': (phase === 'select-plan2' && phaseProgress > 0.3) || (phase === 'select-plan1' && phaseProgress > 0.3),
    'nav-prev': phase === 'editor-plan2' && phaseProgress > 0.7
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
          />
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

          {/* Copy Buttons */}
          <div className="flex flex-wrap gap-2">
            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7"
              title="Copy: Implementation Plan"
            >
              <Copy className="h-3 w-3 mr-1" />
              Plan
            </DesktopButton>
            <DesktopButton
              variant="outline"
              size="sm"
              className="text-xs h-7"
              title="Copy: Steps Only"
            >
              <Copy className="h-3 w-3 mr-1" />
              Steps
            </DesktopButton>
          </div>
        </div>
      </div>

      {/* Content - Exact desktop app layout */}
      <div className="flex-1 min-h-0 relative">
        <DesktopCodeViewer
          content={currentPlan.content}
          title="Implementation Plan"
          languageLabel="xml"
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
              className={`h-7 w-7 p-0 hover:bg-accent/50 ${
                buttonStates['nav-prev'] ? 'bg-accent/50' : ''
              }`}
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

