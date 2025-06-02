import { FileCode } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsAdditionalInfoSection() {
  const { job, parsedMetadata } = useJobDetailsContext();
  const parsedMeta = parsedMetadata;
  const outputPathFromMeta = typeof parsedMeta?.outputPath === 'string' ? parsedMeta.outputPath : null;
  
  if (!outputPathFromMeta && !job.statusMessage) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Additional Information</CardTitle>
        <CardDescription className="text-xs">
          Extra details and file outputs
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {outputPathFromMeta && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">File Output</div>
            <div className="flex items-center gap-2">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <div
                className="text-sm font-medium truncate text-balance text-foreground"
                title={outputPathFromMeta || ""}
              >
                {outputPathFromMeta}
              </div>
            </div>
          </div>
        )}

        {job.statusMessage && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Status Message
            </div>
            <div className="text-sm font-medium text-balance max-h-[100px] overflow-auto text-foreground">
              {job.statusMessage}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
