"use client";

import { RefreshCw, Loader2 } from "lucide-react";

import { JobDetailsModal } from "@/app/components/background-jobs-sidebar/job-details-modal";
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
}

export function ImplementationPlansPanel({
  sessionId,
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

  return (
    <div className="space-y-4 p-4">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Implementation Plans</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshJobs()}
          disabled={isLoading}
          isLoading={isLoading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </header>

      {/* Loading state */}
      {isLoading && implementationPlans.length === 0 && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span>Loading implementation plans...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && implementationPlans.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="text-center space-y-3">
              <h3 className="text-lg font-medium">No Implementation Plans</h3>
              <p className="text-sm text-muted-foreground max-w-[400px] text-balance">
                You haven&apos;t created any implementation plans yet for this
                project. Use the &quot;Create Implementation Plan&quot; option in the file
                manager to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Implementation Plans List */}
      {implementationPlans.length > 0 && (
        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
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
        onOpenChange={(open) => !open && setJobToDelete(undefined)}
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
