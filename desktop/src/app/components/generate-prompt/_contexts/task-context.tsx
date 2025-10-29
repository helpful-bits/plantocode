import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { listen } from '@tauri-apps/api/event';

import {
  type TaskContextValue,
  type TaskContextState as _TaskContextState,
  type TaskContextActions as _TaskContextActions,
} from "./_types/task-description-types";
import { logError } from "@/utils/error-handling";
import { type TaskDescriptionHandle } from "../_components/task-description";
import { useTaskDescriptionState } from "../_hooks/use-task-description-state";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { useScreenRecording } from "@/contexts/screen-recording";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { cancelBackgroundJobAction } from "@/actions/background-jobs/jobs.actions";
import { useNotification } from "@/contexts/notification-context";
import type { VideoAnalysisJobResult } from "@/types/video-analysis-types";

// Create the context with a default value
const defaultValue: TaskContextValue = {
  state: {
    taskDescriptionRef: { current: null }, // Provide a stable, null-initialized ref object
    tokenEstimate: null,
    isRefiningTask: false,
    isDoingWebSearch: false,
    canUndo: false,
    canRedo: false,
    webSearchResults: null,
    historyLoadStatus: 'idle',
    historyReady: false,
    // Video analysis state defaults
    isAnalyzingVideo: false,
    videoAnalysisJobId: null,
    videoAnalysisPrompt: '',
  },
  actions: {
    // These default implementations will be replaced by actual implementations
    handleRefineTask: async () => Promise.resolve(),
    handleWebSearch: async () => Promise.resolve(),
    cancelWebSearch: async () => Promise.resolve(),
    flushPendingTaskChanges: () => null,
    recordTaskChange: () => {},
    reset: () => {},
    undo: () => {},
    redo: () => {},
    applyWebSearchResults: () => {},
    // Video analysis actions
    setVideoAnalysisPrompt: () => {},
    startVideoAnalysisRecording: async () => Promise.resolve(),
    resetVideoState: () => {},
    cancelVideoAnalysis: async () => {},
  },
};

// Create the context
export const TaskContext = createContext<TaskContextValue>(defaultValue);

// Custom hook to use the context
export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    const error = new Error("useTaskContext must be used within a TaskContextProvider");
    logError(error, "Task Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
};

/**
 * Internal hook that provides the complete task context implementation
 */
function useProvideTaskContext(taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>): TaskContextValue {
  // Get session context directly
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  // Get additional required contexts
  const screenRecording = useScreenRecording();
  const { isRecording, cancelRecording } = screenRecording;
  const { showNotification } = useNotification();
  
  // Handle user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions.setSessionModified]);
  
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
    recordTaskChange,
    webSearchResults,
    applyWebSearchResults,
    showMergePulse,
    historyLoadStatus,
    historyReady,
  } = useTaskDescriptionState({
    activeSessionId: sessionState.currentSession?.id || null,
    taskDescriptionRef,
    onInteraction: handleInteraction,
  });
  
  // Video recording and analysis state
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoAnalysisJobId, setVideoAnalysisJobId] = useState<string | null>(null);
  // Initialize prompt from session or use default
  const [videoAnalysisPrompt, setVideoAnalysisPrompt] = useState<string>(
    sessionState.currentSession?.videoAnalysisPrompt ?? 
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
    void sessionActions.flushSaves();
  }, [sessionActions]);
  
  // Handle video analysis recording start
  const startVideoAnalysisRecording = useCallback(async (args: { prompt: string; recordAudio: boolean; audioDeviceId: string; frameRate: number }) => {
    if (!sessionState.currentSession) return;
    
    // Prevent duplicate analysis if one is already in progress
    if (isAnalyzingVideo) {
      console.warn('Video analysis already in progress, ignoring duplicate request');
      return;
    }
    
    try {
      const sessionId = sessionState.currentSession.id;
      const projectDirectory = sessionState.currentSession.projectDirectory;
      
      // Call screenRecording.startRecording with analysis metadata
      await screenRecording.startRecording({
        recordAudio: args.recordAudio,
        audioDeviceId: args.audioDeviceId,
        frameRate: args.frameRate
      }, {
        sessionId,
        projectDirectory,
        prompt: args.prompt
      });
      
      setIsAnalyzingVideo(false); // Not analyzing yet, just recording
    } catch (error) {
      console.error('Failed to start video analysis recording:', error);
      
      // Show error notification
      showNotification({
        title: "Recording Failed",
        message: "Failed to start screen recording. Please try again.",
        type: "error",
      });
    }
  }, [sessionState.currentSession, screenRecording, showNotification, isAnalyzingVideo]);
  
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
  
  // Reset video state
  const resetVideoState = useCallback(() => {
    videoPathRef.current = null;
    setVideoAnalysisJobId(null);
    setIsAnalyzingVideo(false);
    // Don't clear the prompt when resetting video state - keep it for future recordings
  }, []);
  
  // Listen for recording-cancelled event
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      const unlistenFn = await listen('recording-cancelled', () => {
        resetVideoState();
      });
      
      unlisten = unlistenFn;
    };
    
    setupListener();
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [resetVideoState]);
  
  // Cancel video analysis or recording
  const cancelVideoAnalysis = useCallback(async () => {
    // If currently recording, cancel the recording
    if (isRecording) {
      cancelRecording();
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
  }, [videoAnalysisJobId, isRecording, screenRecording, resetVideoState, showNotification]);

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

        // Get the final value after appending and record in history + update session
        const finalValue = taskDescriptionRef.current?.getValue() || '';
        if (finalValue) {
          recordTaskChange('improvement', finalValue);
          sessionActions.updateCurrentSessionFields({ taskDescription: finalValue });
        }

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

  const flushPendingTaskChanges = useCallback(() => {
    return null;
  }, []);

  // Create a memoized value to prevent unnecessary renders
  return useMemo(
    () => ({
      state: {
        taskDescriptionRef,
        tokenEstimate: null, // This will be provided by the parent component
        isRefiningTask,
        isDoingWebSearch,
        canUndo,
        canRedo,
        webSearchResults,
        showMergePulse,
        historyLoadStatus,
        historyReady,
        // Video analysis state
        isAnalyzingVideo,
        videoAnalysisJobId,
        videoAnalysisPrompt,
      },
      actions: {
        // Task description actions
        handleRefineTask,
        handleWebSearch,
        cancelWebSearch,
        flushPendingTaskChanges,
        recordTaskChange,
        reset: resetTaskState,
        undo,
        redo,
        applyWebSearchResults,
        // Video analysis actions
        setVideoAnalysisPrompt: updateVideoAnalysisPrompt,
        startVideoAnalysisRecording,
        resetVideoState,
        cancelVideoAnalysis,
      },
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
      recordTaskChange,
      showMergePulse,
      historyLoadStatus,
      historyReady,
      isAnalyzingVideo,
      videoAnalysisJobId,
      videoAnalysisPrompt,
      updateVideoAnalysisPrompt, // memoized with useCallback
      startVideoAnalysisRecording, // memoized with useCallback
      resetVideoState, // memoized with useCallback
      cancelVideoAnalysis, // memoized with useCallback
      resetTaskState, // memoized with useCallback above
      flushPendingTaskChanges, // memoized with useCallback
    ]
  );
}

// Provider component
interface TaskContextProviderProps {
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle | null>;
  tokenEstimate?: { totalTokens: number; systemPromptTokens: number; userPromptTokens: number } | null;
  children: ReactNode;
}

export const TaskContextProvider = ({
  taskDescriptionRef,
  tokenEstimate,
  children,
}: TaskContextProviderProps) => {
  const contextValue = useProvideTaskContext(taskDescriptionRef);
  
  // Override tokenEstimate in the state if provided
  const finalContextValue = useMemo(() => ({
    ...contextValue,
    state: {
      ...contextValue.state,
      tokenEstimate: tokenEstimate ?? contextValue.state.tokenEstimate,
    },
  }), [contextValue, tokenEstimate]);
  
  return <TaskContext.Provider value={finalContextValue}>{children}</TaskContext.Provider>;
};

TaskContextProvider.displayName = "TaskContextProvider";
