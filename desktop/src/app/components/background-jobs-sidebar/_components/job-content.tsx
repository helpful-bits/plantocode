"use client";


import { type BackgroundJob } from "@/types/session-types";

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
    <div className="flex flex-col w-full min-h-full px-3 py-3 pb-24">
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
  );
};

JobContent.displayName = "JobContent";
