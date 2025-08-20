/* Desktop Parity Mapping:
 * Sources: desktop/src/app/components/background-jobs-sidebar/background-jobs-sidebar.tsx, job-card.tsx
 * Classes: border border-border/60, bg-card, text-xs, dashed connectors via .workflow-group-start/.workflow-job
 * Order: regex_file_filter → file_relevance_assessment → extended_path_finder → path_correction
 */
// Step 8: Background jobs sidebar with animated job cards showing queued → running → completed states
'use client';

import { useState, useEffect } from 'react';
import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { useAnimatedNumber } from '../hooks/useScrollOrchestration';
import { Clock, Play, CheckCircle, Zap, Sparkles, Video, Filter, Search, FolderOpen, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';


interface JobData {
  id: string;
  title: string;
  model: string;
  estimatedTokens: number;
  actualTokens: number;
  status: 'queued' | 'running' | 'completed';
  progress: number;
  icon: React.ReactNode;
  workflowGroup: string;
  isConnectedToPrevious: boolean;
}

const jobsData: JobData[] = [
  {
    id: '0',
    title: 'Text Enhancement',
    model: 'Claude 3.5 Sonnet',
    estimatedTokens: 290,
    actualTokens: 287,
    status: 'queued',
    progress: 0,
    icon: <Sparkles className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  },
  {
    id: 'video',
    title: 'Video Analysis',
    model: 'GPT-4o Vision',
    estimatedTokens: 18500,
    actualTokens: 17892,
    status: 'queued',
    progress: 0,
    icon: <Video className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  },
  // File Finding Workflow Group
  {
    id: 'regex-filter',
    title: 'Regex File Filter',
    model: 'Claude 3.5 Sonnet',
    estimatedTokens: 1200,
    actualTokens: 1187,
    status: 'queued',
    progress: 0,
    icon: <Filter className="h-4 w-4" />,
    workflowGroup: 'file-finding',
    isConnectedToPrevious: false
  },
  {
    id: 'relevance-assessment',
    title: 'File Relevance Assessment',
    model: 'Gemini 1.5 Flash',
    estimatedTokens: 2800,
    actualTokens: 2756,
    status: 'queued',
    progress: 0,
    icon: <FileCheck className="h-4 w-4" />,
    workflowGroup: 'file-finding',
    isConnectedToPrevious: true
  },
  {
    id: 'path-finder',
    title: 'Extended Path Finder',
    model: 'Gemini 1.5 Flash',
    estimatedTokens: 3400,
    actualTokens: 3298,
    status: 'queued',
    progress: 0,
    icon: <Search className="h-4 w-4" />,
    workflowGroup: 'file-finding',
    isConnectedToPrevious: true
  },
  {
    id: 'path-correction',
    title: 'Path Correction',
    model: 'Gemini 1.5 Flash',
    estimatedTokens: 1800,
    actualTokens: 1743,
    status: 'queued',
    progress: 0,
    icon: <FolderOpen className="h-4 w-4" />,
    workflowGroup: 'file-finding',
    isConnectedToPrevious: true
  },
  {
    id: '1',
    title: 'Code Analysis',
    model: 'Claude 3.5 Sonnet',
    estimatedTokens: 12500,
    actualTokens: 12347,
    status: 'completed',
    progress: 100,
    icon: <CheckCircle className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  },
  {
    id: '2',
    title: 'Implementation Planning',
    model: 'GPT-4 Turbo',
    estimatedTokens: 8200,
    actualTokens: 7890,
    status: 'running',
    progress: 75,
    icon: <Play className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  },
  {
    id: '3',
    title: 'Code Generation',
    model: 'Claude 3.5 Sonnet',
    estimatedTokens: 15600,
    actualTokens: 15600,
    status: 'queued',
    progress: 0,
    icon: <Clock className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  },
  {
    id: '4',
    title: 'Test Suite Creation',
    model: 'GPT-4o',
    estimatedTokens: 6800,
    actualTokens: 6800,
    status: 'queued',
    progress: 0,
    icon: <Zap className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  },
];

function JobCard({ 
  job, 
  isActive, 
  progress,
  delay: _delay = 0,
  showConnector = false 
}: { 
  job: JobData; 
  isActive: boolean; 
  progress: number;
  delay?: number;
  showConnector?: boolean; 
}) {
  // Compute target progress based on job status and scroll progress
  const getTargetProgress = () => {
    if (job.status === 'queued') return 0;
    if (job.status === 'completed') return 100;
    // For running jobs, clamp to 75% max
    return Math.min(Math.max(Math.round(progress * 100), 0), 75);
  };

  const targetProgress = getTargetProgress();
  const animatedProgress = useAnimatedNumber(
    targetProgress, 
    isActive && job.status !== 'queued'
  );
  
  const animatedTokens = useAnimatedNumber(
    job.actualTokens || job.estimatedTokens, 
    isActive && job.status !== 'queued'
  );

  const getStatusBadgeVariant = () => {
    switch (job.status) {
      case 'completed': return 'success';
      case 'running': return 'warning';
      case 'queued': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusText = () => {
    switch (job.status) {
      case 'completed': return 'Completed';
      case 'running': return 'Running';
      case 'queued': return 'Queued';
      default: return 'Unknown';
    }
  };

  return (
    <div className="relative">
      {showConnector && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-border/60" />
      )}
      <DesktopCard className="transition-all duration-300 hover:shadow-md max-w-[300px]">
      <DesktopCardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "transition-colors duration-300",
              job.status === 'completed' && "text-green-600",
              job.status === 'running' && "text-yellow-600",
              job.status === 'queued' && "text-gray-500"
            )}>
              {job.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-xs sm:text-sm truncate">{job.title}</h4>
              <p className="text-xs text-muted-foreground truncate">{job.model}</p>
            </div>
          </div>
          <DesktopBadge variant={getStatusBadgeVariant()} className="text-xs">
            {getStatusText()}
          </DesktopBadge>
        </div>
        
        {job.status !== 'queued' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-muted-foreground">Progress</span>
              <span className="text-xs sm:text-sm font-mono">{animatedProgress}%</span>
            </div>
            <DesktopProgress 
              value={animatedProgress} 
              variant={job.status === 'completed' ? 'success' : 'default'}
            />
          </div>
        )}
        
        <div className="flex justify-between items-center mt-3 pt-2 border-t border-border">
          <span className="text-xs sm:text-sm text-muted-foreground">Tokens</span>
          <span className="text-xs sm:text-sm font-mono">
            {job.status === 'queued' 
              ? `~${job.estimatedTokens.toLocaleString()}`
              : `${animatedTokens.toLocaleString()}`
            }
          </span>
        </div>
      </DesktopCardContent>
    </DesktopCard>
    </div>
  );
}

export function SidebarJobsMock({ isInView, progress }: { isInView: boolean; progress: number }) {
  const { textEnhancementState, videoRecordingState, deepResearchState, fileSearchState } = useInteractiveDemoContext();
  
  const [textEnhancementJob, setTextEnhancementJob] = useState(jobsData[0] || {
    id: '0',
    title: 'Text Enhancement',
    model: 'Claude 3.5 Sonnet',
    estimatedTokens: 290,
    actualTokens: 287,
    status: 'queued' as const,
    progress: 0,
    icon: <Sparkles className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  });
  const [videoAnalysisJob, setVideoAnalysisJob] = useState(jobsData[1] || {
    id: 'video',
    title: 'Video Analysis',
    model: 'GPT-4o Vision',
    estimatedTokens: 18500,
    actualTokens: 17892,
    status: 'queued' as const,
    progress: 0,
    icon: <Video className="h-4 w-4" />,
    workflowGroup: '',
    isConnectedToPrevious: false
  });
  
  const [regexFilterJob, setRegexFilterJob] = useState(() => {
    const job = jobsData.find(job => job.id === 'regex-filter');
    if (!job) throw new Error('regex-filter job not found');
    return job;
  });
  const [relevanceAssessmentJob, setRelevanceAssessmentJob] = useState(() => {
    const job = jobsData.find(job => job.id === 'relevance-assessment');
    if (!job) throw new Error('relevance-assessment job not found');
    return job;
  });
  const [pathFinderJob, setPathFinderJob] = useState(() => {
    const job = jobsData.find(job => job.id === 'path-finder');
    if (!job) throw new Error('path-finder job not found');
    return job;
  });
  const [pathCorrectionJob, setPathCorrectionJob] = useState(() => {
    const job = jobsData.find(job => job.id === 'path-correction');
    if (!job) throw new Error('path-correction job not found');
    return job;
  });
  
  useEffect(() => {
    switch (videoRecordingState) {
      case 'idle':
      case 'dialog-open':
      case 'capturing':
      case 'recording':
        setVideoAnalysisJob({
          id: jobsData[1]?.id ?? 'video',
          title: jobsData[1]?.title ?? 'Video Analysis',
          model: jobsData[1]?.model ?? 'GPT-4o Vision',
          estimatedTokens: jobsData[1]?.estimatedTokens ?? 18500,
          actualTokens: jobsData[1]?.actualTokens ?? 17892,
          status: 'queued' as const,
          progress: 0,
          icon: jobsData[1]?.icon ?? <Video className="h-4 w-4" />,
          workflowGroup: jobsData[1]?.workflowGroup ?? '',
          isConnectedToPrevious: jobsData[1]?.isConnectedToPrevious ?? false
        });
        break;
      case 'stopping':
        setVideoAnalysisJob({
          id: jobsData[1]?.id ?? 'video',
          title: jobsData[1]?.title ?? 'Video Analysis',
          model: jobsData[1]?.model ?? 'GPT-4o Vision',
          estimatedTokens: jobsData[1]?.estimatedTokens ?? 18500,
          actualTokens: jobsData[1]?.actualTokens ?? 17892,
          status: 'running',
          progress: 35,
          icon: jobsData[1]?.icon ?? <Video className="h-4 w-4" />,
          workflowGroup: jobsData[1]?.workflowGroup ?? '',
          isConnectedToPrevious: jobsData[1]?.isConnectedToPrevious ?? false
        });
        break;
      case 'completed':
        setVideoAnalysisJob({
          id: jobsData[1]?.id ?? 'video',
          title: jobsData[1]?.title ?? 'Video Analysis',
          model: jobsData[1]?.model ?? 'GPT-4o Vision',
          estimatedTokens: jobsData[1]?.estimatedTokens ?? 18500,
          actualTokens: 17892,
          status: 'completed',
          progress: 100,
          icon: jobsData[1]?.icon ?? <Video className="h-4 w-4" />,
          workflowGroup: jobsData[1]?.workflowGroup ?? '',
          isConnectedToPrevious: jobsData[1]?.isConnectedToPrevious ?? false
        });
        break;
    }
  }, [videoRecordingState]);

  useEffect(() => {
    switch (textEnhancementState) {
      case 'idle':
      case 'text-selected':
        setTextEnhancementJob({
          id: jobsData[0]?.id ?? '0',
          title: jobsData[0]?.title ?? 'Text Enhancement',
          model: jobsData[0]?.model ?? 'Claude 3.5 Sonnet',
          estimatedTokens: jobsData[0]?.estimatedTokens ?? 290,
          actualTokens: jobsData[0]?.actualTokens ?? 287,
          status: 'queued' as const,
          progress: 0,
          icon: jobsData[0]?.icon ?? <Sparkles className="h-4 w-4" />,
          workflowGroup: jobsData[0]?.workflowGroup ?? '',
          isConnectedToPrevious: jobsData[0]?.isConnectedToPrevious ?? false
        });
        break;
      case 'processing':
        setTextEnhancementJob(prev => ({
          id: prev.id,
          title: prev.title,
          model: prev.model,
          estimatedTokens: prev.estimatedTokens,
          actualTokens: prev.actualTokens,
          status: 'running',
          progress: Math.min((prev.progress ?? 0) + 3, 95),
          icon: prev.icon,
          workflowGroup: prev.workflowGroup,
          isConnectedToPrevious: prev.isConnectedToPrevious
        }));
        break;
      case 'completed':
        setTextEnhancementJob({
          id: jobsData[0]?.id ?? '0',
          title: jobsData[0]?.title ?? 'Text Enhancement',
          model: jobsData[0]?.model ?? 'Claude 3.5 Sonnet',
          estimatedTokens: jobsData[0]?.estimatedTokens ?? 290,
          actualTokens: 287,
          status: 'completed',
          progress: 100,
          icon: jobsData[0]?.icon ?? <Sparkles className="h-4 w-4" />,
          workflowGroup: jobsData[0]?.workflowGroup ?? '',
          isConnectedToPrevious: jobsData[0]?.isConnectedToPrevious ?? false
        });
        break;
    }
  }, [textEnhancementState]);

  useEffect(() => {
    const resetJob = (originalJob: JobData) => ({
      id: originalJob.id,
      title: originalJob.title,
      model: originalJob.model,
      estimatedTokens: originalJob.estimatedTokens,
      actualTokens: originalJob.actualTokens,
      status: 'queued' as const,
      progress: 0,
      icon: originalJob.icon,
      workflowGroup: originalJob.workflowGroup,
      isConnectedToPrevious: originalJob.isConnectedToPrevious
    });
    
    const regexJob = jobsData.find(job => job.id === 'regex-filter');
    const relevanceJob = jobsData.find(job => job.id === 'relevance-assessment');
    const pathJob = jobsData.find(job => job.id === 'path-finder');
    const correctionJob = jobsData.find(job => job.id === 'path-correction');
    
    switch (deepResearchState) {
      case 'idle':
      case 'ready':
        if (regexJob) setRegexFilterJob(resetJob(regexJob));
        if (relevanceJob) setRelevanceAssessmentJob(resetJob(relevanceJob));
        if (pathJob) setPathFinderJob(resetJob(pathJob));
        if (correctionJob) setPathCorrectionJob(resetJob(correctionJob));
        break;
      case 'processing':
        if (regexJob) {
          setRegexFilterJob({
            ...regexJob,
            actualTokens: 1187,
            status: 'running',
            progress: 85
          });
        }
        if (relevanceJob) setRelevanceAssessmentJob(resetJob(relevanceJob));
        if (pathJob) setPathFinderJob(resetJob(pathJob));
        if (correctionJob) setPathCorrectionJob(resetJob(correctionJob));
        break;
      case 'completed':
        if (regexJob) {
          setRegexFilterJob({
            ...regexJob,
            actualTokens: 1187,
            status: 'completed',
            progress: 100
          });
        }
        if (relevanceJob) {
          setRelevanceAssessmentJob({
            ...relevanceJob,
            actualTokens: 2756,
            status: 'completed',
            progress: 100
          });
        }
        if (pathJob) {
          setPathFinderJob({
            ...pathJob,
            actualTokens: 3298,
            status: 'completed',
            progress: 100
          });
        }
        if (correctionJob) {
          setPathCorrectionJob({
            ...correctionJob,
            actualTokens: 1743,
            status: 'completed',
            progress: 100
          });
        }
        break;
    }
  }, [deepResearchState]);
  
  useEffect(() => {
    switch (fileSearchState) {
      case 'idle':
        break;
      case 'searching':
        break;
      case 'ai-finding':
        break;
      case 'results-shown':
        break;
    }
  }, [fileSearchState]);
  
  // Update jobs data with current states
  const updatedJobsData = jobsData.map(job => {
    if (job.id === '0') {
      return textEnhancementJob;
    }
    if (job.id === 'video') {
      return videoAnalysisJob;
    }
    if (job.id === 'regex-filter') {
      return regexFilterJob;
    }
    if (job.id === 'relevance-assessment') {
      return relevanceAssessmentJob;
    }
    if (job.id === 'path-finder') {
      return pathFinderJob;
    }
    if (job.id === 'path-correction') {
      return pathCorrectionJob;
    }
    return job;
  });
  return (
    <div className="space-y-3 overflow-hidden">
      <div className="mb-4">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-1">Background Jobs</h3>
        <p className="text-xs text-muted-foreground">{updatedJobsData.length} jobs in queue</p>
      </div>
      
      <div className="space-y-3">
        {updatedJobsData.map((job, _index) => {
          if (!job) return null;
          
          // Check if this is a File Finding workflow job
          const isFileFinderJob = job.workflowGroup === 'file-finding';
          const isFirstInGroup = isFileFinderJob && !job.isConnectedToPrevious;
          const showConnector = isFileFinderJob && job.isConnectedToPrevious;
          
          return (
            <div key={job.id} className={cn(
              isFileFinderJob && "workflow-job",
              isFirstInGroup && "workflow-group-start"
            )}>
              {isFirstInGroup && (
                <div className="workflow-group-header">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary/40" />
                    File Finding Workflow
                  </div>
                </div>
              )}
              <JobCard 
                job={job} 
                isActive={isInView && progress > 0.2} 
                progress={progress}
                delay={_index * 500}
                showConnector={showConnector}
              />
            </div>
          );
        })}
      </div>
      
      <div className="pt-2 border-t border-border">
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-muted-foreground">Total estimated</span>
          <span className="font-mono">~{updatedJobsData.reduce((total, job) => total + (job?.estimatedTokens ?? 0), 0).toLocaleString()} tokens</span>
        </div>
      </div>
    </div>
  );
}