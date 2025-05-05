"use client";

import React, { Suspense } from "react";
import { Wand2, Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import VoiceTranscription from "../_components/voice-transcription";
import { P, Subtle } from "@/components/ui/typography";

const TaskDescriptionArea = React.lazy(() => import("../_components/task-description"));

interface TaskSectionProps {
  state: {
    taskDescription: string;
    isFindingFiles: boolean;
    isGeneratingGuidance: boolean;
    projectDirectory: string;
    pastedPaths: string;
    taskDescriptionRef: React.RefObject<any>;
    isImprovingText?: boolean;
    textImprovementJobId?: string | null;
  };
  actions: {
    handleTaskChange: (value: string) => void;
    handleTranscribedText: (text: string) => void;
    handleInteraction: () => void;
    handleFindRelevantFiles?: () => void;
    copyArchPrompt: () => void;
    handleImproveSelection?: (selectedText: string) => Promise<void>;
  };
}

const TaskSection = React.memo(function TaskSection({ state, actions }: TaskSectionProps) {
  
  const {
    taskDescription,
    isFindingFiles,
    isGeneratingGuidance,
    projectDirectory,
    pastedPaths,
    taskDescriptionRef,
    isImprovingText,
    textImprovementJobId
  } = state;

  const {
    handleTaskChange,
    handleTranscribedText,
    handleInteraction,
    handleFindRelevantFiles,
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
          isImproving={isImprovingText}
          textImprovementJobId={textImprovementJobId}
          onImproveSelection={handleImproveSelection}
        />
      </Suspense>
      
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-2">
          {handleFindRelevantFiles && (
            <div className="flex flex-col">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleFindRelevantFiles}
                disabled={isFindingFiles || !taskDescription.trim() || !projectDirectory}
                title={!taskDescription.trim() ? "Enter a task description first" : 
                       !projectDirectory ? "Select a project directory first" :
                       "Find relevant files in the codebase based on task description"}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                {isFindingFiles ? "Finding Files..." : pastedPaths.trim() ? "Find More Files" : "Find Relevant Files"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">Uses AI to analyze the task and suggest relevant files, populating the &apos;Paste File Paths&apos; area above.</p>
            </div>
          )}
          
          <div className="flex flex-col">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copyArchPrompt}
              disabled={isGeneratingGuidance || !taskDescription.trim() || !pastedPaths.trim()}
              title={!taskDescription.trim() ? "Enter a task description first" : 
                     !pastedPaths.trim() ? "Add file paths first" :
                     "Analyze selected files to generate architectural guidance"}
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