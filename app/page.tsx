"use client";
import { Loader2 } from 'lucide-react';
import { Suspense } from "react";
import { useInitialization } from "@/lib/contexts/initialization-context";
import { InitializationStatus } from "./_components/initialization-status";
import GeneratePromptRoot from "./_components/generate-prompt/generate-prompt-root";
import { XmlChangesPanel } from "./_components/xml-changes/xml-changes-panel";

export default function Home() {
  const { stage, isLoading } = useInitialization();
  
  return (
    <main className="container mx-auto py-8 flex flex-col min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-center text-foreground">AI Architect Studio</h1>
      
      {/* Show initialization status if not ready */}
      <InitializationStatus />
      
      {/* Only show the main content if ready or in session loading stage */}
      {(stage === 'ready' || stage === 'session_loading') ? (
        <div className="max-w-[1400px] w-full mx-auto space-y-12"> 
          <Suspense fallback={
            <div className="text-center text-foreground p-8">
              <Loader2 className="h-8 w-8 animate-spin inline-block"/>
            </div>
          }>
            <GeneratePromptRoot />
            <XmlChangesPanel />
          </Suspense>
        </div>
      ) : (
        /* Show loading spinner for earlier initialization stages */
        <div className="flex-grow flex justify-center items-center">
          <div className="flex justify-center items-center h-[50vh] flex-col gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      )}
    </main>
  );
}
