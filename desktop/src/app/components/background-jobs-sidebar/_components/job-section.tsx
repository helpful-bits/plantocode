"use client";


import { type BackgroundJob } from "@/types/session-types";

import { JobCard } from "../job-card";

interface JobSectionProps {
  title: string;
  jobs: BackgroundJob[];
  handleCancel: (jobId: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
}

/**
 * Component for rendering a section of jobs (active, completed, or failed)
 */
export const JobSection = ({
  title,
  jobs,
  handleCancel,
  isCancelling,
  onSelect,
}: JobSectionProps) => {
  if (jobs.length === 0) return null;

  return (
    <div className="mb-6 w-full">
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">
        {title}
      </h4>
      <div className="space-y-3 w-full">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            handleCancel={handleCancel}
            isCancelling={isCancelling}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

JobSection.displayName = "JobSection";
