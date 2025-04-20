"use client";

import React, { Suspense } from "react";
import { Wand2, Sparkles, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import VoiceTranscription from "../_components/voice-transcription";

const TaskDescriptionArea = React.lazy(() => import("../_components/task-description"));

interface TaskSectionProps {
  state: {
    taskDescription: string;
    isFindingFiles: boolean;
    isGeneratingGuidance: boolean;
    taskCopySuccess: boolean;
    isCopyingPrompt: boolean;
    projectDirectory: string;
    pastedPaths: string;
    taskDescriptionRef: React.RefObject<any>;
    searchSelectedFilesOnly: boolean;
  };
  actions: {
    handleTaskChange: (value: string) => void;
    handleTranscribedText: (text: string) => void;
    handleInteraction: () => void;
    handleFindRelevantFiles?: () => void;
    copyArchPrompt: () => void;
    copyTemplatePrompt: () => void;
    toggleSearchSelectedFilesOnly: () => void;
  };
}

export default function TaskSection({ state, actions }: TaskSectionProps) {
  const {
    taskDescription,
    isFindingFiles,
    isGeneratingGuidance,
    taskCopySuccess,
    isCopyingPrompt,
    projectDirectory,
    pastedPaths,
    taskDescriptionRef,
    searchSelectedFilesOnly
  } = state;

  const {
    handleTaskChange,
    handleTranscribedText,
    handleInteraction,
    handleFindRelevantFiles,
    copyArchPrompt,
    copyTemplatePrompt,
    toggleSearchSelectedFilesOnly
  } = actions;

  return (
    <div className="flex flex-col w-full gap-4">
      <Suspense fallback={<div>Loading task description editor...</div>}>
        <TaskDescriptionArea
          ref={taskDescriptionRef}
          value={taskDescription}
          onChange={handleTaskChange}
          onInteraction={handleInteraction}
        />
      </Suspense>
      
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {handleFindRelevantFiles && (
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
              {isFindingFiles && !pastedPaths ? "Finding Files..." : "Find Relevant Files"}
            </Button>
          )}
          
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

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyTemplatePrompt}
            disabled={isCopyingPrompt}
            title="Copy architectural guidance prompt template"
          >
            <Copy className="h-4 w-4 mr-2" />
            {isCopyingPrompt ? "Copying…" : taskCopySuccess ? "Copied!" : "Copy Prompt"}
          </Button>

          {toggleSearchSelectedFilesOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleSearchSelectedFilesOnly}
              className={`flex gap-1.5 items-center whitespace-nowrap ${searchSelectedFilesOnly ? "bg-accent" : ""}`}
              title={searchSelectedFilesOnly ? "Search in all files" : "Search only in selected files"}
            >
              {searchSelectedFilesOnly ? "Selected Files Only" : "All Files"}
            </Button>
          )}
        </div>
        
        <VoiceTranscription
          onTranscribed={handleTranscribedText}
          onInteraction={handleInteraction}
        />
      </div>
    </div>
  );
} 