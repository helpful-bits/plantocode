"use client";

import { RefreshCw, Loader2, FileCode } from "lucide-react";
import { useCallback } from "react";

import { JobDetailsModal } from "@/app/components/background-jobs-sidebar/job-details-modal";
import { useNotification } from "@/contexts/notification-context";
import { useSessionStateContext } from "@/contexts/session";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
} from "@/ui/card";
import { ScrollArea } from "@/ui/scroll-area";

import ImplementationPlanCard from "./_components/ImplementationPlanCard";
import PlanContentModal from "./_components/PlanContentModal";
import { useImplementationPlansLogic } from "./_hooks/useImplementationPlansLogic";

interface ImplementationPlansPanelProps {
  sessionId: string | null;
  // Props from the create functionality
  projectDirectory?: string;
  taskDescription?: string;
  includedPaths?: string[];
  isCreatingPlan?: boolean;
  planCreationState?: "idle" | "submitted";
  onCreatePlan?: (taskDescription: string, includedPaths: string[]) => Promise<void>;
}

export function ImplementationPlansPanel({
  sessionId,
  projectDirectory,
  taskDescription,
  includedPaths,
  isCreatingPlan,
  planCreationState,
  onCreatePlan,
}: ImplementationPlansPanelProps) {
  const {
    implementationPlans,
    isLoading,
    copiedPlanId,
    jobForModal,
    planContentModal,
    pollingError,
    jobToDelete,
    isDeleting,

    handleCopyToClipboard,
    handleDeletePlan,
    handleViewPlanContent,
    handleClosePlanContentModal,
    refreshJobContent,
    handleViewPlanDetails,
    handleClosePlanDetails,
    setJobToDelete,
    refreshJobs,
  } = useImplementationPlansLogic({ sessionId });

  const { currentSession } = useSessionStateContext();
  const { showNotification } = useNotification();

  // Validation for create functionality
  const canCreatePlan = Boolean(
    projectDirectory &&
    (taskDescription || currentSession?.taskDescription)?.trim() &&
    includedPaths?.length &&
    sessionId &&
    !isCreatingPlan
  );

  // Handle plan creation with error feedback
  const handleCreatePlan = useCallback(async () => {
    if (!onCreatePlan || !canCreatePlan) return;

    const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
    const finalIncludedPaths = includedPaths || [];

    try {
      await onCreatePlan(finalTaskDescription, finalIncludedPaths);
    } catch (error) {
      showNotification({
        title: "Implementation Plan Creation Failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create implementation plan",
        type: "error",
      });
    }
  }, [onCreatePlan, canCreatePlan, taskDescription, currentSession?.taskDescription, includedPaths, showNotification]);

  // Button text based on state
  const buttonText = isCreatingPlan
    ? "Creating..."
    : planCreationState === "submitted"
      ? "Started!"
      : "Create Implementation Plan";

  return (
    <div className="space-y-4 p-4">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Implementation Plans</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshJobs()}
          disabled={isLoading}
          className="bg-background/90 backdrop-blur-sm shadow-soft border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-primary hover:border-primary/20"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </header>

      {/* Create Implementation Plan Section */}
      {onCreatePlan && (
        <Card className="bg-card p-6 rounded-lg border shadow-sm mb-6">
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground">Create New Plan</h3>
            
            <Button
              variant="default"
              size="sm"
              onClick={handleCreatePlan}
              disabled={!canCreatePlan}
              className="flex items-center justify-center w-full h-9"
            >
              <FileCode className="h-4 w-4 mr-2" />
              {buttonText}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-3 text-balance">
            Creates an implementation plan based on your task description and
            selected files.
          </p>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && implementationPlans.length === 0 && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span>Loading implementation plans...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && implementationPlans.length === 0 && (
        <Card className="bg-background/90 backdrop-blur-sm shadow-soft border-border/20 rounded-xl">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="text-center space-y-3">
              <h3 className="text-lg font-medium text-foreground">No Implementation Plans</h3>
              <p className="text-sm text-muted-foreground max-w-[400px] text-balance">
                {onCreatePlan 
                  ? "Create your first implementation plan using the button above."
                  : "You haven't created any implementation plans yet for this project. Use the \"Create Implementation Plan\" option in the file manager to get started."
                }
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Implementation Plans List */}
      {implementationPlans.length > 0 && (
        <ScrollArea className="h-[calc(100vh-300px)] pr-4">
          <div className="space-y-3">
            {implementationPlans.map((plan) => (
              <ImplementationPlanCard
                key={plan.id}
                plan={plan}
                onCopyContent={handleCopyToClipboard}
                onViewContent={handleViewPlanContent}
                onViewDetails={handleViewPlanDetails}
                onDelete={(jobId) => setJobToDelete(jobId)}
                isDeleting={isDeleting[plan.id] || false}
                copiedPlanId={copiedPlanId}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Job Details Modal */}
      {jobForModal && (
        <JobDetailsModal
          job={jobForModal}
          onClose={handleClosePlanDetails}
        />
      )}

      {/* Plan Content Modal */}
      {planContentModal && (
        <PlanContentModal
          plan={planContentModal.plan}
          open={planContentModal.open}
          onOpenChange={(open: boolean) => {
            if (!open) handleClosePlanContentModal();
          }}
          pollingError={pollingError}
          onCopyContent={(text) =>
            handleCopyToClipboard(text, planContentModal.plan.id)
          }
          onRefreshContent={refreshJobContent}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!jobToDelete}
        onOpenChange={(open: boolean) => !open && setJobToDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Implementation Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this implementation plan? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setJobToDelete(undefined)}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              isLoading={Object.values(isDeleting).some(Boolean)}
              onClick={() => jobToDelete && handleDeletePlan(jobToDelete)}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ImplementationPlansPanel;
