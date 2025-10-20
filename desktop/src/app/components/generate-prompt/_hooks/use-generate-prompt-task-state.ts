"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { listen } from '@tauri-apps/api/event';

import { type TaskDescriptionHandle } from "../_components/task-description";
import { useTaskDescriptionState } from "./use-task-description-state";
import {
  useSessionStateContext,
  useSessionActionsContext
} from "@/contexts/session";
import { useScreenRecording } from "@/contexts/screen-recording";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { cancelBackgroundJobAction } from "@/actions/background-jobs/jobs.actions";
import { useNotification } from "@/contexts/notification-context";
import type { VideoAnalysisJobResult } from "@/types/video-analysis-types";
import { getSessionAction } from "@/actions/session/crud.actions";

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
  
  // Get additional required contexts
  const screenRecording = useScreenRecording();
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
  
  // Video recording and analysis state
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
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
  
  // Handle video analysis recording start
  const startVideoAnalysisRecording = useCallback(async (args: { prompt: string; recordAudio: boolean; audioDeviceId: string; frameRate: number }) => {
    if (!sessionState.currentSession?.id) return;

    if (isAnalyzingVideo) {
      console.warn('Video analysis already in progress, ignoring duplicate request');
      return;
    }

    try {
      const freshResult = await getSessionAction(sessionState.currentSession.id);
      const fresh = freshResult?.isSuccess && freshResult.data ? freshResult.data : null;

      if (!fresh) {
        showNotification({
          title: "Recording Failed",
          message: "Session not found. Please try again.",
          type: "error",
        });
        return;
      }

      await screenRecording.startRecording({
        recordAudio: args.recordAudio,
        audioDeviceId: args.audioDeviceId,
        frameRate: args.frameRate
      }, {
        sessionId: fresh.id,
        projectDirectory: fresh.projectDirectory,
        prompt: args.prompt
      });

      setIsRecordingVideo(true);
      setIsAnalyzingVideo(false);
      analysisMetadataRef.current = true;
    } catch (error) {
      console.error('Failed to start video analysis recording:', error);

      showNotification({
        title: "Recording Failed",
        message: "Failed to start screen recording. Please try again.",
        type: "error",
      });
    }
  }, [sessionState.currentSession?.id, screenRecording, showNotification, isAnalyzingVideo]);
  
  // Listen for video-analysis-started event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      const unlistenFn = await listen<{ jobId: string }>('video-analysis-started', (event) => {
        setVideoAnalysisJobId(event.payload.jobId);
      });
      
      unlisten = unlistenFn;
    };
    
    setupListener();
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
  
  // Listen for recording-start-failed event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      const unlistenFn = await listen<{ message: string }>('recording-start-failed', (event) => {
        setIsRecordingVideo(false);
        setIsAnalyzingVideo(false);
        showNotification({
          title: "Recording Failed",
          message: event.payload.message || "Failed to start screen recording",
          type: "error",
        });
      });
      
      unlisten = unlistenFn;
    };
    
    setupListener();
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [showNotification]);
  
  // Listen for recording-finished event to transition from recording to analyzing
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      const unlistenFn = await listen('recording-finished', () => {
        setIsRecordingVideo(false);
        // Only set analyzing if we have analysis metadata (not just a plain recording)
        if (analysisMetadataRef.current) {
          setIsAnalyzingVideo(true);
        }
      });
      
      unlisten = unlistenFn;
    };
    
    setupListener();
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
  
  // Store analysis metadata ref for checking in recording-finished listener
  const analysisMetadataRef = useRef<boolean>(false);
  
  // Reset video state
  const resetVideoState = useCallback(() => {
    videoPathRef.current = null;
    setVideoAnalysisJobId(null);
    setIsRecordingVideo(false);
    setIsAnalyzingVideo(false);
    analysisMetadataRef.current = false;
    // Don't clear the prompt when resetting video state - keep it for future recordings
  }, []);
  
  // Cancel video analysis or recording
  const cancelVideoAnalysis = useCallback(async () => {
    // If currently recording, stop the recording
    if (screenRecording.isRecording) {
      screenRecording.stopRecording();
      resetVideoState();
      showNotification({
        title: "Recording Cancelled",
        message: "Screen recording was cancelled",
        type: "info",
      });
      return;
    }
    
    // If analysis job exists, cancel it
    if (videoAnalysisJobId) {
      try {
        await cancelBackgroundJobAction(videoAnalysisJobId);
        resetVideoState();
        showNotification({
          title: "Video Analysis Cancelled",
          message: "The video analysis was cancelled",
          type: "info",
        });
      } catch (error) {
        console.error('Failed to cancel video analysis:', error);
      }
    }
  }, [videoAnalysisJobId, screenRecording, resetVideoState, showNotification]);

  // Use background job hook for monitoring
  const { job: videoAnalysisJob } = useBackgroundJob(videoAnalysisJobId);
  
  // Monitor video analysis job status
  useEffect(() => {
    if (!videoAnalysisJob) return;
    
    if (videoAnalysisJob.status === 'completed' && videoAnalysisJob.response) {
      try {
        // Parse the response
        const response = JSON.parse(videoAnalysisJob.response) as VideoAnalysisJobResult;
        
        // Format and append to task description
        const formattedAnalysis = `\n\n<video_analysis_summary>\n${response.analysis}\n</video_analysis_summary>\n`;
        taskDescriptionRef.current?.appendText(formattedAnalysis);
        
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
    } else if (videoAnalysisJob.status === 'failed') {
      console.error('Video analysis failed:', videoAnalysisJob.errorMessage);
      
      // Reset video state
      resetVideoState();
      showNotification({
        title: "Video Analysis Failed",
        message: videoAnalysisJob.errorMessage || "An error occurred during analysis",
        type: "error",
      });
    }
  }, [videoAnalysisJob, taskDescriptionRef, resetVideoState, showNotification]);



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
      isRecordingVideo,
      isAnalyzingVideo,
      videoAnalysisJobId,
      videoAnalysisPrompt,
      setVideoAnalysisPrompt: updateVideoAnalysisPrompt,
      startVideoAnalysisRecording,
      resetVideoState,
      cancelVideoAnalysis,

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
      isRecordingVideo,
      isAnalyzingVideo,
      videoAnalysisJobId,
      videoAnalysisPrompt,
      updateVideoAnalysisPrompt, // memoized with useCallback
      startVideoAnalysisRecording, // memoized with useCallback
      resetVideoState, // memoized with useCallback
      cancelVideoAnalysis, // memoized with useCallback
      resetTaskState, // memoized with useCallback above
    ]
  );
}
