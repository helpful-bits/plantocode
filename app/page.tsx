"use client";

import { Suspense } from "react";
import { ApplyChangesForm } from "./_components/apply-changes/apply-changes-form";
import GeneratePrompt from "./_components/generate-prompt/generate-prompt-root";
import { FormatSelector } from "@/components/ui/format-selector";

export default function Home() {
  return (
    <main className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-foreground">O1 Pro Flow</h1>

      <div className="max-w-[1400px] mx-auto space-y-12">
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
