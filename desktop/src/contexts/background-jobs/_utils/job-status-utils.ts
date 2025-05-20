"use client";

import { JOB_STATUSES } from "@/types/session-types";

// Statuses that are considered "active" (non-terminal)
export const NON_TERMINAL_JOB_STATUSES = JOB_STATUSES.ACTIVE;
