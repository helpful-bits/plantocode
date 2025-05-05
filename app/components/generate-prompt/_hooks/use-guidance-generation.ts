"use client";

import { useState, useCallback } from "react";
import { useNotification } from "@/lib/contexts/notification-context";
import { generateGuidanceForPathsAction } from "@/actions/guidance-generation-actions";

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
  handleGenerateGuidance: () => Promise<void>;
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

  const handleGenerateGuidance = useCallback(async () => {
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
    
    if (includedPaths.length === 0) {
      showNotification({
        title: "Cannot generate guidance",
        message: "Please select at least one file to generate guidance for.",
        type: "warning"
      });
      return;
    }
    
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
        const result = await generateGuidanceForPathsAction(
          taskDescription,
          includedPaths,
          activeSessionId,
          { modelOverride: undefined }  // Optional parameter
        );
        return result;
      };
      
      const result = await generateGuidance();
      
      if (result.isSuccess && result.data) {
        // Append the guidance to the task description
        if (taskDescriptionRef?.current) {
          const textarea = taskDescriptionRef.current;
          const currentValue = textarea.value;
          
          // Add a newline if needed, then append the guidance
          const newValue = currentValue + 
            (currentValue && !currentValue.endsWith('\n') ? '\n\n' : '') + 
            result.data.guidance;
          
          // Update the task description
          setTaskDescription(newValue);
          
          // Set cursor at the end of the text
          setTimeout(() => {
            if (textarea) {
              textarea.focus();
              textarea.setSelectionRange(newValue.length, newValue.length);
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
    } finally {
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
  ]);

  return {
    isGeneratingGuidance,
    handleGenerateGuidance
  };
}