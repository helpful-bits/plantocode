"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";

import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import { useProject } from "@/contexts/project-context";
import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { useNotification } from "@/contexts/notification-context";
import { createLogger } from "@/utils/logger";
import { deleteBackgroundJobAction } from "@/actions/background-jobs/jobs.actions";
import { createMergedImplementationPlanAction } from "@/actions/ai/implementation-plan.actions";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { invoke } from "@tauri-apps/api/core";
import { queueMergeInstructionsUpdate, createDebouncer } from "@/actions/session/task-fields.actions";

const logger = createLogger({ namespace: "ImplPlansLogic" });

const PROMPT_SENT_KEY_PREFIX = "terminal_prompt_sent:";

// Helper to clear persisted flag
async function clearPromptSent(jobId: string) {
  try {
    await invoke("set_key_value_command", { key: PROMPT_SENT_KEY_PREFIX + jobId, value: "" });
  } catch (error) {
    // Silently ignore errors when clearing prompt sent flag
    console.debug("Failed to clear prompt sent flag:", error);
  }
}

interface UseImplementationPlansLogicProps {
  sessionId: string | null;
}

export function useImplementationPlansLogic({
  sessionId,
}: UseImplementationPlansLogicProps) {
  const { jobs, isLoading, refreshJobs } = useBackgroundJobs();
  const { projectDirectory } = useProject();
  const { showNotification } = useNotification();
  const { getSession, kill, deleteLog } = useTerminalSessions();
  const sessionState = useSessionStateContext();
  const { updateCurrentSessionFields, flushSaves } = useSessionActionsContext();

  const [copiedPlanId, setCopiedPlanId] = useState<string | undefined>(undefined);
  const [jobForModal, setJobForModal] = useState<BackgroundJob | undefined>(undefined);
  const [jobToDelete, setJobToDelete] = useState<BackgroundJob | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  const mergeInstructions = sessionState.currentSession?.mergeInstructions || "";

  const lastSubmittedMergeInstructionsRef = useRef<string | null>(null);
  const debouncedQueueUpdateRef = useRef<((sessionId: string, content: string) => void) | null>(null);

  useEffect(() => {
    if (!debouncedQueueUpdateRef.current) {
      debouncedQueueUpdateRef.current = createDebouncer(queueMergeInstructionsUpdate, 250);
    }
    return () => {
      debouncedQueueUpdateRef.current = null;
    };
  }, []);

  const handleMergeInstructionsChange = useCallback((content: string) => {
    if (!sessionId) return;

    // Immediate local echo for responsive UI
    updateCurrentSessionFields({ mergeInstructions: content });

    // Only queue backend update if content has changed
    if (content !== lastSubmittedMergeInstructionsRef.current && debouncedQueueUpdateRef.current) {
      lastSubmittedMergeInstructionsRef.current = content;
      debouncedQueueUpdateRef.current(sessionId, content);
    }
  }, [sessionId, updateCurrentSessionFields]);

  // Filter implementation plans for the current project and optionally session
  const implementationPlans = useMemo(() => {
    if (!jobs) return [];

    return jobs
      .filter((job: BackgroundJob) => {
        if (job.taskType !== "implementation_plan" && job.taskType !== "implementation_plan_merge") return false;


        if (sessionId && job.sessionId !== sessionId) {
          return false;
        }

        return true;
      })
      .sort((a: BackgroundJob, b: BackgroundJob) => {
        const aIsActive = JOB_STATUSES.ACTIVE.includes(a.status);
        const bIsActive = JOB_STATUSES.ACTIVE.includes(b.status);

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [jobs, projectDirectory, sessionId]);

  const handleCopyToClipboard = useCallback(
    async (text: string, jobId: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedPlanId(jobId);

        showNotification({
          title: "Copied!",
          message: "Implementation plan copied to clipboard.",
          type: "success",
        });

        // Reset copied state after 2 seconds
        setTimeout(() => {
          setCopiedPlanId(undefined);
        }, 2000);
      } catch (error) {
        logger.error("Failed to copy text: ", error);
        showNotification({
          title: "Copy Failed",
          message: "Could not copy to clipboard.",
          type: "error",
        });
      }
    },
    []
  );

  // Toggle plan selection
  const handleTogglePlanSelection = useCallback((jobId: string) => {
    setSelectedPlanIds(prev => {
      if (prev.includes(jobId)) {
        return prev.filter(id => id !== jobId);
      } else {
        return [...prev, jobId];
      }
    });
  }, []);
  
  const handleMergePlans = useCallback(async () => {
    if (!sessionId || selectedPlanIds.length < 2) {
      showNotification({
        title: "Cannot merge plans",
        message: "Please select at least 2 plans to merge",
        type: "error",
      });
      return;
    }

    setIsMerging(true);

    try {
      // CRITICAL: Flush any pending session changes to backend BEFORE creating the merge job
      // This ensures the job will see the latest merge instructions and session state
      await flushSaves();

      const result = await createMergedImplementationPlanAction(
        sessionId,
        selectedPlanIds,
        mergeInstructions || undefined
      );

      if (result.isSuccess) {
        showNotification({
          title: "Merge started",
          message: "Your implementation plans are being merged",
          type: "success",
        });

        setSelectedPlanIds([]);

        // Clear merge instructions immediately (both local and backend)
        updateCurrentSessionFields({ mergeInstructions: "" });
        lastSubmittedMergeInstructionsRef.current = "";

        // Cancel any pending debounced work
        if (debouncedQueueUpdateRef.current) {
          debouncedQueueUpdateRef.current = createDebouncer(queueMergeInstructionsUpdate, 250);
        }

        await refreshJobs();
      } else {
        showNotification({
          title: "Merge failed",
          message: result.message || "Failed to merge implementation plans",
          type: "error",
        });
      }
    } catch (error) {
      showNotification({
        title: "Merge failed",
        message: "An unexpected error occurred",
        type: "error",
      });
    } finally {
      setIsMerging(false);
    }
  }, [sessionId, selectedPlanIds, mergeInstructions, showNotification, refreshJobs, flushSaves]);

  // Delete implementation plan job
  const handleDeletePlan = useCallback(
    async () => {
      if (!jobToDelete) return;

      setIsDeleting((prev) => ({ ...prev, [jobToDelete.id]: true }));

      try {
        const result = await deleteBackgroundJobAction(jobToDelete.id);
        if (result.isSuccess) {
          // Clean up terminal session if running or requires attention
          const session = getSession(jobToDelete.id);
          if (session && (session.status === "running" || session.status === "agent_requires_attention")) {
            try {
              await kill(jobToDelete.id);
            } catch (error) {
              logger.warn("Failed to kill terminal session during deletion:", error);
            }
          }
          
          // Delete terminal log
          try {
            await deleteLog(jobToDelete.id);
          } catch (error) {
            logger.warn("Failed to delete terminal log during deletion:", error);
          }
          
          // Clear persisted prompt sent flag
          try {
            await clearPromptSent(jobToDelete.id);
          } catch (error) {
            logger.warn("Failed to clear prompt sent flag during deletion:", error);
          }
          
          showNotification({
            title: "Plan deleted",
            message: "The implementation plan has been deleted",
            type: "success",
          });
          setJobToDelete(undefined);
          await refreshJobs();
        } else {
          showNotification({
            title: "Failed to delete plan",
            message: result.message || "An error occurred",
            type: "error",
          });
        }
      } catch (error) {
        logger.error("Error deleting job:", error);
        showNotification({
          title: "Error",
          message: "Failed to delete implementation plan.",
          type: "error",
        });
      } finally {
        setIsDeleting((prev) => ({ ...prev, [jobToDelete.id]: false }));
      }
    },
    [jobToDelete, showNotification, refreshJobs, getSession, kill, deleteLog]
  );


  // Handle plan details modal
  const handleViewPlanDetails = useCallback((plan: BackgroundJob) => {
    setJobForModal(plan);
  }, []);

  // Handle plan details modal close
  const handleClosePlanDetails = useCallback(() => {
    setJobForModal(undefined);
  }, []);

  return {
    implementationPlans,
    isLoading,
    copiedPlanId,
    jobForModal,
    jobToDelete,
    isDeleting,
    selectedPlanIds,
    mergeInstructions,
    isMerging,

    // Actions
    handleCopyToClipboard,
    handleDeletePlan,
    handleViewPlanDetails,
    handleClosePlanDetails,
    setJobToDelete,
    refreshJobs,
    handleTogglePlanSelection,
    handleMergeInstructionsChange,
    handleMergePlans,
  };
}

export default useImplementationPlansLogic;