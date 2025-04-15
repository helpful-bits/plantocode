"use client";
import { Loader2 } from 'lucide-react'; // Keep Loader2 import
import { Suspense } from "react"; // Keep Suspense import
import { ApplyChangesForm } from "./_components/apply-changes/apply-changes-form";
import GeneratePrompt from "./_components/generate-prompt/generate-prompt-root";
import { FormatSelector } from "@/components/ui/format-selector"; // Keep FormatSelector import
import { useDatabase } from "@/lib/contexts/database-context"; // Keep useDatabase import

export default function Home() {
  const { isInitialized } = useDatabase();
  
  if (!isInitialized) {
    return (
      <main className="container mx-auto py-8 flex flex-col min-h-screen">
        <h1 className="text-3xl font-bold mb-8 text-center text-foreground">O1 Pro Flow</h1>
        <div className="flex-grow flex justify-center items-center">
          <div className="flex justify-center items-center h-[50vh] flex-col gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto py-8 flex flex-col min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-center text-foreground">O1 Pro Flow</h1>

      <div className="max-w-[1400px] w-full mx-auto space-y-12">
        <div>
          <FormatSelector />
        </div>
        
        <section id="generate-prompt">
          <h2 className="text-2xl font-bold mb-4 text-center text-foreground">1. Generate O1 Prompt</h2>
          <Suspense fallback={<div className="text-center text-foreground">Loading...</div>}>
            <GeneratePrompt />
          </Suspense>
        </section>

        <section>
          {/* Section 3: Send to Gemini - Conditionally Rendered in GeneratePromptForm based on state */}
          <h2 className="text-2xl font-bold mb-4 text-center text-foreground">2. Apply Changes</h2>
          <Suspense fallback={<div className="text-center text-foreground">Loading apply changes form...</div>}>
            <ApplyChangesForm /> {/* Keep ApplyChangesForm */}
          </Suspense>
        </section>

        {/* Section 3: Send to Gemini - Conditionally Rendered in GeneratePromptForm based on state */}
        <section id="send-gemini">
           {/* Placeholder heading, actual component is inside GeneratePromptForm */}
          <h2 className="text-2xl font-bold mb-4 text-center text-foreground">3. Send Prompt & Process Response (Gemini)</h2>
          {/* The GeminiProcessor component will be rendered within GeneratePromptForm when appropriate */}
        </section>
      </div>
    </main>
  );
}
