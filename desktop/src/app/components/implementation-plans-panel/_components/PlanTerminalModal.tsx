"use client";

import React, { useEffect, useRef, useCallback, ErrorInfo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { BufferedTerminalView } from "@/ui/BufferedTerminalView";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";
import { useTerminalHealth } from "@/contexts/terminal-sessions/useTerminalHealth";
import { X, AlertCircle, Mic, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { useVoiceTranscription } from "@/hooks/use-voice-recording";
import { Copy } from "lucide-react";
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
}

// Error boundary component for terminal modal
class TerminalErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error, errorInfo: ErrorInfo) => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Terminal modal error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 p-4 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h3 className="text-lg font-semibold text-red-700 mb-2">Terminal Error</h3>
          <p className="text-sm text-red-600 text-center mb-4">
            {this.state.error?.message || 'An unexpected error occurred in the terminal'}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              window.location.reload();
            }}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload Terminal
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
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
  onSessionKilled
}) => {
  const terminalRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const sessionStartedRef = useRef<boolean>(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isTerminalFocused, setIsTerminalFocused] = useState(false);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [showDictation, setShowDictation] = useState(false);
  const [dictationText, setDictationText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const maxAutoRetries = 3;

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
  const {
    kill,
    getSession,
    write,
    getConnectionState,
    recoverSession,
    detachSession,
    startSession  // Add this
  } = useTerminalSessions();

  const { issues, recovering, triggerRecovery } = useTerminalHealth(planJobId);

  const session = getSession(planJobId);
  const connectionState = getConnectionState(planJobId);

  // Auto-retry connection on failure
  useEffect(() => {
    if (open && session?.status === 'failed' && connectionState === 'error' && autoRetryCount < maxAutoRetries) {
      const retryDelay = Math.min(5000 * Math.pow(2, autoRetryCount), 30000); // Exponential backoff, max 30s

      const timeoutId = setTimeout(async () => {
        try {
          setTerminalError(null);
          setAutoRetryCount(prev => prev + 1);

          // Try to recover the session
          const recovery = await recoverSession(planJobId, 'restart_pty');
          if (recovery.success) {
            setAutoRetryCount(0); // Reset on success
          }
        } catch (error) {
          console.error('Auto-retry failed:', error);
          setTerminalError(error instanceof Error ? error.message : 'Auto-retry failed');
        }
      }, retryDelay);

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [open, session?.status, connectionState, autoRetryCount, planJobId, recoverSession]);

  // Reset retry count when session becomes healthy
  useEffect(() => {
    if (session?.status === 'running' && connectionState === 'connected') {
      setAutoRetryCount(0);
      setTerminalError(null);
    }
  }, [session?.status, connectionState]);


  useEffect(() => {
    if (open && planJobId) {
      setIsLoadingContent(true);
      getBackgroundJobAction(planJobId)
        .then(result => {
          if (result.isSuccess && result.data?.response) {
            const normalized = normalizeJobResponse(result.data.response);
            setPlanContent(normalized?.content ?? "");
          } else {
            setPlanContent("");
          }
        })
        .catch(() => setPlanContent(""))
        .finally(() => setIsLoadingContent(false));
    } else {
      setPlanContent(null);
    }
  }, [open, planJobId]);

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
      textToSend = replacePlaceholders(cfg.content, { IMPLEMENTATION_PLAN: planContent });
    }
    await chunkedSend(planJobId, textToSend);
  }, [planJobId, planContent, chunkedSend]);


  const handleTerminalReady = useCallback((term: import('@xterm/xterm').Terminal) => {
    terminalRef.current = term;

    // Start or attach to session when terminal is ready
    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      startSession(planJobId, {
        workingDir: projectDirectory
      }).catch((err) => {
        console.error('Failed to start terminal session:', err);
        setTerminalError(err instanceof Error ? err.message : 'Failed to start session');
      });
    }

    // Focus terminal for immediate typing
    term.focus();
  }, [planJobId, projectDirectory, startSession]);


  // Cleanup when modal closes
  useEffect(() => {
    if (!open) {
      sessionStartedRef.current = false; // Reset for next open
    }

    return () => {
      sessionStartedRef.current = false;
    };
  }, [open]);

  // Detach session when modal closes, keep PTY alive
  useEffect(() => {
    if (!open) {
      detachSession(planJobId);
    }
  }, [open, planJobId, detachSession]);



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl flex flex-col h-[80vh]"
        onEscapeKeyDown={(e) => {
          if (isTerminalFocused) {
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          // Prevent Dialog from intercepting ANY keys when terminal is focused
          if (isTerminalFocused) {
            e.stopPropagation();
          }
        }}>
        <DialogHeader className="flex-shrink-0">
          <DialogDescription className="sr-only">
            An interactive terminal session to execute the implementation plan. Requires login and a selected server region.
          </DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex-1">Claude Terminal — {truncateTitle(title ?? planJobId)}</DialogTitle>
            <div className="flex items-center gap-1 ml-4">
              <button
                className="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors mr-2"
                onClick={() => setShowDictation(!showDictation)}
                title={showDictation ? "Hide Dictation" : "Show Dictation"}
              >
                <Mic className="w-3 h-3 text-white" />
              </button>
              <button
                className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                onClick={async () => {
                  if (session?.status === "running" || session?.status === "starting" || session?.status === "agent_requires_attention") {
                    if (showConfirmClose) {
                      await kill(planJobId);
                      // After killing, notify parent to fully close
                      onSessionKilled?.();
                      onOpenChange(false);
                      setShowConfirmClose(false);
                    } else {
                      setShowConfirmClose(true);
                      setTimeout(() => setShowConfirmClose(false), 3000);
                    }
                  } else {
                    // For non-running sessions, just close the modal
                    onOpenChange(false);
                  }
                }}
                title="Close"
              >
                <X className="w-3 h-3 text-red-900" />
              </button>
            </div>
          </div>
          {showConfirmClose && (
            <div className="text-xs text-amber-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" />
              Click again to stop terminal and close
            </div>
          )}
          {terminalError && (
            <div className="text-xs text-red-600 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" />
              {terminalError}
              {autoRetryCount < maxAutoRetries && (
                <span className="ml-2 text-xs text-gray-500">
                  Auto-retry {autoRetryCount}/{maxAutoRetries}
                </span>
              )}
            </div>
          )}
          {recovering && (
            <div className="text-xs text-blue-600 flex items-center gap-1 mt-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Recovering session...
            </div>
          )}
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
                      terminalRef.current?.focus();
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
          <TerminalErrorBoundary onError={(error) => setTerminalError(error.message)}>
            {session?.status === 'failed' && !recovering ? (
              <div className="flex flex-col items-center justify-center h-full p-4 bg-red-50">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-lg font-semibold text-red-700 mb-2">Terminal Failed</h3>
                <p className="text-sm text-red-600 text-center mb-4">
                  {terminalError || 'Terminal process ended unexpectedly'}
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      try {
                        setTerminalError(null);

                        if (issues.length > 0) {
                          const issue = issues[0];
                          switch (issue.type) {
                            case 'processDead':
                              await triggerRecovery('restart');
                              break;
                            case 'disconnected':
                              await triggerRecovery('reattach');
                              break;
                            case 'agentRequiresAttention':
                              await triggerRecovery('interrupt');
                              break;
                            case 'noOutput':
                              await triggerRecovery('sendPrompt');
                              break;
                            case 'persistenceLag':
                              await triggerRecovery('flushPersistence');
                              break;
                            default:
                              await triggerRecovery('restart');
                          }
                        } else {
                          const recovery = await recoverSession(planJobId, 'restart_pty');
                          if (!recovery.success) {
                            setTerminalError(recovery.message || 'Recovery failed');
                          }
                        }
                      } catch (error) {
                        setTerminalError(error instanceof Error ? error.message : 'Recovery failed');
                      }
                    }}
                    disabled={recovering}
                    size="sm"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${recovering ? 'animate-spin' : ''}`} />
                    Restart Terminal
                  </Button>
                  <Button
                    onClick={() => onOpenChange(false)}
                    variant="outline"
                    size="sm"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : session?.status === 'starting' || connectionState === 'connecting' ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to terminal...</span>
                </div>
              </div>
            ) : connectionState === 'disconnected' && session?.status === 'running' ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Restoring session...</span>
                </div>
              </div>
            ) : (
              <BufferedTerminalView
                jobId={planJobId}
                onReady={handleTerminalReady}
                onFocus={() => setIsTerminalFocused(true)}
                onBlur={() => setIsTerminalFocused(false)}
                height="100%"
                workingDir={projectDirectory}
              />
            )}
          </TerminalErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
};
