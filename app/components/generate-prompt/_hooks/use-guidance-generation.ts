"use client";

import { useState, useCallback, useEffect } from "react";
import { useNotification } from "@/lib/contexts/notification-context";
import { generateGuidanceForPathsAction } from "@/actions/guidance-generation-actions";
import { useBackgroundJob } from "@/lib/contexts/background-jobs-context";

export interface UseGuidanceGenerationProps {
  projectDirectory: string | null;
  taskDescription: string;
  includedPaths: string[];
  activeSessionId: string | null;
  onInteraction: () => void;
  taskDescriptionRef: React.RefObject<HTMLTextAreaElement> | null;
  setTaskDescription: (value: string) => void;
}

export interface UseGuidanceGenerationReturn {
  isGeneratingGuidance: boolean;
  handleGenerateGuidance: (selectedPaths?: string[]) => Promise<void>;
}

export function useGuidanceGeneration({
  projectDirectory,
  taskDescription,
  includedPaths,
  activeSessionId,
  onInteraction,
  taskDescriptionRef,
  setTaskDescription
}: UseGuidanceGenerationProps): UseGuidanceGenerationReturn {
  const { showNotification } = useNotification();
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [guidanceJobId, setGuidanceJobId] = useState<string | null>(null);
  
  // Use the background job hook to monitor the status of the guidance job
  const guidanceJob = useBackgroundJob(guidanceJobId);
  
  // Effect to handle background job completion
  useEffect(() => {
    // Only proceed if we have a job and it has a status
    if (!guidanceJob?.job || !guidanceJob.job.status) {
      return;
    }
    
    const { job } = guidanceJob;
    
    // Handle completed job
    if (job.status === 'completed' && job.response) {
      console.log('[GuidanceGeneration] Background job completed, updating task description');
      
      // Append the guidance to the task description
      // Get current task description either from the textarea or from state
      const currentValue = taskDescriptionRef?.current?.value || taskDescription || '';
      
      // Always add two newlines between existing content and guidance
      const newValue = currentValue.trim() + 
        '\n\n' + 
        job.response;
      
      // Update the task description
      setTaskDescription(newValue);
      
      // Set cursor at the end of the text if textarea is available
      if (taskDescriptionRef?.current) {
        const textarea = taskDescriptionRef.current;
        setTimeout(() => {
          if (textarea && typeof textarea.focus === 'function') {
            textarea.focus();
            if (typeof textarea.setSelectionRange === 'function') {
              textarea.setSelectionRange(newValue.length, newValue.length);
            }
          }
        }, 0);
      }
      
      showNotification({
        title: "Guidance generated",
        message: "Guidance has been added to your task description.",
        type: "success"
      });

      // Trigger interaction to indicate state change
      onInteraction();
      
      // Reset the job ID and generation state
      setGuidanceJobId(null);
      setIsGeneratingGuidance(false);
    }
    // Handle failed job
    else if (job.status === 'failed' || job.status === 'canceled') {
      console.error('[GuidanceGeneration] Background job failed:', job.errorMessage || 'Unknown error');
      
      showNotification({
        title: "Error generating guidance",
        message: job.errorMessage || "Failed to generate guidance",
        type: "error"
      });
      
      // Reset the job ID and generation state
      setGuidanceJobId(null);
      setIsGeneratingGuidance(false);
    }
  }, [guidanceJob, taskDescription, taskDescriptionRef, setTaskDescription, onInteraction, showNotification]);

  const handleGenerateGuidance = useCallback(async (selectedPaths?: string[]) => {
    if (!projectDirectory) {
      showNotification({
        title: "Cannot generate guidance",
        message: "Please select a project directory first.",
        type: "warning"
      });
      return;
    }
    
    if (!taskDescription.trim()) {
      showNotification({
        title: "Cannot generate guidance",
        message: "Please provide a task description first.",
        type: "warning"
      });
      return;
    }
    
    // Use provided paths if available, otherwise use the includedPaths from props
    const pathsToUse = selectedPaths && selectedPaths.length > 0 ? selectedPaths : includedPaths;
    
    // Don't require file selection - AI can still provide guidance based on task description alone
    if (pathsToUse.length === 0) {
      showNotification({
        title: "Limited guidance",
        message: "No files are selected. Guidance will be based only on your task description.",
        type: "info"
      });
      // Continue with generation despite no files selected
    }
    
    console.log(`[GuidanceGeneration] Using ${pathsToUse.length} files for guidance generation`);
    
    if (isGeneratingGuidance) {
      showNotification({
        title: "Already generating guidance",
        message: "Please wait for the current generation to complete.",
        type: "warning"
      });
      return;
    }
    
    setIsGeneratingGuidance(true);
    
    try {
      showNotification({
        title: "Generating guidance",
        message: "This may take a moment...",
        type: "info"
      });
      
      // Create a wrapper function that handles the type mismatch
      const generateGuidance = async () => {
        if (!projectDirectory || !activeSessionId) {
          throw new Error("Project directory or active session not set");
        }
        
        // Call the function with the correct parameters
        // Use an empty array if no files are included, allowing the API to generate guidance based on task description only
        // Use the pathsToUse instead of the original includedPaths
        const filePaths = pathsToUse.length > 0 ? pathsToUse : [];
        console.log(`[GuidanceGeneration] Calling API with ${filePaths.length} paths`);
        
        const result = await generateGuidanceForPathsAction(
          taskDescription,
          filePaths,
          activeSessionId,
          { modelOverride: undefined }  // Optional parameter
        );
        return result;
      };
      
      const result = await generateGuidance();
      
      if (result.isSuccess) {
        // Check if this is a background job
        if (result.metadata?.isBackgroundJob && result.metadata?.jobId) {
          console.log(`[GuidanceGeneration] Background job started with ID: ${result.metadata.jobId}`);
          
          // Store the job ID to track completion
          setGuidanceJobId(result.metadata.jobId);
          
          showNotification({
            title: "Guidance generation started",
            message: "Guidance will be added to your task description when ready.",
            type: "info"
          });
          
          // Don't reset isGeneratingGuidance here - it will be reset when the job completes
        }
        // Handle immediate response
        else if (result.data?.guidance) {
          console.log('[GuidanceGeneration] Received immediate guidance');
          
          // Append the guidance to the task description
          // Get current task description either from the textarea or from state
          const currentValue = taskDescriptionRef?.current?.value || taskDescription || '';
            
          // Always add two newlines between existing content and guidance
          const newValue = currentValue.trim() + 
            '\n\n' + 
            result.data.guidance;
          
          // Update the task description
          setTaskDescription(newValue);
          
          // Set cursor at the end of the text if textarea is available
          if (taskDescriptionRef?.current) {
            const textarea = taskDescriptionRef.current;
            setTimeout(() => {
              if (textarea && typeof textarea.focus === 'function') {
                textarea.focus();
                if (typeof textarea.setSelectionRange === 'function') {
                  textarea.setSelectionRange(newValue.length, newValue.length);
                }
              }
            }, 0);
          }
          
          showNotification({
            title: "Guidance generated",
            message: "Guidance has been added to your task description.",
            type: "success"
          });

          // Trigger interaction to indicate state change
          onInteraction();
          
          // Reset generation state
          setIsGeneratingGuidance(false);
        } else {
          throw new Error("No guidance was generated and no background job was created.");
        }
      } else {
        throw new Error(result.message || "Failed to generate guidance.");
      }
    } catch (error) {
      console.error("[useGuidanceGeneration] Error generating guidance:", error);
      
      showNotification({
        title: "Error generating guidance",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
      
      // Reset generation state on error
      setIsGeneratingGuidance(false);
    }
  }, [
    projectDirectory, 
    taskDescription, 
    includedPaths, 
    isGeneratingGuidance,
    activeSessionId, 
    taskDescriptionRef,
    setTaskDescription,
    onInteraction,
    showNotification
    // Note: selectedPaths is intentionally not listed as a dependency because 
    // it's provided as a parameter to the function, not from the hook's props
  ]);

  return {
    isGeneratingGuidance,
    handleGenerateGuidance
  };
}