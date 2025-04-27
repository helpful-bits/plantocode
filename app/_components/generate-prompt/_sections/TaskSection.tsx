"use client";

import React, { Suspense } from "react";
import { Wand2, Sparkles, Copy, FileCheck, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import VoiceTranscription from "../_components/voice-transcription";
import { P, Subtle } from "@/components/ui/typography";

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
                {isFindingFiles && !pastedPaths ? "Finding Files..." : "Find Relevant Files"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">Uses AI to analyze the task and suggest relevant files, populating the &apos;Paste File Paths&apos; area above.</p>
            </div>
          )}
          
          <div className="flex flex-col">
            <Button
              type="button"
              variant={taskCopySuccess ? "default" : "secondary"}
              size="sm"
              onClick={copyArchPrompt}
              disabled={isGeneratingGuidance || !taskDescription.trim() || !pastedPaths.trim()}
              title={!taskDescription.trim() ? "Enter a task description first" : 
                     !pastedPaths.trim() ? "Add file paths first" :
                     "Analyze selected files to generate architectural guidance"}
              className={taskCopySuccess ? "bg-green-500 hover:bg-green-600 text-white" : ""}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isGeneratingGuidance ? "Generating Guidance..." : taskCopySuccess ? "Copied to Clipboard!" : "Get Architectural Guidance"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Uses AI to analyze selected files and provide high-level implementation guidance or architectural insights.
            </p>
            <Subtle className="text-xs">
              This will be shared with AI, so don&apos;t include sensitive info. Be as specific as possible for better results.
            </Subtle>
          </div>

          <div className="flex flex-col">
            <Button
              type="button"
              variant={taskCopySuccess ? "default" : "outline"}
              size="sm"
              onClick={copyTemplatePrompt}
              disabled={isCopyingPrompt}
              title="Copy architectural guidance prompt template"
              className={taskCopySuccess ? "bg-green-500 hover:bg-green-600 text-white" : ""}
            >
              <Copy className="h-4 w-4 mr-2" />
              {isCopyingPrompt ? "Copying…" : taskCopySuccess ? "Copied to Clipboard!" : "Copy Plan Template"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Copies the structured plan template to the clipboard.
            </p>
          </div>

          {toggleSearchSelectedFilesOnly && (
            <div className="flex items-center space-x-2 border rounded-md px-3 py-1.5 bg-background">
              <div className="flex items-center gap-1.5">
                {searchSelectedFilesOnly ? (
                  <FileCheck className="h-4 w-4 text-primary" />
                ) : (
                  <Files className="h-4 w-4 text-muted-foreground" />
                )}
                <Label htmlFor="search-files-toggle" className="text-sm font-medium cursor-pointer">
                  {searchSelectedFilesOnly ? "Selected Files" : "All Files"}
                </Label>
              </div>
              <Switch
                id="search-files-toggle"
                checked={searchSelectedFilesOnly}
                onCheckedChange={toggleSearchSelectedFilesOnly}
                title={searchSelectedFilesOnly ? "Search in selected files only" : "Search in all files"}
              />
            </div>
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