"use client";

import { RequireProjectDirectory } from "@/app/components/with-project-directory";
import { useSessionStateContext } from "@/contexts/session";

import { GeneratePromptFeatureProvider as GeneratePromptProvider } from "./components/generate-prompt/_contexts";
import GeneratePromptForm from "./components/generate-prompt/generate-prompt-form";
import { ImplementationPlansPanel } from "./components/implementation-plans-panel/implementation-plans-panel";

export default function Home() {
  const { activeSessionId } = useSessionStateContext();

  // We no longer show a full-screen loading UI to avoid interrupting the experience
  // Instead, we'll let child components handle their own loading states

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
        <div className="relative w-full">

          {/* GeneratePrompt Component */}
          <GeneratePromptProvider>
            <GeneratePromptForm />
          </GeneratePromptProvider>

          {/* Implementation Plans Panel */}
          <ImplementationPlansPanel sessionId={activeSessionId} />
        </div>
      </RequireProjectDirectory>
    </main>
  );
}
