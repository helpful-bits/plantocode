"use client";
 
import React, { Suspense } from "react"; // Keep Suspense import
import GeneratePromptForm from "./generate-prompt-form";
import { useDatabase } from "@/lib/contexts/database-context"; // Keep useDatabase import
import { Loader2 } from "lucide-react";

function FormWithProviders() {
  const { isInitialized } = useDatabase();

  if (!isInitialized) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Initializing database...</p>
        </div>
      </div>
    );
  }
  
  return <GeneratePromptForm />;
}

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
