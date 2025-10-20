"use client";

import { useState, useEffect } from "react";
import { RequireProjectDirectory } from "@/app/components/with-project-directory";
import { useSessionStateContext } from "@/contexts/session";
import { useProject } from "@/contexts/project-context";
import { getProjectTaskModelSettings } from "@/actions/project-settings.actions";

import { GeneratePromptFeatureProvider as GeneratePromptProvider } from "./components/generate-prompt/_contexts";
import { usePlanContext } from "./components/generate-prompt/_contexts/plan-context";
import GeneratePromptForm from "./components/generate-prompt/generate-prompt-form";
import { ImplementationPlansPanel } from "./components/implementation-plans-panel/implementation-plans-panel";

function HomeContent() {
  const { activeSessionId, currentSession } = useSessionStateContext();
  const { projectDirectory } = useProject();

  // Web search toggle state
  const [enableWebSearch, setEnableWebSearch] = useState(false);

  // Project structure toggle state (default to true)
  const [includeProjectStructure, setIncludeProjectStructure] = useState(true);

  // Current model state for implementation plan
  const [currentModel, setCurrentModel] = useState<string | undefined>(undefined);

  // Access contexts from the GeneratePrompt provider
  const { state: planState, actions: planActions } = usePlanContext();

  // Effect to fetch current implementation plan model
  useEffect(() => {
    if (!projectDirectory) {
      setCurrentModel(undefined);
      return;
    }

    const fetchCurrentModel = async () => {
      try {
        const result = await getProjectTaskModelSettings(projectDirectory);
        if (result.isSuccess && result.data?.implementationPlan) {
          setCurrentModel(result.data.implementationPlan.model);
        } else {
          setCurrentModel(undefined);
        }
      } catch (error) {
        console.error('Failed to fetch current model:', error);
        setCurrentModel(undefined);
      }
    };

    fetchCurrentModel();
  }, [projectDirectory]);

  const handleCreatePlanWithOptions = async (
    selectedRootDirectories?: string[] | null,
    enableWebSearch?: boolean,
    includeProjectStructure?: boolean
  ) => {
    return planActions.handleCreateImplementationPlan(selectedRootDirectories, enableWebSearch, includeProjectStructure);
  };

  return (
    <div className="relative w-full">
      {/* GeneratePrompt Component */}
      <GeneratePromptForm />

      {/* Conditionally render Implementation Plans Panel */}
      {activeSessionId && (
        <ImplementationPlansPanel
          sessionId={activeSessionId}
          projectDirectory={projectDirectory}
          taskDescription={currentSession?.taskDescription}
          includedPaths={currentSession?.includedFiles || []}
          isCreatingPlan={planState.isCreatingPlan}
          planCreationState={planState.planCreationState}
          onCreatePlan={handleCreatePlanWithOptions}
          enableWebSearch={enableWebSearch}
          onWebSearchToggle={setEnableWebSearch}
          includeProjectStructure={includeProjectStructure}
          onProjectStructureToggle={setIncludeProjectStructure}
          currentModel={currentModel}
        />
      )}

    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-col items-start">
      
      {/* RequireProjectDirectory will handle the case when no project is selected */}
      <RequireProjectDirectory>
        {/* Show main app content when a project directory is selected */}
        <GeneratePromptProvider>
          <HomeContent />
        </GeneratePromptProvider>
      </RequireProjectDirectory>
    </main>
  );
}
