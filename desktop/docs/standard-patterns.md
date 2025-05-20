# Standard Patterns for Vibe Manager Desktop App

## Backend-Driven Architecture

The Vibe Manager Desktop application follows a backend-driven architecture, where:

1. The Tauri Rust backend contains all business logic, AI model interaction, prompt engineering, and data processing
2. The frontend React/TypeScript layer is a true UI layer, managing presentation and user interactions

## Frontend-Backend Data Flow

### Actions

Actions should be thin wrappers that invoke Tauri commands. They should not:

- Generate prompts
- Directly call AI APIs
- Perform complex data transformations
- Make decisions about which model to use

```typescript
// GOOD - Thin wrapper that invokes a Tauri command
async function createImplementationPlanAction(params: {
  sessionId: string;
  taskDescription: string;
  relevantFiles: string[];
  projectDirectory: string;
  // Optional overrides
  modelOverride?: string;
  temperatureOverride?: number;
  maxTokensOverride?: number;
}): Promise<ActionState<{ jobId: string }>> {
  try {
    const result = await invoke<{ job_id: string }>(
      "create_implementation_plan_command",
      {
        sessionId: params.sessionId,
        taskDescription: params.taskDescription,
        relevantFiles: params.relevantFiles,
        projectDirectory: params.projectDirectory,
        modelOverride: params.modelOverride,
        temperatureOverride: params.temperatureOverride,
        maxTokensOverride: params.maxTokensOverride,
      }
    );

    return {
      isSuccess: true,
      message: "Implementation plan generation started",
      data: { jobId: result.job_id },
    };
  } catch (error) {
    return handleActionError(error, "createImplementationPlanAction");
  }
}

// BAD - Contains business logic that should be in the backend
async function badCreateImplementationPlanAction(params: {
  sessionId: string;
  taskDescription: string;
  relevantFiles: string[];
  projectDirectory: string;
}): Promise<ActionState<{ jobId: string }>> {
  try {
    // Decide which model to use (BAD - should be in backend)
    const modelSettings = await getModelSettingsForProject(
      params.projectDirectory
    );
    const model = modelSettings.implementation_plan?.model || "gpt-4-turbo";

    // Generate a title (BAD - should be in backend)
    const titlePrompt = `Generate a title for: ${params.taskDescription}`;
    const titleResult = await someAiApiCall(titlePrompt);

    // Pass all this to the backend (BAD - just pass the raw inputs)
    const result = await invoke<{ job_id: string }>(
      "create_implementation_plan_command",
      {
        sessionId: params.sessionId,
        taskDescription: params.taskDescription,
        relevantFiles: params.relevantFiles,
        projectDirectory: params.projectDirectory,
        generatedTitle: titleResult, // BAD - backend should generate this
        model: model, // BAD - backend should decide this
      }
    );

    return {
      isSuccess: true,
      message: "Implementation plan generation started",
      data: { jobId: result.job_id },
    };
  } catch (error) {
    return handleActionError(error, "createImplementationPlanAction");
  }
}
```

### React Hooks

Use the `useTauriCommand` and `useTauriJobCommand` hooks to standardize interactions with Tauri commands:

```typescript
import { useTauriCommand, useTauriJobCommand } from "@/hooks/use-tauri-command";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { useSessionContext } from "@/contexts/session";

export function useImplementationPlan() {
  const { showNotification } = useNotification();
  const { projectDirectory } = useProject();
  const { activeSessionId } = useSessionContext();

  // Use the useTauriJobCommand hook for background job commands
  const createPlan = useTauriJobCommand({
    command: "create_implementation_plan_command",
    traceName: "CreateImplementationPlan",
    successMessage: "Implementation plan generation started",
    onSuccess: (result) => {
      showNotification({
        title: "Success",
        message: "Implementation plan generation started",
        type: "success",
      });
    },
    onError: (error) => {
      showNotification({
        title: "Error",
        message: error.message || "Failed to create implementation plan",
        type: "error",
      });
    },
  });

  // Function to create an implementation plan
  const handleCreatePlan = async (
    taskDescription: string,
    relevantFiles: string[]
  ) => {
    if (!projectDirectory || !activeSessionId) {
      showNotification({
        title: "Error",
        message: "Project directory and session ID are required",
        type: "error",
      });
      return;
    }

    await createPlan.execute({
      sessionId: activeSessionId,
      taskDescription,
      relevantFiles,
      projectDirectory,
    });
  };

  return {
    createPlan: handleCreatePlan,
    isCreatingPlan: createPlan.isLoading,
    planError: createPlan.error,
    planJobId: createPlan.jobId,
  };
}
```

### React Components

Components should focus on UI rendering and user interactions, delegating business logic to hooks and actions:

```tsx
import React from "react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { useImplementationPlan } from "@/hooks/use-implementation-plan";
import { useFileManagement } from "@/hooks/use-file-management";

export function ImplementationPlanCreator() {
  const { createPlan, isCreatingPlan } = useImplementationPlan();
  const { taskDescription, selectedFiles } = useFileManagement();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Implementation Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Generate an implementation plan based on your selected files and task
          description.
        </p>
        <Button
          onClick={() => createPlan(taskDescription, selectedFiles)}
          disabled={
            isCreatingPlan || !taskDescription || selectedFiles.length === 0
          }
        >
          {isCreatingPlan ? "Creating..." : "Create Plan"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

## Summary

1. **Tauri Rust Backend:**

   - Contains all business logic, prompt engineering, and AI interactions
   - Makes decisions about models, parameters, and processes

2. **React/TypeScript Frontend:**

   - Pure UI layer for presentation and interaction
   - Passes raw user inputs to backend
   - Displays results returned from backend
   - Manages UI state only (loading, error, etc.)

3. **TypeScript Actions:**

   - Thin wrappers around Tauri commands
   - Standard error handling with `handleActionError`
   - Return `ActionState<T>` with consistent shape

4. **React Hooks:**
   - Use `useTauriCommand` for simple commands
   - Use `useTauriJobCommand` for background job commands
   - Handle UI-specific concerns (notifications, etc.)

This architecture ensures a clean separation of concerns, where the backend handles all complex logic and the frontend focuses on providing a great user experience.
