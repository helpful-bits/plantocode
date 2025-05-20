import { ScrollArea } from "@/ui/scroll-area";

interface JobDetailsPromptSectionProps {
  promptContent: string;
}

export function JobDetailsPromptSection({
  promptContent,
}: JobDetailsPromptSectionProps) {
  return (
    <div className="p-5 bg-gray-50 dark:bg-muted/10 rounded-md">
      <h4 className="font-semibold mb-3 text-xs text-muted-foreground uppercase">
        Prompt
      </h4>
      <ScrollArea className="max-h-[300px]">
        <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">
          {promptContent}
        </pre>
      </ScrollArea>
    </div>
  );
}
