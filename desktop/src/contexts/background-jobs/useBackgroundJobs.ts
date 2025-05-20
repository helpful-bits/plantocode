"use client";

import { useContext } from "react";

import { BackgroundJobsContext, type BackgroundJobsContextType } from "./Provider";

export const useBackgroundJobs = (): BackgroundJobsContextType => {
  const context = useContext(BackgroundJobsContext);
  if (!context) {
    throw new Error(
      "useBackgroundJobs must be used within a BackgroundJobsProvider"
    );
  }
  return context;
};
