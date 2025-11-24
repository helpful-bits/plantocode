"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { useTerminalSessions } from "@/contexts/terminal-sessions";
import TerminalView from "@/ui/TerminalView";
import { Mic, Eye, Minimize2, CheckCircle, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { Badge } from "@/ui/badge";
import { useVoiceTranscription } from "@/hooks/use-voice-recording";
import { gracefulExitTerminal } from "@/actions/terminal/terminal.actions";
import { invoke } from '@tauri-apps/api/core';
import { getBackgroundJobAction } from "@/actions/background-jobs/jobs.actions";
import { normalizeJobResponse } from "@/utils/response-utils";
import { replacePlaceholders } from "@/utils/placeholder-utils";
import type { CopyButtonConfig } from "@/types/config-types";

interface PlanTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planJobId: string;
  title?: string;
  projectDirectory?: string;
  copyButtons?: CopyButtonConfig[];
  onSessionKilled?: () => void;
  taskDescription?: string; // Current task description from the form
  onViewPlan?: (jobId: string) => void;
}


function truncateTitle(s?: string, max = 80) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}




export const PlanTerminalModal: React.FC<PlanTerminalModalProps> = ({
  open,
  onOpenChange,
  planJobId,
  title,
  projectDirectory,
  copyButtons,
  onSessionKilled,
  taskDescription,
  onViewPlan
}) => {
  const [isFinishing, setIsFinishing] = useState(false);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [showDictation, setShowDictation] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice transcription integration
  const {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
  } = useVoiceTranscription({
    onTranscribed: (text: string) => {
      setDictationText(prev => prev.trim() ? prev + " " + text : text);
    },
    disabled: !showDictation,
  });
  const { startSession, getSession, write, minimizeSession } = useTerminalSessions();
  const session = getSession(planJobId);

  // Stabilize function references to avoid effect re-runs
  const startSessionRef = useRef(startSession);
  const getSessionRef = useRef(getSession);
  useEffect(() => {
    startSessionRef.current = startSession;
    getSessionRef.current = getSession;
  });

  // Auto-start fresh session when reopening finished
  // Only triggers when modal opens or sessionId changes, not on status updates
  useEffect(() => {
    if (!open || !planJobId) return;

    const currentSession = getSessionRef.current(planJobId);
    if (!currentSession || currentSession.status !== 'running') {
      startSessionRef.current(planJobId, {
        workingDirectory: projectDirectory,
        jobId: planJobId,
        origin: "plan"
      });
    }
  }, [open, planJobId, projectDirectory]);

  const handleModalOpen = useCallback(async () => {
    if (!open) return;

    const session = getSession(planJobId);
    if (!session) {
      await startSession(planJobId, {
        workingDirectory: projectDirectory,
        jobId: planJobId,
        origin: "plan"
      });
    }

    // Load plan content
    if (planJobId) {
      setIsLoadingContent(true);
      try {
        const result = await getBackgroundJobAction(planJobId);
        if (result.isSuccess && result.data?.response) {
          const normalized = normalizeJobResponse(result.data.response);
          setPlanContent(normalized?.content ?? "");
        } else {
          setPlanContent("");
        }
      } catch {
        setPlanContent("");
      } finally {
        setIsLoadingContent(false);
      }
    }
  }, [open, planJobId, projectDirectory, startSession, getSession]);

  // Handle modal state changes directly
  React.useMemo(() => {
    if (open) {
      handleModalOpen();
    } else {
      setPlanContent(null);
    }
  }, [open, handleModalOpen]);

  const CHUNK = 4096;

  const chunkedSend = useCallback(async (jobId: string, data: string) => {
    for (let i = 0; i < data.length; i += CHUNK) {
      await write(jobId, data.slice(i, i + CHUNK));
    }
    await write(jobId, "\r");
  }, [write]);

  const handleCopyButtonClick = useCallback(async (cfg?: CopyButtonConfig) => {
    if (!planJobId || planContent == null) return;
    let textToSend = planContent;
    if (cfg?.content) {
      textToSend = replacePlaceholders(cfg.content, {
        IMPLEMENTATION_PLAN: planContent,
        TASK_DESCRIPTION: taskDescription ?? ""
      });
    }
    await chunkedSend(planJobId, textToSend);
  }, [planJobId, planContent, taskDescription, chunkedSend]);

  const handleViewPlan = useCallback(() => {
    if (onViewPlan) {
      onViewPlan(planJobId);
    } else {
      window.dispatchEvent(new CustomEvent('open-plan-content', { detail: { jobId: planJobId } }));
    }
  }, [planJobId, onViewPlan]);

  const handleMinimize = useCallback(() => {
    minimizeSession(planJobId);
    onOpenChange(false);
  }, [planJobId, minimizeSession, onOpenChange]);

  const handleFinish = useCallback(async () => {
    if (isFinishing) return;

    setIsFinishing(true);

    try {
      await gracefulExitTerminal(planJobId);

      try {
        await invoke("mark_implementation_plan_signed_off_command", {
          jobId: planJobId,
          state: "accepted"
        });
      } catch (e) {
        console.error('Failed to mark plan as signed off:', e);
      }

      onSessionKilled?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to finish terminal session:', error);
    } finally {
      setIsFinishing(false);
    }
  }, [planJobId, onSessionKilled, onOpenChange, isFinishing]);







  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl flex flex-col h-[90vh]"
        onEscapeKeyDown={(e) => e.preventDefault()}
>
        <DialogHeader className="flex-shrink-0">
          <DialogDescription className="sr-only">
            An interactive terminal session to execute the implementation plan. Works offline - some advanced features require server connection.
          </DialogDescription>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <DialogTitle>Claude Terminal — {truncateTitle(title ?? planJobId)}</DialogTitle>
              {session?.status && (
                <Badge variant={
                  session.status === 'running' ? 'success' :
                  session.status === 'failed' ? 'destructive' :
                  session.status === 'completed' ? 'secondary' : 'outline'
                }>
                  {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 ml-4">
              {/* Dictation toggle button */}
              <button
                className="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors"
                onClick={() => setShowDictation(!showDictation)}
                title={showDictation ? "Hide Dictation" : "Show Dictation"}
              >
                <Mic className="w-3 h-3 text-white" />
              </button>

              {/* View Plan button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewPlan}
                title="View Plan"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Plan
              </Button>

              {/* Minimize button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleMinimize}
                title="Minimize"
              >
                <Minimize2 className="h-4 w-4 mr-2" />
                Minimize
              </Button>

              {/* Finish button */}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleFinish}
                title="Finish Session"
                disabled={isFinishing}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Finish
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border mt-2">
            {(copyButtons?.length ? copyButtons : [{ id: "default", label: "Paste Plan + Enter" } as any]).map((btn: any) => (
              <Button
                key={btn.id}
                variant="outline"
                size="sm"
                onClick={() => handleCopyButtonClick(btn.content ? btn : undefined)}
                disabled={isLoadingContent || !planContent}
              >
                <Copy className="h-4 w-4 mr-2" />
                {btn.label ?? (isLoadingContent ? "Loading..." : "Paste Plan + Enter")}
              </Button>
            ))}
          </div>
        </DialogHeader>

        {showDictation && (
          <div className="flex-shrink-0 p-4 border-b border-border bg-background/95">
            <div className="space-y-2">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={dictationText}
                  onChange={(e) => setDictationText(e.target.value)}
                  placeholder="Dictate or type text here..."
                  className="min-h-[80px] resize-none pr-14 pt-8"
                />
                {(isRecording || isProcessing) && (
                  <div className="absolute left-3 top-3 flex items-center gap-2 bg-background/90 px-2 py-1 rounded-md">
                    <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
                    <span className="text-xs text-muted-foreground">
                      {isRecording ? 'Recording...' : 'Processing...'}
                    </span>
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  <Button
                    size="sm"
                    variant={isRecording ? "destructive" : "ghost"}
                    className={isRecording ? "animate-pulse" : ""}
                    onClick={async () => {
                      if (isRecording) {
                        await stopRecording();
                      } else {
                        await startRecording();
                      }
                    }}
                    disabled={isProcessing}
                    title={isRecording ? "Stop Recording" : "Start Recording"}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={async () => {
                    if (dictationText.trim()) {
                      await write(planJobId, dictationText + "\r");
                      setDictationText("");
                      setShowDictation(false);
                      // Focus handled by terminal provider
                    }
                  }}
                >
                  Send to Terminal
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDictationText("")}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 border rounded overflow-hidden">
          {open && <TerminalView sessionId={planJobId} isVisible={true} />}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};
