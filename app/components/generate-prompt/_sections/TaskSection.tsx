"use client";

import React, { Suspense } from "react";
import { Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import VoiceTranscription from "../_components/voice-transcription";
import { P, Subtle } from "@/components/ui/typography";
import { useFileManagement } from "../_contexts/file-management-context";

const TaskDescriptionArea = React.lazy(() => import("../_components/task-description"));

interface TaskSectionProps {
  state: {
    taskDescription: string;
    isGeneratingGuidance: boolean;
    projectDirectory: string;
    taskDescriptionRef: React.RefObject<any>;
    isImprovingText?: boolean;
    textImprovementJobId?: string | null;
  };
  actions: {
    handleTaskChange: (value: string) => void;
    handleTranscribedText: (text: string) => void;
    handleInteraction: () => void;
    copyArchPrompt: (selectedPaths: string[]) => void;
    handleImproveSelection: (selectedText: string, selectionStart?: number, selectionEnd?: number) => Promise<void>;
  };
}

const TaskSection = React.memo(function TaskSection({ state, actions }: TaskSectionProps) {
  // Get pastedPaths from the FileManagement context
  const fileState = useFileManagement();
  
  const {
    taskDescription,
    isGeneratingGuidance,
    projectDirectory,
    taskDescriptionRef,
    isImprovingText,
    textImprovementJobId
  } = state;

  // Get file paths from FileManagement context
  const { pastedPaths, includedPaths } = fileState;

  const {
    handleTaskChange,
    handleTranscribedText,
    handleInteraction,
    copyArchPrompt,
    handleImproveSelection
  } = actions;

  return (
    <div className="flex flex-col w-full gap-4">
      <Suspense fallback={<div>Loading task description editor...</div>}>
        <TaskDescriptionArea
          ref={taskDescriptionRef}
          value={taskDescription}
          onChange={handleTaskChange}
          onInteraction={handleInteraction}
          isImproving={isImprovingText || false}
          onImproveSelection={handleImproveSelection}
        />
      </Suspense>
      
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-2">
          <div className="flex flex-col">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => copyArchPrompt(includedPaths)}
              disabled={isGeneratingGuidance || !taskDescription.trim()}
              title={!taskDescription.trim() ? "Enter a task description first" : 
                     isGeneratingGuidance ? "Generating guidance..." :
                     includedPaths.length === 0 ? "No files selected - guidance may be limited" :
                     `Analyze ${includedPaths.length} selected files to generate architectural guidance`}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isGeneratingGuidance ? "Generating Guidance..." : "Get Architectural Guidance"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Uses AI to analyze selected files and provide high-level implementation guidance or architectural insights.
            </p>
            <Subtle className="text-xs">
              This will be shared with AI, so don&apos;t include sensitive info. Be as specific as possible for better results.
            </Subtle>
          </div>

        </div>
        
        <div className="ml-4">
          <VoiceTranscription
            onTranscribed={handleTranscribedText}
            onInteraction={handleInteraction}
            textareaRef={taskDescriptionRef}
          />
        </div>
      </div>
    </div>
  );
});

export default TaskSection;