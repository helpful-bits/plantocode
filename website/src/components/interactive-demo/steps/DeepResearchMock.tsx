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
import { Search, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';
import { useTimedCycle, useTweenNumber } from '../hooks';
import { JobDetailsModalMock } from './JobDetailsModalMock';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskText, setTaskText] = useState("I need to understand how user authentication works in this React application. Specifically, I want to analyze the login functionality and JWT token implementation, ensuring that routes are properly protected so users cannot access unauthorized content. Additionally, I want to verify that session management is working correctly and that security best practices are being followed throughout the application.");

  const mockPrompts = [
    "Analyze auth flows", 
    "Check token refresh", 
    "Trace path resolution", 
    "Summarize findings"
  ];

  const { phaseName: currentState } = useTimedCycle({ 
    active: isInView, 
    phases: DEEP_RESEARCH_PHASES, 
    loop: true,
    resetOnDeactivate: true
  });

  // Map to context state
  const contextState = (() => {
    switch (currentState) {
      case 'button-ready': return 'ready';
      case 'wait': return 'idle';
      default: return currentState as 'idle' | 'processing' | 'completed' | 'ready';
    }
  })();

  // Publish state to context on phase transitions
  useEffect(() => {
    setDeepResearchState(contextState);
  }, [contextState, setDeepResearchState]);

  // Use timed numbers for progress animations
  const { value: analysisProgressValue } = useTweenNumber({
    active: currentState === 'processing',
    from: 0,
    to: 100,
    durationMs: 3000
  });

  const { value: webSearchProgressValue } = useTweenNumber({
    active: currentState === 'processing' && analysisProgressValue >= 95 || currentState === 'completed',
    from: 0,
    to: 100,
    durationMs: 4000
  });

  // Update component state based on timing phases
  useEffect(() => {
    if (!isInView) {
      setButtonPressed(false);
      setShowWebSearch(false);
      setIsModalOpen(false);
      return;
    }

    setButtonPressed(currentState === 'processing' || currentState === 'completed');
    setShowWebSearch(analysisProgressValue >= 50);
  }, [isInView, currentState, analysisProgressValue]);

  // Modal control logic
  useEffect(() => {
    if (!isInView) {
      setIsModalOpen(false);
      return;
    }

    if (currentState === 'processing' && analysisProgressValue >= 80) {
      setIsModalOpen(true);
    } else if (currentState === 'completed') {
      setIsModalOpen(true);
    }
  }, [isInView, currentState, analysisProgressValue]);

  const isProcessing = currentState === 'processing';
  const isCompleted = currentState === 'completed';
  const showButton = currentState !== 'idle';

  return (
    <div className="w-full space-y-4">
      <div className="space-y-3">
        <DesktopTextarea
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Describe what you want to research and analyze..."
          className="min-h-[140px] resize-none"
        />
        
        {/* Button container with stable height */}
        <div className="flex justify-end min-h-[40px] transition-all duration-300 ease-in-out">
          <DesktopButton
            size="sm"
            className={cn(
              "transition-all duration-300 ease-in-out",
              showButton ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none",
              buttonPressed && "scale-95 bg-primary-600"
            )}
            disabled={isProcessing}
          >
            <Search className="w-4 h-4 mr-2" />
            {isProcessing ? 'Researching...' : isCompleted ? 'Research Complete' : 'Deep Research'}
          </DesktopButton>
        </div>
      </div>

      {/* Job cards container with stable height */}
      <div className="space-y-3 mt-6 min-h-[280px] transition-all duration-300 ease-in-out">
        <DesktopJobCard className={cn(
          "transition-all duration-300 ease-in-out",
          (isProcessing || isCompleted) ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
        )}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-medium text-sm">Code Analysis</h4>
              <p className="text-xs text-muted-foreground">Analyzing authentication patterns</p>
            </div>
            <div className={`text-xs px-2 py-1 rounded ${analysisProgressValue >= 100 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
              {analysisProgressValue >= 100 ? 'Completed' : 'Running'}
            </div>
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
        </DesktopJobCard>
        
        <DesktopJobCard className={cn(
          "transition-all duration-300 ease-in-out",
          showWebSearch ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
        )}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-medium text-sm">Web Search Research</h4>
              <p className="text-xs text-muted-foreground">Searching for security best practices</p>
            </div>
            <div className={`text-xs px-2 py-1 rounded ${webSearchProgressValue >= 100 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
              {webSearchProgressValue >= 100 ? 'Completed' : 'Running'}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Progress</span>
              <span>{Math.round(webSearchProgressValue)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{width: `${Math.round(webSearchProgressValue)}%`}}></div>
            </div>
          </div>
        </DesktopJobCard>
      </div>

      {/* Completion summary with stable height */}
      <div className={cn(
        "mt-6 p-4 border border-border rounded-lg bg-card min-h-[120px] transition-all duration-300 ease-in-out",
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

      <JobDetailsModalMock 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        prompts={mockPrompts} 
      />
    </div>
  );
}
export default DeepResearchMock;

