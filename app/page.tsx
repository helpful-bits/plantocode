"use server";

import { Suspense } from "react";
import { ApplyChangesForm } from "./_components/apply-changes-form";
import GeneratePrompt from "./_components/generate-prompt/generate-prompt-root";

export default async function Home() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-foreground">O1 Pro Flow</h1>

      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold mb-4 text-foreground">1. Generate O1 Prompt</h2>
          <Suspense fallback={<div className="text-foreground">Loading...</div>}>
            <GeneratePrompt />
          </Suspense>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4 text-foreground">2. Apply Changes</h2>
          <Suspense fallback={<div className="text-foreground">Loading...</div>}>
            <ApplyChangesForm />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
