"use client";
import { Loader2 } from 'lucide-react'; // Keep Loader2 import
import { Suspense } from "react"; // Keep Suspense import
import { ApplyChangesForm } from "./_components/apply-changes/apply-changes-form";
import { useDatabase } from "@/lib/contexts/database-context"; // Keep useDatabase import
import GeneratePromptRoot from "./_components/generate-prompt/generate-prompt-root";

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
      <h1 className="text-3xl font-bold mb-6 text-center text-foreground">O1 Pro Flow</h1>

      <div className="max-w-[1400px] w-full mx-auto space-y-12"> 
        {/* Main Form Area - No explicit sections */}
        <Suspense fallback={<div className="text-center text-foreground p-8"><Loader2 className="h-8 w-8 animate-spin inline-block"/></div>}>
          <GeneratePromptRoot />
        </Suspense>
      </div>
    </main>
  );
}
