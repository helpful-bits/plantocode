"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { BufferedTerminalView } from "@/ui/BufferedTerminalView";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";
import { X, Minus, AlertCircle } from "lucide-react";
import { useState } from "react";

interface PlanTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planJobId: string;
  title?: string;
  projectDirectory?: string;
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
  projectDirectory: _projectDirectory
}) => {
  const terminalRef = useRef<Terminal | null>(null);
  const sessionStartedRef = useRef<boolean>(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isTerminalFocused, setIsTerminalFocused] = useState(false);
  const {
    kill,
    getSession,
    resize
  } = useTerminalSessions();
  const resizeTimeoutRef = useRef<number | null>(null);
  
  const session = getSession(planJobId);

  const loadInitialLog = async () => {
    if (!terminalRef.current) return;
    
    try {
      const logContent = await invoke("read_terminal_log_command", {
        jobId: planJobId
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
    term.writeln("\x1b[36m=== Plan Terminal ===\x1b[0m");
    term.writeln("\x1b[33mInitializing terminal session...\x1b[0m");
    term.writeln("\x1b[90m(OSC 52 clipboard enabled)\x1b[0m");
    term.writeln("");

    // Load existing log content first
    await loadInitialLog();

    // Focus terminal for immediate typing
    term.focus();
  }, [loadInitialLog]);

  const handleResize = useCallback((cols: number, rows: number) => {
    if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current);
    resizeTimeoutRef.current = window.setTimeout(() => {
      if (planJobId) resize(planJobId, cols, rows).catch(console.error);
    }, 300);
  }, [resize, planJobId]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!open) {
      sessionStartedRef.current = false; // Reset for next open
      // Clear any pending resize timeout
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    }

    return () => {
      sessionStartedRef.current = false;
      // Clear any pending resize timeout on unmount
      if (resizeTimeoutRef.current) {
        window.clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, [open]);

  const getStatusBadge = () => {
    if (!session) return null;
    
    const statusConfig = {
      starting: { text: 'Starting', className: 'bg-yellow-100 text-yellow-800' },
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
      <DialogContent className="max-w-5xl flex flex-col h-[80vh]" onEscapeKeyDown={(e) => { if (isTerminalFocused) { e.preventDefault(); e.stopPropagation(); } }}>
        <DialogHeader className="flex-shrink-0">
          <DialogDescription className="sr-only">
            An interactive terminal session to execute the implementation plan. Requires login and a selected server region.
          </DialogDescription>
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
                  if (session?.status === "running" || session?.status === "starting" || session?.status === "stuck") {
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
            <BufferedTerminalView
              jobId={planJobId}
              onReady={handleTerminalReady}
              onResize={handleResize}
              onFocus={() => setIsTerminalFocused(true)}
              onBlur={() => setIsTerminalFocused(false)}
              height="100%"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};