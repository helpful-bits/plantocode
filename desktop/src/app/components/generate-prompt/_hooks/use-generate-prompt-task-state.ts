"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { listen } from '@tauri-apps/api/event';

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useTaskDescriptionState } from "./use-task-description-state";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";
import { startVideoAnalysisJob } from "@/actions/video-analysis/start-video-analysis.action";
import { useBackgroundJobs } from "@/contexts/background-jobs";
import { useNotification } from "@/contexts/notification-context";
import type { VideoAnalysisJobResult } from "@/types/video-analysis-types";

export interface UseGeneratePromptTaskStateProps {
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
}

/**
 * Hook that manages task-specific state for the generate prompt feature.
 * This includes task refinement functionality,
 * getting its taskDescription state from SessionContext.
 */
export function useGeneratePromptTaskState({
  taskDescriptionRef
}: UseGeneratePromptTaskStateProps) {
  // Get session context directly
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  // Get background jobs and notification context
  const { jobs } = useBackgroundJobs();
  const { showNotification } = useNotification();
  
  // Handle user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions.setSessionModified]);
  
  // Use local task description setter to avoid immediate session updates
  
  // Initialize task description state for UI-specific concerns
  const {
    isRefiningTask,
    isWebRefiningTask: isDoingWebSearch,
    handleRefineTask,
    handleWebRefineTask: handleWebSearch,
    cancelWebSearch,
    canUndo,
    canRedo,
    undo,
    redo,
    webSearchResults,
    applyWebSearchResults,
  } = useTaskDescriptionState({
    activeSessionId: sessionState.currentSession?.id || null,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });
  
  // Video analysis state
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoAnalysisJobId, setVideoAnalysisJobId] = useState<string | null>(null);
  // Initialize prompt from session or use default
  const [videoAnalysisPrompt, setVideoAnalysisPrompt] = useState<string>(
    sessionState.currentSession?.videoAnalysisPrompt || 
    'Please analyze this video and provide a detailed summary of what you observe, including key events, actions, and any notable details.'
  );
  
  // Store video path for reference (video files are preserved for user access)
  const videoPathRef = useRef<string | null>(null);
  
  // Update video analysis prompt when session changes
  useEffect(() => {
    if (sessionState.currentSession?.videoAnalysisPrompt !== undefined) {
      setVideoAnalysisPrompt(sessionState.currentSession.videoAnalysisPrompt);
    }
  }, [sessionState.currentSession?.videoAnalysisPrompt]);
  
  // Custom setter that also updates session
  const updateVideoAnalysisPrompt = useCallback((prompt: string) => {
    setVideoAnalysisPrompt(prompt);
    sessionActions.updateCurrentSessionFields({ videoAnalysisPrompt: prompt });
    sessionActions.setSessionModified(true);
  }, [sessionActions]);
  
  // Handle video analysis
  const handleAnalyzeVideo = useCallback(async (args: { path: string; durationMs: number }) => {
    if (!sessionState.currentSession) return;
    
    // Prevent duplicate analysis if one is already in progress
    if (isAnalyzingVideo) {
      console.warn('Video analysis already in progress, ignoring duplicate request');
      return;
    }
    
    // Store the video path for reference
    videoPathRef.current = args.path;
    setIsAnalyzingVideo(true);
    
    try {
      // Use default prompt if videoAnalysisPrompt is empty
      const promptToUse = videoAnalysisPrompt.trim() || 'Please analyze this video and provide a detailed summary of what you observe, including key events, actions, and any notable details.';
      
      const response = await startVideoAnalysisJob({
        sessionId: sessionState.currentSession.id,
        projectDirectory: sessionState.currentSession.projectDirectory,
        videoPath: args.path,
        prompt: promptToUse,
        durationMs: args.durationMs,
      });
      
      setVideoAnalysisJobId(response.jobId);
      // Keep isAnalyzingVideo as true - it will be reset when the job completes or in resetVideoState
      
      // Show notification that analysis has started
      showNotification({
        title: "Video Analysis Started",
        message: "Processing your video recording...",
        type: "info",
      });
    } catch (error) {
      console.error('Failed to start video analysis:', error);
      setIsAnalyzingVideo(false);
      videoPathRef.current = null; // Clear the ref on error
      
      // Show error notification
      showNotification({
        title: "Video Analysis Failed",
        message: "Failed to start video analysis. Please try again.",
        type: "error",
      });
    }
  }, [sessionState.currentSession, videoAnalysisPrompt, showNotification, isAnalyzingVideo]);
  
  // Listen for recording completion
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isActive = true;
    
    const setupListener = async () => {
      if (!isActive) return;
      
      const unlistenFn = await listen<{ path: string; durationMs: number }>('recording-finished', async (event) => {
        await handleAnalyzeVideo(event.payload);
      });
      
      if (isActive) {
        unlisten = unlistenFn;
      } else {
        // Component unmounted before listener was set up, clean up immediately
        unlistenFn();
      }
    };
    
    setupListener();
    
    return () => {
      isActive = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleAnalyzeVideo]);
  
  // Reset video state
  const resetVideoState = useCallback(() => {
    videoPathRef.current = null;
    setVideoAnalysisJobId(null);
    setIsAnalyzingVideo(false);
    // Don't clear the prompt when resetting video state - keep it for future recordings
  }, []);

  // Monitor video analysis job using jobs array
  useEffect(() => {
    if (!videoAnalysisJobId || !jobs || !videoPathRef.current) return;
    
    const job = jobs.find(j => j.id === videoAnalysisJobId);
    if (!job) return;
    
    const handleJobCompletion = async () => {
      if (job.status === 'completed' && job.response) {
        try {
          // Parse the response
          const response = JSON.parse(job.response) as VideoAnalysisJobResult;
          
          // Format and append to task description
          const formattedAnalysis = `\n\n<video_analysis_summary>\n${response.analysis}\n</video_analysis_summary>\n`;
          taskDescriptionRef.current?.appendText(formattedAnalysis);
          
          // Keep video file for user reference - do not delete
          
          // Reset state and show success notification
          resetVideoState();
          showNotification({
            title: "Video Analysis Complete",
            message: "The analysis has been added to your task description",
            type: "success",
          });
        } catch (error) {
          console.error('Failed to process video analysis result:', error);
          showNotification({
            title: "Video Analysis Error",
            message: "Failed to process the video analysis results",
            type: "error",
          });
        }
      } else if (job.status === 'failed') {
        // Handle failure
        console.error('Video analysis failed:', job.errorMessage);
        
        // Keep video file for user reference even on failure - do not delete
        
        // Reset video state
        resetVideoState();
        showNotification({
          title: "Video Analysis Failed",
          message: job.errorMessage || "An error occurred during analysis",
          type: "error",
        });
      }
    };

    handleJobCompletion();
  }, [jobs, videoAnalysisJobId, taskDescriptionRef, resetVideoState, showNotification]);



  // Create a reset function for task state
  const resetTaskState = useCallback(() => {
    // Reset task description in the session
    sessionActions.updateCurrentSessionFields({ taskDescription: "" });
    // Reset video state
    resetVideoState();
    // Task state reset completed
  }, [sessionActions.updateCurrentSessionFields, resetVideoState]);

  // Create a memoized value to prevent unnecessary renders
  return useMemo(
    () => ({
      // Task Description State (session state only)
      taskDescriptionRef,
      isRefiningTask,
      isDoingWebSearch,
      handleRefineTask,
      handleWebSearch,
      cancelWebSearch,
      canUndo,
      canRedo,
      undo,
      redo,
      webSearchResults,
      applyWebSearchResults,

      // Video Analysis State
      isAnalyzingVideo,
      videoAnalysisJobId,
      videoAnalysisPrompt,
      setVideoAnalysisPrompt: updateVideoAnalysisPrompt,
      handleAnalyzeVideo,
      resetVideoState,

      // Combined Actions
      resetTaskState,
    }),
    [
      // taskDescriptionRef is a ref - stable
      isRefiningTask,
      isDoingWebSearch,
      handleRefineTask, // memoized with useCallback
      handleWebSearch, // memoized with useCallback
      cancelWebSearch, // memoized with useCallback
      canUndo,
      canRedo,
      undo, // memoized with useCallback
      redo, // memoized with useCallback
      webSearchResults,
      applyWebSearchResults, // memoized with useCallback
      isAnalyzingVideo,
      videoAnalysisJobId,
      videoAnalysisPrompt,
      updateVideoAnalysisPrompt, // memoized with useCallback
      handleAnalyzeVideo, // memoized with useCallback
      resetVideoState, // memoized with useCallback
      resetTaskState, // memoized with useCallback above
    ]
  );
}
