// Step 3: Task Description Mock
'use client';

import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { Undo2, Redo2, Mic, Video, ChevronDown, Settings } from 'lucide-react';

interface TaskDescriptionMockProps {
  isInView: boolean;
  progress: number;
}

export function TaskDescriptionMock({ isInView: _isInView, progress }: TaskDescriptionMockProps) {
  const taskDescription = `We need to create an interactive demo for the "How It Works" section on mobile and tablet devices. This demo will showcase the critical components of our desktop application through a guided, scroll-based experience.

**Interactive Demo Requirements:**

The demo should guide users through the complete workflow via scroll-triggered animations:
- Forms automatically populate with sample data
- Buttons simulate clicks
- Captions appear dynamically
- Users experience a cohesive story demonstrating all application features

**Implementation Steps:**

1. **Audit Current State:** Review existing video-based "How It Works" section and identify replacement areas

2. **Identify Critical Components:** Determine essential desktop application elements to showcase

3. **Design Interactive Elements:** Create hardcoded, non-functional components that visually match desktop counterparts exactly
- No real data connections required
- Sample text and interactions only

**User Journey Flow:**

The interactive demo must guide users through this sequence:

1. Project folder selection
2. Session creation
3. Task description entry
4. Voice transcription`;

  // Progress-driven state calculation
  const isEmpty = progress < 0.1;
  const undoPressed = progress >= 0.4 && progress < 0.43;
  const redoPressed = progress >= 0.5 && progress < 0.53;
  const micPressed = progress >= 0.6 && progress < 0.63;
  const videoPressed = progress >= 0.7 && progress < 0.73;
  
  // Progress-driven typing for deterministic output
  const typedText = (() => {
    if (isEmpty) return "";
    const typingStart = 0.1;
    const typingEnd = 0.4;
    const localProgress = Math.max(0, (progress - typingStart) / (typingEnd - typingStart));
    const targetLength = Math.floor(localProgress * taskDescription.length);
    return taskDescription.slice(0, targetLength);
  })();


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
                size="sm"
                disabled={isEmpty}
                className={`h-6 w-6 transition-transform duration-200 ${
                  undoPressed ? 'scale-95 bg-primary/80' : ''
                }`}
              >
                <Undo2 className="h-3 w-3" />
              </DesktopButton>
              <DesktopButton
                variant="outline"
                size="sm"
                disabled={isEmpty}
                className={`h-6 w-6 transition-transform duration-200 ${
                  redoPressed ? 'scale-95 bg-primary/80' : ''
                }`}
              >
                <Redo2 className="h-3 w-3" />
              </DesktopButton>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap w-full sm:w-auto">
            <DesktopButton
              variant="ghost" 
              size="sm"
              className="h-6 flex-1 sm:flex-initial px-2 text-xs text-foreground"
            >
              English
              <ChevronDown className="h-3 w-3 ml-1" />
            </DesktopButton>
            
            <DesktopButton
              variant="ghost"
              size="sm" 
              className="h-6 flex-1 sm:flex-initial px-2 text-xs text-foreground"
            >
              <Settings className="h-3 w-3 mr-1" />
              Default
              <ChevronDown className="h-3 w-3 ml-1" />
            </DesktopButton>

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
              isEmpty ? "border-destructive/20 bg-destructive/5" : "border-border/60"
            }`}
            value={typedText}
            placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
            readOnly
          />

          {isEmpty && (
            <div className="text-xs text-destructive mt-1 pl-1">
              Please enter a task description to proceed
            </div>
          )}

          {/* Bottom buttons */}
          <div className="flex flex-col gap-3 mt-4">
            <DesktopButton 
              variant="outline" 
              size="sm"
              className="flex items-center justify-center gap-2 w-full text-foreground"
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
              className="flex items-center justify-center gap-2 w-full text-foreground"
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