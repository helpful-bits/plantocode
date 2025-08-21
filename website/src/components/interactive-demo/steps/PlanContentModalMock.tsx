/* Desktop Parity Mapping:
 * Sources: PlanContentModal.tsx; ui/progress.tsx; ui/virtualized-code-viewer.tsx
 * Classes: progress h-2, viewer header chips (outline), content bg-muted/30 border-border rounded-lg font-mono; header right-aligned status/percent
 */
// Plan Content Modal Mock - displays implementation plan content in a modal
'use client';

import { useState } from 'react';
import { Copy, Check, X, Clock } from 'lucide-react';
import { 
  DesktopDialog, 
  DesktopDialogContent, 
  DesktopDialogHeader, 
  DesktopDialogTitle,
} from '../desktop-ui/DesktopDialog';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { DesktopCodeViewer } from '../desktop-ui/DesktopCodeViewer';


const mockPlanContent = `// Implementation Plan A: Component-Based Architecture

## 1. Core Component Structure

\`\`\`typescript
// src/components/JobManager/JobManager.tsx
interface Job {
  id: string;
  type: 'analysis' | 'planning' | 'generation' | 'testing';
  status: 'queued' | 'running' | 'completed' | 'failed';
  model: string;
  tokens: number;
  progress: number;
}

export const JobManager: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  
  return (
    <div className="job-manager">
      <JobQueue jobs={jobs} />
      <JobDetails activeJobId={activeJob} />
    </div>
  );
};
\`\`\`

## 2. Job Processing Service

\`\`\`typescript
// src/services/JobProcessingService.ts
class JobProcessingService {
  async processJob(job: Job): Promise<JobResult> {
    const processor = this.getProcessor(job.type);
    return await processor.execute(job);
  }
  
  private getProcessor(type: Job['type']): JobProcessor {
    switch(type) {
      case 'analysis': return new AnalysisProcessor();
      case 'planning': return new PlanningProcessor();
      case 'generation': return new GenerationProcessor();
      case 'testing': return new TestingProcessor();
    }
  }
}
\`\`\`

## 3. Real-time Updates Hook

\`\`\`typescript
// src/hooks/useJobProgress.ts
export const useJobProgress = (jobId: string) => {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const socket = new WebSocket('/api/jobs/stream');
    
    socket.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (update.jobId === jobId) {
        setProgress(update.progress);
      }
    };
    
    return () => socket.close();
  }, [jobId]);
  
  return progress;
};
\`\`\`

## 4. Testing Strategy

- Unit tests for all processors
- Integration tests for job workflow  
- E2E tests for streaming functionality
- Performance tests for large token volumes`;

interface PlanContentModalMockProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planTitle?: string;
  isStreaming?: boolean;
}

function CopyButton({ content, label }: { content: string; label: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <DesktopButton
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={handleCopy}
    >
      {isCopied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          {label}
        </>
      )}
    </DesktopButton>
  );
}

export function PlanContentModalMock({ 
  open, 
  onOpenChange, 
  planTitle = "Plan A: Component-Based Architecture",
  isStreaming = false
}: PlanContentModalMockProps) {
  if (!open) return null;

  const formatCompletionDate = () => {
    const date = new Date();
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <DesktopDialog open={open}>
      <DesktopDialogContent className="max-w-6xl h-[95vh] flex flex-col">
        <DesktopDialogHeader className="flex flex-row items-start justify-between space-y-0 pb-2 flex-shrink-0">
          <DesktopDialogTitle className="text-lg">
            Implementation Plan: {planTitle}
          </DesktopDialogTitle>
          
          <div className="flex items-start gap-2">
            {/* Status */}
            <div className="text-sm text-muted-foreground min-w-[200px] flex justify-center">
              {isStreaming ? (
                <span className="flex items-center">
                  <Clock className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                  Generating plan...
                </span>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm text-muted-foreground">100%</span>
                  </div>
                  <span>Completed</span>
                  <span className="text-xs">
                    {formatCompletionDate()}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Claude 3.5 Sonnet
                  </span>
                </div>
              )}
            </div>

            {/* Copy Buttons */}
            {!isStreaming && (
              <div className="flex gap-2">
                <CopyButton content={mockPlanContent} label="Full Plan" />
                <CopyButton content="// Selected step content..." label="Step" />
              </div>
            )}

            <DesktopButton
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </DesktopButton>
          </div>
        </DesktopDialogHeader>

        {/* Progress bar for streaming */}
        {isStreaming && (
          <div className="mb-2 flex-shrink-0">
            <DesktopProgress value={85} className="h-2" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Generating implementation plan...</span>
              <span>85%</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          <DesktopCodeViewer
            content={mockPlanContent}
            languageLabel="markdown"
            className="h-full"
            isStreaming={isStreaming}
            showCopy={false}
          />
        </div>

        {/* Status/metadata row */}
        {!isStreaming && (
          <div className="mt-2 pt-2 border-t border-border flex-shrink-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Completed {formatCompletionDate()}</span>
              <span>Claude 3.5 Sonnet</span>
            </div>
          </div>
        )}
      </DesktopDialogContent>
    </DesktopDialog>
  );
}