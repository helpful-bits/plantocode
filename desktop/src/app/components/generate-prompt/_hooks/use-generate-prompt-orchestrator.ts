"use client";

import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useDisplayContext } from "../_contexts/display-context";
import { usePlanContext } from "../_contexts/plan-context";
import { useRegexContext } from "../_contexts/regex-context";
import { useTaskContext } from "../_contexts/task-context";

/**
 * Orchestrator hook that combines all the functionality of the generate prompt feature
 * This hook coordinates the various sub-hooks and contexts to provide a unified API
 */
export function useGeneratePromptOrchestrator() {
  // Access the contexts
  const core = useCorePromptContext();
  const task = useTaskContext();
  const regex = useRegexContext();
  const display = useDisplayContext();
  const plan = usePlanContext();

  return {
    core,
    task,
    regex,
    display,
    plan,
  };
}
