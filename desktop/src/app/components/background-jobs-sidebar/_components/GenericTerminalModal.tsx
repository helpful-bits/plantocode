"use client";

import React, { useCallback, useContext, useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { useTerminalSessions } from "@/contexts/terminal-sessions";
import TerminalView from "@/ui/TerminalView";
import { Eye, Minimize2, CheckCircle } from "lucide-react";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { gracefulExitTerminal } from "@/actions/terminal/terminal.actions";
import { BackgroundJobsContext } from "@/contexts/background-jobs";

interface GenericTerminalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  title?: string;
}

export const GenericTerminalModal: React.FC<GenericTerminalModalProps> = ({
  open,
  onOpenChange,
  sessionId,
  title,
}) => {
  const [isFinishing, setIsFinishing] = useState(false);
  const { minimizeSession, getSession, startSession } = useTerminalSessions();
  const { jobs } = useContext(BackgroundJobsContext);

  // Find the associated background job
  const associatedJob = sessionId ? jobs.find(job => job.id === sessionId) : null;
  const session = sessionId ? getSession(sessionId) : undefined;

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
    if (!open || !sessionId) return;

    const currentSession = getSessionRef.current(sessionId);
    if (!currentSession || currentSession.status !== 'running') {
      startSessionRef.current(sessionId, {});
    }
  }, [open, sessionId]);

  const handleMinimize = useCallback(() => {
    if (sessionId) {
      minimizeSession(sessionId);
      onOpenChange(false);
    }
  }, [sessionId, minimizeSession, onOpenChange]);

  const handleFinish = useCallback(async () => {
    if (!sessionId || isFinishing) return;

    setIsFinishing(true);

    try {
      await gracefulExitTerminal(sessionId);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to gracefully exit terminal:', error);
    } finally {
      setIsFinishing(false);
    }
  }, [sessionId, onOpenChange, isFinishing]);

  const handleViewPlan = useCallback(() => {
    if (sessionId) {
      window.dispatchEvent(new CustomEvent('open-plan-content', { detail: { jobId: sessionId } }));
    }
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-5xl flex flex-col h-[90vh]"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogDescription className="sr-only">
              An interactive terminal session for executing tasks.
            </DialogDescription>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <DialogTitle>{title || `Terminal — ${sessionId.slice(0, 8)}`}</DialogTitle>
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
                {/* View Plan button - only show if there's an associated job */}
                {associatedJob && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewPlan}
                    title="View Plan"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Plan
                  </Button>
                )}

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
          </DialogHeader>

          <div className="flex-1 min-h-0 border rounded overflow-hidden">
            {open && <TerminalView sessionId={sessionId} isVisible={true} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
