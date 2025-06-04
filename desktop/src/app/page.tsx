"use client";

import { RequireProjectDirectory } from "@/app/components/with-project-directory";
import { useSessionStateContext } from "@/contexts/session";
import { useProject } from "@/contexts/project-context";

import { GeneratePromptFeatureProvider as GeneratePromptProvider } from "./components/generate-prompt/_contexts";
import { usePlanContext } from "./components/generate-prompt/_contexts/plan-context";
import GeneratePromptForm from "./components/generate-prompt/generate-prompt-form";
import { ImplementationPlansPanel } from "./components/implementation-plans-panel/implementation-plans-panel";

function HomeContent() {
  const { activeSessionId, currentSession } = useSessionStateContext();
  const { projectDirectory } = useProject();
  
  // Access contexts from the GeneratePrompt provider
  const { state: planState, actions: planActions } = usePlanContext();

  return (
    <div className="relative w-full">
      {/* GeneratePrompt Component */}
      <GeneratePromptForm />

      {/* Merged Implementation Plans Panel */}
      <ImplementationPlansPanel 
        sessionId={activeSessionId}
        projectDirectory={projectDirectory}
        taskDescription={currentSession?.taskDescription}
        includedPaths={currentSession?.includedFiles || []}
        isCreatingPlan={planState.isCreatingPlan}
        planCreationState={planState.planCreationState}
        onCreatePlan={planActions.handleCreateImplementationPlan}
      />

    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-col items-start">
      {/* Descriptive text for project selection */}
      <div className="text-sm text-muted-foreground mb-4 text-balance">
        Select your project&apos;s root folder to enable file browsing,
        session saving, and project-specific settings.
      </div>
      
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
