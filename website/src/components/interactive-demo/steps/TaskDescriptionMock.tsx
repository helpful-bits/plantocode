// Step 3: Task Description Mock
'use client';

import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { Undo2, Redo2, Mic, Video, ChevronDown, Settings } from 'lucide-react';
import { useTimedLoop, useTypewriter, useIntervalGate } from '../hooks';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { safeStorage } from '../utils/safeStorage';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';

interface TaskDescriptionMockProps {
  isInView: boolean;
}

export function TaskDescriptionMock({ isInView }: TaskDescriptionMockProps) {
  const { taskDescription } = useInteractiveDemoContext();
  const [undoPressed, setUndoPressed] = useState(false);
  const [redoPressed, setRedoPressed] = useState(false);
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [manualTextOverride, setManualTextOverride] = useState<string | null>(null);
  
  const shortTaskDescription = `Create an interactive demo showcasing our desktop application workflow through scroll-triggered animations.

Key requirements:
- Forms auto-populate with sample data
- Buttons simulate clicks
- Dynamic captions appear
- Cohesive user story`;

  // Initialize text history when component mounts or resets
  useEffect(() => {
    if (textHistory.length === 0) {
      setTextHistory([shortTaskDescription, taskDescription]);
      setCurrentHistoryIndex(1);
    }
  }, [taskDescription, shortTaskDescription, textHistory.length]);

  // Use timing-based loop with 16s cycle and 400ms idle delay
  const { t } = useTimedLoop(isInView, 16000, { idleDelayMs: 400, resetOnDeactivate: true });
  
  // Use typewriter for text during 0.3-0.7 window
  const showTyping = t >= 0.3 && t < 0.7;
  const { displayText, isDone } = useTypewriter({ active: showTyping, text: taskDescription, durationMs: 2000 });

  useEffect(() => {
    if (!isInView) return;
    if (isDone && showTyping) {
      safeStorage.setItem("demo/taskDescription", displayText);
    }
  }, [isDone, showTyping, isInView, displayText]);
  
  // Timing-driven state calculation
  const isEmpty = t < 0.3;
  
  // Use interval gates for button pulses - start 1.25s after typing completes
  const undoPressedGate = useIntervalGate(t, [{ startPct: 0.503, endPct: 0.533 }]);
  const redoPressedGate = useIntervalGate(t, [{ startPct: 0.578, endPct: 0.608 }]);
  const micPressed = useIntervalGate(t, [{ startPct: 0.653, endPct: 0.683 }]);
  const videoPressed = useIntervalGate(t, [{ startPct: 0.728, endPct: 0.758 }]);

  // Handle undo/redo functionality
  const handleUndo = () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      const newValue = textHistory[newIndex];
      if (newValue !== undefined) {
        setCurrentHistoryIndex(newIndex);
        setManualTextOverride(newValue);
      }
    }
  };

  const handleRedo = () => {
    if (currentHistoryIndex < textHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      const newValue = textHistory[newIndex];
      if (newValue !== undefined) {
        setCurrentHistoryIndex(newIndex);
        setManualTextOverride(newValue);
      }
    }
  };

  useEffect(() => {
    setUndoPressed(undoPressedGate);
    if (undoPressedGate) {
      handleUndo();
    }
  }, [undoPressedGate]);

  useEffect(() => {
    setRedoPressed(redoPressedGate);
    if (redoPressedGate) {
      handleRedo();
    }
  }, [redoPressedGate]);


  return (
    <div className="w-full">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor="taskDescArea"
              className="font-semibold text-base sm:text-lg text-foreground"
            >
              Task Description
            </label>
            <span
              className={`text-xs bg-destructive/10 backdrop-blur-sm text-destructive px-2 py-0.5 rounded-md border border-destructive/20 transition-opacity ${
                !isEmpty ? "invisible" : ""
              }`}
            >
              Required
            </span>
            {/* Undo/Redo buttons next to the label */}
            <div className="flex items-center gap-1">
              <DesktopButton
                variant="outline"
                size="xs"
                compact
                disabled={isEmpty || currentHistoryIndex <= 0}
                aria-pressed={undoPressed}
                onClick={handleUndo}
                className={cn(
                  "transition-transform duration-200",
                  undoPressed && "scale-95 bg-primary/80 ring-2 ring-primary/40"
                )}
                title="Undo last change"
              >
                <Undo2 className="h-2.5 w-2.5" />
              </DesktopButton>
              <DesktopButton
                variant="outline"
                size="xs"
                compact
                disabled={isEmpty || currentHistoryIndex >= textHistory.length - 1}
                aria-pressed={redoPressed}
                onClick={handleRedo}
                className={cn(
                  "transition-transform duration-200",
                  redoPressed && "scale-95 bg-primary/80 ring-2 ring-primary/40"
                )}
                title="Redo undone change"
              >
                <Redo2 className="h-2.5 w-2.5" />
              </DesktopButton>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
            <div className="h-6 w-[100px] px-2 text-sm border border-[oklch(0.90_0.04_195_/_0.5)] bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer flex items-center justify-between rounded">
              <span className="text-xs">English</span>
              <ChevronDown className="h-3 w-3" />
            </div>
            
            <div className="h-6 px-2 text-sm border border-[oklch(0.90_0.04_195_/_0.5)] bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer flex items-center justify-between rounded">
              <span className="text-xs">AirPods Max</span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </div>

            <DesktopButton
              variant="ghost"
              size="sm"
              className={`h-6 w-6 hover:bg-primary/10 text-primary transition-transform duration-200 ${
                micPressed ? 'scale-95 bg-primary/80' : ''
              }`}
            >
              <Mic className="h-4 w-4" />
            </DesktopButton>
            
            <DesktopButton
              variant="ghost"
              size="sm"
              className={`h-6 w-6 hover:bg-primary/10 text-primary transition-transform duration-200 ${
                videoPressed ? 'scale-95 bg-primary/80' : ''
              }`}
            >
              <Video className="h-4 w-4" />
            </DesktopButton>
          </div>
        </div>

        <div className="relative">
          <DesktopTextarea
            className={`border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft min-h-[400px] ${
              isEmpty ? "border-destructive/20 bg-destructive/5" : "border-[oklch(0.90_0.04_195_/_0.5)]"
            }`}
            value={manualTextOverride ?? (showTyping ? displayText : taskDescription)}
            placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
            readOnly
          />


          {/* Bottom buttons */}
          <div className="flex flex-col gap-3 mt-4">
            <DesktopButton 
              variant="outline" 
              size="sm"
              className="font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full text-foreground"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Deep Research
            </DesktopButton>
            
            <DesktopButton 
              variant="outline"
              size="sm" 
              className="font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full text-foreground"
            >
              <Settings className="h-4 w-4" />
              Refine Task
            </DesktopButton>
          </div>
        </div>
      </div>
    </div>
  );
}
export default TaskDescriptionMock;

