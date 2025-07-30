import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsVideoSection() {
  const { job, parsedMetadata } = useJobDetailsContext();
  const [isOpen, setIsOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only render for video_analysis jobs
  if (job.taskType !== "video_analysis") {
    return null;
  }

  // Extract video path from metadata - check multiple locations
  const videoPath = (parsedMetadata as any)?.videoPath || 
                   (parsedMetadata as any)?.taskData?.videoPath || 
                   (parsedMetadata as any)?.additionalParams?.videoPath ||
                   (parsedMetadata as any)?.jobPayloadForWorker?.VideoAnalysis?.video_path ||
                   (parsedMetadata as any)?.jobPayloadForWorker?.videoAnalysis?.video_path ||
                   null;

  useEffect(() => {
    const loadVideoUrl = async () => {
      if (!videoPath) {
        setError("No video path found in job metadata");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        // Convert the local file path to a URL that can be loaded in the browser
        const url = await convertFileSrc(videoPath);
        setVideoUrl(url);
      } catch (err) {
        console.error("Failed to convert video path:", err);
        setError("Failed to load video file");
      } finally {
        setIsLoading(false);
      }
    };

    loadVideoUrl();
  }, [videoPath]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Card className="cursor-pointer hover:bg-accent/30 transition-all duration-200">
          <CardHeader className="py-4 px-6 group">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 group-hover:text-foreground/80 transition-colors">
                  <span>Video Preview</span>
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground/80 mt-1">
                  Analyzed video recording
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isOpen ? 
                  <ChevronUp className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" /> : 
                  <ChevronDown className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                }
              </div>
            </div>
          </CardHeader>
        </Card>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <CardContent className="pt-0 px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 bg-muted/20 rounded-md">
              <span className="text-sm text-muted-foreground">Loading video...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 bg-destructive/10 rounded-md gap-2">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
              {videoPath && (
                <span className="text-xs text-muted-foreground mt-2">Path: {videoPath}</span>
              )}
            </div>
          ) : videoUrl ? (
            <div className="rounded-md overflow-hidden bg-black">
              <video
                controls
                className="w-full max-h-[500px]"
                src={videoUrl}
              >
                <p className="text-sm text-muted-foreground p-4">
                  Your browser does not support the video tag.
                </p>
              </video>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-muted/20 rounded-md">
              <span className="text-sm text-muted-foreground">No video available</span>
            </div>
          )}
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  );
}