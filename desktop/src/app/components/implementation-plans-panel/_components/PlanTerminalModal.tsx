"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { TerminalView } from "@/ui/TerminalView";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";
import { getBackgroundJobAction } from "@/actions/background-jobs/jobs.actions";
import { normalizeJobResponse } from "@/utils/response-utils";
import { X, Minus, AlertCircle } from "lucide-react";
import { useState } from "react";

interface PlanTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planJobId: string;
  title?: string;
}

const PROMPT_SENT_KEY_PREFIX = "terminal_prompt_sent:";

function truncateTitle(s?: string, max = 80) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

async function getPersistedFlag(jobId: string): Promise<boolean> {
  try {
    const key = PROMPT_SENT_KEY_PREFIX + jobId;
    const v = await invoke<string | null>("get_key_value_command", { key });
    return v === "true";
  } catch {
    return false;
  }
}

async function setPersistedFlag(jobId: string) {
  try {
    const key = PROMPT_SENT_KEY_PREFIX + jobId;
    await invoke("set_key_value_command", { key, value: "true" });
  } catch {}
}



export const PlanTerminalModal: React.FC<PlanTerminalModalProps> = ({
  open,
  onOpenChange,
  planJobId,
  title
}) => {
  const terminalRef = useRef<Terminal | null>(null);
  const sentFlagRef = useRef<boolean>(false);
  const sessionStartedRef = useRef<boolean>(false);
  const resizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const { 
    startSession, 
    write, 
    kill, 
    getSession,
    setOutputCallback,
    removeOutputCallback
  } = useTerminalSessions();
  
  const session = getSession(planJobId);
  
  const loadInitialLog = async () => {
    if (!terminalRef.current) return;
    
    try {
      const logContent = await invoke("read_terminal_log_command", {
        job_id: planJobId
      }) as string;
      
      if (logContent && logContent.trim()) {
        // Just write the existing log content directly
        terminalRef.current.write(logContent);
      } else {
        terminalRef.current.writeln("\x1b[90mNo previous output found. Starting fresh...\x1b[0m\r\n");
      }
    } catch (error) {
      console.error("Failed to load terminal log:", error);
      terminalRef.current.writeln(`\x1b[31mError loading log: ${error}\x1b[0m\r\n`);
    }
  };

  const handleTerminalReady = useCallback(async (term: Terminal) => {
    terminalRef.current = term;
    
    // Write initial welcome message
    term.writeln("\x1b[36m=== Claude Code Terminal ===\x1b[0m");
    term.writeln("\x1b[33mInitializing session for plan: \x1b[0m" + planJobId.slice(0, 8));
    term.writeln("");
    
    // Set up output callback for real-time display BEFORE starting session
    setOutputCallback(planJobId, (data: string) => {
      if (terminalRef.current) {
        terminalRef.current.write(data);
      }
    });
    
    // Load existing log content first
    await loadInitialLog();
    
    // Focus terminal for immediate typing
    term.focus();
    
    // Check if we need to start a session (only start if not already running)
    if (!session || session.status !== 'running') {
      // Prevent duplicate starts
      if (sessionStartedRef.current) {
        term.writeln("\x1b[33mSession start already in progress...\x1b[0m");
        return;
      }
      
      sessionStartedRef.current = true;
      
      try {
        term.writeln("\x1b[32mStarting new Claude CLI session...\x1b[0m");
        term.writeln("\x1b[90mConnecting to Claude/Cursor CLI...\x1b[0m");
        term.writeln("");
        
        // Get initial terminal size and pass to startSession
        const { cols, rows } = term;
        await startSession(planJobId, { 
          workingDir: undefined,
          rows,
          cols,
        });

        // Auto-send plan content if not already sent
        const alreadySentPersisted = await getPersistedFlag(planJobId);
        
        if (!sentFlagRef.current && !alreadySentPersisted) {
          try {
            const jobResult = await getBackgroundJobAction(planJobId);
            if (jobResult.isSuccess && jobResult.data) {
              const responseData = normalizeJobResponse(jobResult.data.response);
              const content = responseData.content || "";
              if (content.trim().length > 0) {
                // Show what we're about to send
                term.writeln("\r\n\x1b[36m=== Auto-sending Implementation Plan ===\x1b[0m\r\n");
                
                // Small delay to ensure CLI is ready
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Send the plan content line by line for better visibility
                const lines = content.split('\n');
                for (const line of lines) {
                  await write(planJobId, line + "\r\n");
                  // Small delay between lines to avoid overwhelming
                  await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                sentFlagRef.current = true;
                await setPersistedFlag(planJobId);
                
                term.writeln("\r\n\x1b[32m✓ Plan sent to Claude (" + lines.length + " lines)\x1b[0m\r\n");
              }
            }
          } catch (autoSendError) {
            term.writeln(`\r\n\x1b[31m[Error] Auto-send failed: ${String(autoSendError)}\x1b[0m\r\n`);
          }
        }
      } catch (error) {
        sessionStartedRef.current = false; // Allow retry on error
        term.writeln(`\x1b[31mFailed to start terminal: ${error}\x1b[0m`);
        term.writeln(`\x1b[33mPlease ensure Claude or Cursor CLI is installed:\x1b[0m`);
        term.writeln(`  npm install -g @anthropic-ai/claude-code`);
        term.writeln(`  or install Cursor from: https://cursor.sh`);
      }
    } else {
      term.writeln("\x1b[33mReconnected to existing session\x1b[0m");
    }
  }, [session, planJobId, startSession, setOutputCallback, write, getBackgroundJobAction, normalizeJobResponse]);

  const handleTerminalData = useCallback(async (data: string) => {
    try {
      if (session && session.status === 'running') {
        // Send input to the running Claude process
        // The CLI will echo it back
        await write(planJobId, data);
      } else {
        // No active process
        if (data === '\r' && terminalRef.current) {
          terminalRef.current.write("\r\n\x1b[31m[No active session. Press Enter to start one...]\x1b[0m\r\n");
          // Try to start a session
          sessionStartedRef.current = false;
          await handleTerminalReady(terminalRef.current);
        }
      }
    } catch (error) {
      if (terminalRef.current) {
        terminalRef.current.write(`\r\n\x1b[31m[Error: ${error}]\x1b[0m\r\n`);
      }
    }
  }, [session, planJobId, write, handleTerminalReady]);


  // Note: Output is handled via callback set in handleTerminalReady, no useEffect needed

  // Cleanup when modal closes
  useEffect(() => {
    if (!open) {
      removeOutputCallback(planJobId);
      sessionStartedRef.current = false; // Reset for next open
      // Clear any pending resize timer
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    }
    
    return () => {
      removeOutputCallback(planJobId);
      sessionStartedRef.current = false;
      // Clear any pending resize timer on unmount
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [open, planJobId, removeOutputCallback]);

  const getStatusBadge = () => {
    if (!session) return null;
    
    const statusConfig = {
      running: { text: 'Running', className: 'bg-green-100 text-green-800' },
      completed: { text: 'Completed', className: 'bg-blue-100 text-blue-800' },
      failed: { text: 'Failed', className: 'bg-red-100 text-red-800' },
      stuck: { text: 'Stuck', className: 'bg-amber-100 text-amber-800' },
      idle: { text: 'Idle', className: 'bg-gray-100 text-gray-800' },
    };
    
    const config = statusConfig[session.status];
    if (!config) return null;
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
        {config.text}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl flex flex-col h-[80vh]">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex-1">Claude Terminal — {truncateTitle(title ?? planJobId)}</DialogTitle>
            {getStatusBadge()}
            <div className="flex items-center gap-1 ml-4">
              <button
                className="w-6 h-6 rounded-full bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center transition-colors"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? "Restore" : "Minimize"}
              >
                <Minus className="w-3 h-3 text-yellow-900" />
              </button>
              <button
                className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                onClick={async () => {
                  if (session?.status === "running" || session?.status === "stuck") {
                    if (showConfirmClose) {
                      await kill(planJobId);
                      onOpenChange(false);
                      setShowConfirmClose(false);
                    } else {
                      setShowConfirmClose(true);
                      setTimeout(() => setShowConfirmClose(false), 3000);
                    }
                  } else {
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
        </DialogHeader>
        
        {isMinimized ? (
          <div className="flex-1 flex items-center justify-center bg-muted/30 rounded">
            <div className="text-sm text-muted-foreground">Terminal minimized - click yellow button to restore</div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 border rounded overflow-hidden">
            <TerminalView 
              onReady={handleTerminalReady}
              onData={handleTerminalData}
              onResize={(cols, rows) => {
                // Throttle resize commands to avoid overwhelming the backend
                if (resizeTimerRef.current) {
                  clearTimeout(resizeTimerRef.current);
                }
                
                resizeTimerRef.current = setTimeout(() => {
                  invoke("resize_terminal_session_command", { 
                    job_id: planJobId, 
                    cols, 
                    rows 
                  });
                  resizeTimerRef.current = null;
                }, 150); // 150ms throttle delay
              }}
              height="100%"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};