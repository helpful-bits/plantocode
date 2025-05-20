"use client";

// Debug mode control
export const DEBUG_POLLING =
  typeof window !== "undefined" &&
  (localStorage.getItem("DEBUG_BACKGROUND_JOBS") === "true" || false);
