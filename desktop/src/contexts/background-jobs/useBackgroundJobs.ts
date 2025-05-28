"use client";

import { useContext } from "react";

import { BackgroundJobsContext, type BackgroundJobsContextType } from "./Provider";
import { logError } from "@/utils/error-handling";

export const useBackgroundJobs = (): BackgroundJobsContextType => {
  const context = useContext(BackgroundJobsContext);
  if (!context) {
    const error = new Error(
      "useBackgroundJobs must be used within a BackgroundJobsProvider"
    );
    logError(error, "Background Jobs Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
};
