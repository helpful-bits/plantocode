import { type BackgroundJob } from "@/types/session-types";
import { ScrollArea } from "@/ui/scroll-area";

interface JobDetailsMetadataSectionProps {
  job: BackgroundJob;
  formatMetadata: (metadata: string | Record<string, unknown> | null | undefined) => string;
  formatRegexPatterns: (regexPatterns: string | Record<string, unknown> | null | undefined) => string | null;
}

export function JobDetailsMetadataSection({
  job,
  formatMetadata,
  formatRegexPatterns,
}: JobDetailsMetadataSectionProps) {
  if (!job.metadata || Object.keys(job.metadata).length === 0) {
    return null;
  }

  return (
    <div className="p-5 bg-gray-50 dark:bg-muted/10 rounded-md">
      <h4 className="font-semibold mb-3 text-xs text-muted-foreground uppercase">
        Metadata
      </h4>

      {job.metadata.targetField && (
        <div className="mb-3">
          <h5 className="text-xs text-muted-foreground mb-1">Target Field</h5>
          <p className="text-sm font-medium">{job.metadata.targetField}</p>
        </div>
      )}

      {/* Display regex patterns separately if they exist */}
      {job.metadata.regexPatterns && (
        <div className="mb-3">
          <h5 className="text-xs text-muted-foreground mb-1">Regex Patterns</h5>
          <ScrollArea className="max-h-[200px]">
            <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md">
              {formatRegexPatterns(job.metadata.regexPatterns)}
            </pre>
          </ScrollArea>
        </div>
      )}

      {/* Other metadata */}
      <ScrollArea className="max-h-[200px]">
        <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">
          {formatMetadata(job.metadata)}
        </pre>
      </ScrollArea>
    </div>
  );
}
