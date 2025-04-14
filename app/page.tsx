"use client";

import { Suspense } from "react";
import { ApplyChangesForm } from "./_components/apply-changes/apply-changes-form";
import GeneratePrompt from "./_components/generate-prompt/generate-prompt-root";
import { FormatSelector } from "@/components/ui/format-selector";
import { useDatabase } from "@/lib/contexts/database-context";

export default function Home() {
  const { isInitialized } = useDatabase();
  
  if (!isInitialized) {
    return (
      <main className="container mx-auto py-8 flex flex-col min-h-screen">
        <h1 className="text-3xl font-bold mb-8 text-center text-foreground">O1 Pro Flow</h1>
        {/* Added key prop for better performance */}
        <div className="flex-grow flex justify-center items-center"> {/* Added key prop */}
          <div className="flex justify-center items-center h-[50vh] flex-col gap-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-8 flex flex-col min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-center text-foreground">O1 Pro Flow</h1>

      <div className="max-w-[1400px] w-full mx-auto space-y-12"> {/* Ensure full width */}
        <div>
          <FormatSelector />
        </div>
        
        <section>
          <h2 className="text-2xl font-bold mb-4 text-center text-foreground">1. Generate O1 Prompt</h2>
          <Suspense fallback={<div className="text-center text-foreground">Loading...</div>}>
            <GeneratePrompt />
          </Suspense>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4 text-center text-foreground">2. Apply Changes</h2>
          <Suspense fallback={<div className="text-center text-foreground">Loading...</div>}>
            <ApplyChangesForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
