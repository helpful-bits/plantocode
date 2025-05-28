"use client";


import { type BackgroundJob } from "@/types/session-types";

import { EmptyState, LoadingState } from "../sidebar-states";
import { JobCard } from "../job-card";

interface JobContentProps {
  shouldShowLoading: boolean;
  shouldShowEmpty: boolean;
  allJobsSorted: BackgroundJob[];
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
  allJobsSorted,
  handleCancel,
  isCancelling,
  onSelect,
}: JobContentProps) => {
  return (
    <div className="flex flex-col w-full min-h-full px-3 py-3 pb-24">
      {shouldShowLoading ? (
        <LoadingState />
      ) : shouldShowEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-3 w-full max-w-full overflow-hidden">
          {allJobsSorted.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              handleCancel={handleCancel}
              isCancelling={isCancelling}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

JobContent.displayName = "JobContent";
