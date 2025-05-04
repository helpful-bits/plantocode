"use client";

import React, { Suspense } from "react";
import GeneratePromptForm from './generate-prompt-form';
import { RequireProjectDirectory } from '@/components/with-project-directory';
import { useProject } from '@/lib/contexts/project-context';
import { Loader2 } from "lucide-react";

export default function GeneratePromptRoot() {
  const { isLoading } = useProject();
  
  // Only show loading indicator while project is loading
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Loading project data...
          </p>
        </div>
      </div>
    );
  }
  
  // Wrap the GeneratePromptForm with RequireProjectDirectory
  return (
    <RequireProjectDirectory
      title="Select Your Project"
      description="Please select a project directory to begin working with AI Architect Studio."
    >
      <GeneratePromptForm />
    </RequireProjectDirectory>
  );
} 
