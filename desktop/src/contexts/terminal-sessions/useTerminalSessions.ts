"use client";

import { useContext } from "react";

import { TerminalSessionsContext } from "./Provider";
import type { TerminalSessionsContextShape } from "./types";

export const useTerminalSessions = (): TerminalSessionsContextShape => {
  const context = useContext(TerminalSessionsContext);
  if (!context) {
    throw new Error(
      "useTerminalSessions must be used within a TerminalSessionsProvider"
    );
  }
  return context;
};