// Step 14: Copy Buttons Mock - Replicates desktop settings copy button UI
'use client';

import { DesktopButton } from '../desktop-ui/DesktopButton';
import { usePulse } from '../hooks/useScrollOrchestration';
import { GripVertical, Trash2 } from 'lucide-react';

// ButtonConfigurationCard component
const ButtonConfigurationCard = ({ config, isDragging, isPreDrag }: {
  config: { label: string; content: string };
  isDragging: boolean;
  isPreDrag: boolean;
}) => (
  <div className={`relative transition-all duration-300 ${
    isDragging ? 'transform translate-y-24 rotate-2 scale-105 z-10 shadow-2xl' : 
    isPreDrag ? 'transform -translate-y-1 shadow-lg' : ''
  }`}>
    <div className={`absolute left-2 top-1/2 -translate-y-1/2 select-none touch-none p-2 -ml-1 -mt-1 transition-colors duration-300 ${
      (isPreDrag || isDragging) ? 'cursor-grabbing text-primary' : 'cursor-grab text-muted-foreground'
    }`}>
      <GripVertical className="h-4 w-4" />
    </div>
    <div className={`space-y-4 p-4 pl-8 border rounded-lg transition-all duration-300 ${
      isDragging ? 'border-primary/50 bg-primary/5 shadow-lg' : 'border-border/50 bg-background/50'
    }`}>
      <div className="flex justify-end">
        <DesktopButton
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
        >
          <Trash2 className="h-4 w-4" />
        </DesktopButton>
      </div>
      
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-medium">Label</label>
          <div className="h-8 px-3 py-2 border border-input bg-background text-sm rounded-lg flex items-center">
            {config.label}
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-xs font-medium">Content</label>
          <div className="min-h-[80px] p-3 border border-input bg-background text-sm rounded-lg">
            <div className="text-muted-foreground text-xs leading-relaxed">
              {config.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export function CopyButtonsMock({ isInView, progress }: { isInView: boolean; progress: number }) {
  // Show basic UI first
  const showAddButton = progress >= 0.1;
  const addButtonPulse = usePulse(isInView && showAddButton, 1000);
  
  // Looping drag animation cycle (each cycle is 0.3 units long)
  const cycleLength = 0.3;
  const waitTime = 0.1; // 0.1 units wait between cycles
  const totalCycleTime = cycleLength + waitTime; // 0.4 total
  
  // Start looping at progress 0.2
  const animationStart = 0.2;
  const normalizedProgress = Math.max(0, progress - animationStart);
  const currentCycle = normalizedProgress % totalCycleTime;
  
  // Animation states within each cycle
  const isInWaitPeriod = currentCycle >= cycleLength; // Last 0.1 of each cycle
  const cycleProgress = isInWaitPeriod ? 0 : currentCycle / cycleLength; // 0-1 within active animation
  
  // Drag animation states
  const isPreDrag = cycleProgress > 0 && cycleProgress <= 0.2;
  const isDragging = cycleProgress > 0.2 && cycleProgress <= 0.7;
  
  // Determine which button should be on top (alternate each cycle)
  const cycleNumber = Math.floor(normalizedProgress / totalCycleTime);
  const shouldSwap = cycleNumber % 2 === 1;
  
  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Copy Button Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configurable copy buttons for implementation plans
        </p>
      </div>

      <div className="space-y-3">
        {/* Help text */}
        <p className="text-xs text-muted-foreground">
          Add buttons that will appear when viewing implementation plans. Use <code className="bg-muted px-1 rounded">{"{{IMPLEMENTATION_PLAN}}"}</code> for full content, <code className="bg-muted px-1 rounded">{"{{STEP_CONTENT}}"}</code> for specific steps.
        </p>
        
        {showAddButton && (
          <div className="flex items-center justify-end">
            <DesktopButton
              variant="outline"
              size="sm"
              className={addButtonPulse ? "animate-pulse flex items-center gap-2" : "flex items-center gap-2"}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Button
            </DesktopButton>
          </div>
        )}

        {/* Create array of configurations and map to ButtonConfigurationCard */}
        {(() => {
          const configurations = [
            {
              label: 'Parallel Claude Coding Agents',
              content: '{{IMPLEMENTATION_PLAN}}\\nNOW, think deeply! Read the files mentioned, understand them and launch parallel Claude coding agents that run AT THE SAME TIME TO SAVE TIME and implement EVERY SINGLE aspect of the perfect plan precisely and systematically...'
            },
            {
              label: 'Investigate Results',
              content: 'Investigate the results of ALL agents that were launched and ensure we have implemented the COMPLETE plan CORRECTLY! Perform a thorough self-check without launching background agents...'
            }
          ];
          
          const orderedConfigs = shouldSwap ? [...configurations].reverse() : configurations;
          
          return orderedConfigs.map((config, index) => {
            const isMainCard = (index === 0);
            const cardIsDragging = isDragging && isMainCard;
            const cardIsPreDrag = isPreDrag && isMainCard;
            const cardIsSecondary = !isMainCard;
            
            return (
              <div key={`${config.label}-${shouldSwap ? 'swapped' : 'normal'}`} className={`relative transition-all duration-300 ${
                cardIsDragging ? 'transform translate-y-24 rotate-2 scale-105 z-10 shadow-2xl' : 
                cardIsPreDrag ? 'transform -translate-y-1 shadow-lg' : 
                cardIsSecondary && isDragging ? 'transform -translate-y-24 opacity-60' :
                cardIsSecondary && isPreDrag ? 'transform translate-y-1 shadow-sm' : ''
              }`}>
                <ButtonConfigurationCard 
                  config={config} 
                  isDragging={cardIsDragging}
                  isPreDrag={cardIsPreDrag || (cardIsSecondary && (isPreDrag || isDragging))}
                />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}