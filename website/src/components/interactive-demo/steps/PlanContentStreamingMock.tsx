/* Desktop Parity Mapping:
 * Sources: PlanContentModal.tsx; ui/progress.tsx; ui/virtualized-code-viewer.tsx
 * Classes: progress h-2, viewer header chips (outline), content bg-muted/30 border-border rounded-lg font-mono; header right-aligned status/percent
 */
// Step 10: Inline plan content panel with streaming implementation details
'use client';

import { DesktopCard, DesktopCardContent, DesktopCardHeader, DesktopCardTitle } from '../desktop-ui/DesktopCard';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { useTimedLoop, useTypewriter } from '../hooks';
import { FileCode, Layers, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const implementationContent = `// Implementation Plan A: Component-Based Architecture

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
    const eventSource = new EventSource('/api/jobs/stream');
    
    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (update.jobId === jobId) {
        setProgress(update.progress);
      }
    };
    
    return () => eventSource.close();
  }, [jobId]);
  
  return progress;
};
\`\`\`

## 4. File Structure

\`\`\`
src/
├── components/
│   ├── JobManager/
│   │   ├── JobManager.tsx
│   │   ├── JobQueue.tsx
│   │   ├── JobCard.tsx
│   │   └── JobDetails.tsx
│   └── PlanViewer/
│       ├── PlanCards.tsx
│       ├── PlanContent.tsx
│       └── PlanComparison.tsx
├── services/
│   ├── JobProcessingService.ts
│   ├── ModelService.ts
│   └── StreamingService.ts
├── hooks/
│   ├── useJobProgress.ts
│   ├── useStreamingContent.ts
│   └── usePlanGeneration.ts
└── types/
    ├── Job.ts
    ├── Plan.ts
    └── Model.ts
\`\`\`

## 5. Testing Strategy

- Unit tests for all processors
- Integration tests for job workflow
- E2E tests for streaming functionality
- Performance tests for large token volumes`;

interface ContentSection {
  title: string;
  icon: React.ReactNode;
  lines: number;
}

const contentSections: ContentSection[] = [
  { title: 'Component Structure', icon: <Layers className="h-4 w-4" />, lines: 20 },
  { title: 'Processing Service', icon: <Settings className="h-4 w-4" />, lines: 15 },
  { title: 'Real-time Hooks', icon: <FileCode className="h-4 w-4" />, lines: 18 },
  { title: 'File Organization', icon: <FileCode className="h-4 w-4" />, lines: 12 },
  { title: 'Testing Strategy', icon: <Settings className="h-4 w-4" />, lines: 8 },
];

export function PlanContentStreamingMock({ isInView }: { isInView: boolean; resetKey?: number }) {
  // Use timing-based animations
  const { t } = useTimedLoop(isInView, 14000, { resetOnDeactivate: true });
  const { displayText, isDone } = useTypewriter({
    active: isInView,
    text: implementationContent,
    durationMs: 9000
  });
  
  const progress = isDone || t >= 0.8 ? 100 : Math.round((displayText.length / implementationContent.length) * 100);

  // Show button click pulse for first part of cycle
  const showClickPulse = t > 0.1 && t < 0.25;
  const autoExpandContent = t >= 0.25;

  // Conditional rendering after all hooks are called
  if (!autoExpandContent) {
    return (
      <div className="flex items-center justify-center py-8">
        <DesktopButton
          variant="default"
          size="md"
          className={cn(
            "transition-all duration-300",
            showClickPulse && "ring-4 ring-primary/30 scale-105 animate-pulse"
          )}
          disabled
        >
          View Plan Content
        </DesktopButton>
      </div>
    );
  }

  return (
    <DesktopCard className="bg-background">
      <DesktopCardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <DesktopCardTitle className="text-sm flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Plan A: Component-Based Architecture
          </DesktopCardTitle>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full transition-colors duration-300",
              progress < 100 ? "bg-yellow-500 animate-pulse" : "bg-green-500"
            )} />
            <span className="text-sm text-muted-foreground">
              {progress}%
            </span>
          </div>
        </div>
        <DesktopProgress 
          value={progress} 
          variant={progress === 100 ? 'success' : 'default'}
          className="h-2 mt-2"
        />
      </DesktopCardHeader>

      <DesktopCardContent className="pt-0 max-h-80 overflow-y-auto">
        {/* Content Sections Overview */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {contentSections.map((section, index) => {
            const sectionProgress = Math.max(0, Math.min(100, 
              ((displayText.length - (index * 200)) / 200) * 100
            ));
            
            return (
              <div 
                key={section.title}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md border transition-all duration-300",
                  sectionProgress > 50 ? "bg-muted/50 border-primary/20" : "bg-background border-[oklch(0.90_0.04_195_/_0.3)]"
                )}
              >
                <div className={cn(
                  "transition-colors duration-300",
                  sectionProgress > 50 ? "text-primary" : "text-muted-foreground"
                )}>
                  {section.icon}
                </div>
                <div>
                  <div className="text-xs font-medium">{section.title}</div>
                  <div className="text-xs text-muted-foreground">{section.lines} lines</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Code Viewer Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">markdown</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{displayText.length} chars</span>
            {isInView && t > 0.1 && displayText.length < implementationContent.length && (
              <span className="text-primary">Streaming</span>
            )}
          </div>
        </div>

        {/* Streaming Content */}
        <div className="relative">
          <pre className="text-xs bg-muted/30 rounded-lg border border-[oklch(0.90_0.04_195_/_0.3)] p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
            {displayText}
            {isInView && t > 0.1 && displayText.length < implementationContent.length && (
              <span className="animate-pulse text-primary">|</span>
            )}
          </pre>
          
          {/* Completion overlay */}
          {progress === 100 && (
            <div className="absolute inset-0 bg-green-500/5 rounded-lg border border-green-500/20 pointer-events-none transition-opacity duration-500" />
          )}
        </div>

        {/* Footer Stats */}
        <div className="mt-4 pt-3 border-t border-[oklch(0.90_0.04_195_/_0.2)]">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Characters</span>
              <div className="font-mono">{displayText.length.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Estimated tokens</span>
              <div className="font-mono">{Math.floor(displayText.length / 4).toLocaleString()}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Time elapsed</span>
              <div className="font-mono">
                {progress === 100 ? '2m 15s' : `${Math.floor(progress / 10)}s`}
              </div>
            </div>
          </div>
        </div>
      </DesktopCardContent>
    </DesktopCard>
  );
}