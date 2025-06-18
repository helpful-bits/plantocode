import React, { createContext, useContext } from "react";
import { type BackgroundJob, type JobMetadata } from "@/types/session-types";
import { type CopyButtonConfig } from "@/types/config-types";

interface JobDetailsContextValue {
  job: BackgroundJob;
  parsedMetadata: JobMetadata | null;
  isStreaming: boolean;
  progress: number | undefined;
  jobDuration: string;
  responseContent: string;
  promptContent: string;
  formatMetadata: (metadata: any) => string;
  formatRegexPatterns: (parsedJsonData: any) => string | null;
  copyButtons?: CopyButtonConfig[];
}

const JobDetailsContext = createContext<JobDetailsContextValue | null>(null);

export function useJobDetailsContext(): JobDetailsContextValue {
  const context = useContext(JobDetailsContext);
  if (!context) {
    throw new Error("useJobDetailsContext must be used within a JobDetailsContextProvider");
  }
  return context;
}

interface JobDetailsContextProviderProps {
  children: React.ReactNode;
  value: JobDetailsContextValue;
}

export function JobDetailsContextProvider({ children, value }: JobDetailsContextProviderProps) {
  return (
    <JobDetailsContext.Provider value={value}>
      {children}
    </JobDetailsContext.Provider>
  );
}