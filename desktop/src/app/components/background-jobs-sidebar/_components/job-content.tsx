"use client";


import { type BackgroundJob } from "@/types/session-types";
import { ScrollArea } from "@/ui/scroll-area";

import { EmptyState, LoadingState } from "../sidebar-states";

import { JobSection } from "./job-section";

interface JobContentProps {
  shouldShowLoading: boolean;
  shouldShowEmpty: boolean;
  activeJobsToShow: BackgroundJob[];
  completedJobs: BackgroundJob[];
  failedJobs: BackgroundJob[];
  handleCancel: (jobId: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
}

/**
 * Component for rendering the scrollable job content area
 */
export const JobContent = ({
  shouldShowLoading,
  shouldShowEmpty,
  activeJobsToShow,
  completedJobs,
  failedJobs,
  handleCancel,
  isCancelling,
  onSelect,
}: JobContentProps) => {
  return (
    <ScrollArea
      className="px-3 py-3 pb-24 h-full min-h-[calc(100vh-8rem)]"
      style={{ width: "100%", maxWidth: "100%", display: "block !important", minWidth: "0 !important" }}
    >
      <div className="min-h-[calc(100vh-10rem)] w-full max-w-full overflow-hidden">
        {shouldShowLoading ? (
          <LoadingState />
        ) : shouldShowEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* Active Jobs Section */}
            <JobSection
              title="Active"
              jobs={activeJobsToShow}
              handleCancel={handleCancel}
              isCancelling={isCancelling}
              onSelect={onSelect}
            />

            {/* Completed Jobs Section */}
            <JobSection
              title="Completed"
              jobs={completedJobs}
              handleCancel={handleCancel}
              isCancelling={isCancelling}
              onSelect={onSelect}
            />

            {/* Failed/Canceled Jobs Section */}
            <JobSection
              title="Failed/Canceled"
              jobs={failedJobs}
              handleCancel={handleCancel}
              isCancelling={isCancelling}
              onSelect={onSelect}
            />
          </>
        )}
      </div>
    </ScrollArea>
  );
};

JobContent.displayName = "JobContent";
