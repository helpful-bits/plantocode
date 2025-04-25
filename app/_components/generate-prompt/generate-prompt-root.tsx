"use client";

import React, { Suspense } from "react";
import GeneratePromptForm from "./generate-prompt-form";
import { useInitialization } from "@/lib/contexts/initialization-context";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Component that waits for initialization before rendering form
function FormWithProviders() {
  const { isLoading, stage, error, retryInitialization } = useInitialization();
  
  if (isLoading && stage !== 'ready' && stage !== 'session_loading') {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {stage === 'database_init' && "Initializing database..."}
            {stage === 'project_loading' && "Waiting for project selection..."}
            {stage === 'session_loading' && "Loading session data..."}
          </p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-destructive font-medium">Initialization Error</p>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={retryInitialization}>Retry</Button>
        </div>
      </div>
    );
  }
  
  return <GeneratePromptForm />;
}

// Main component that renders the form
export default function GeneratePromptRoot() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <FormWithProviders />
    </Suspense>
  );
} 
