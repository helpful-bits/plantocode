"use client";

import React, { useCallback, useContext, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { useTerminalSessions } from "@/contexts/terminal-sessions";
import TerminalView from "@/ui/TerminalView";
import { Eye, Minimize2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/ui/button";
import { gracefulExitTerminal } from "@/actions/terminal/terminal.actions";
import { BackgroundJobsContext } from "@/contexts/background-jobs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";

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
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const { minimizeSession } = useTerminalSessions();
  const { jobs } = useContext(BackgroundJobsContext);

  // Find the associated background job
  const associatedJob = sessionId ? jobs.find(job => job.id === sessionId) : null;

  const handleMinimize = useCallback(() => {
    if (sessionId) {
      minimizeSession(sessionId);
      onOpenChange(false);
    }
  }, [sessionId, minimizeSession, onOpenChange]);

  const handleFinish = useCallback(async () => {
    if (!sessionId) return;

    try {
      await gracefulExitTerminal(sessionId);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to gracefully exit terminal:', error);
    }
  }, [sessionId, onOpenChange]);

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
          className="max-w-5xl flex flex-col h-[80vh]"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogDescription className="sr-only">
              An interactive terminal session for executing tasks.
            </DialogDescription>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex-1">{title || `Terminal — ${sessionId.slice(0, 8)}`}</DialogTitle>
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
                  onClick={() => setShowConfirmFinish(true)}
                  title="Finish Session"
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

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmFinish} onOpenChange={setShowConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Finish Terminal Session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to finish this session? This will terminate the agent and mark the task as complete/reviewed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmFinish(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleFinish}>
              Finish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
