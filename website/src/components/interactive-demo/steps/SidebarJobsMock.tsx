'use client';

import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
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
  icon: React.ReactNode;
  workflowGroup: string;
  isConnectedToPrevious: boolean;
}

function JobCard({ 
  job, 
  isInView, 
  delay: _delay = 0,
  showConnector = false 
}: { 
  job: JobData; 
  isInView: boolean; 
  delay?: number;
  showConnector?: boolean; 
}) {
  const getTargetProgress = () => {
    if (job.status === 'queued') return 0;
    if (job.status === 'running') return 75;
    if (job.status === 'completed') return 100;
    return 0;
  };

  const targetProgress = getTargetProgress();
  const animatedProgress = (isInView && job.status !== 'queued') ? targetProgress : 0;
  const animatedTokens = (isInView && job.status !== 'queued') ? (job.actualTokens || job.estimatedTokens) : 0;

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
      <DesktopCard className="transition-all duration-300 hover:shadow-md max-w-[300px] min-h-[120px]">
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

export function SidebarJobsMock({ isInView }: { isInView: boolean; resetKey?: number }) {
  const { textEnhancementState, videoRecordingState, deepResearchState, fileSearchState } = useInteractiveDemoContext();

  const getTextEnhancementStatus = (): 'queued' | 'running' | 'completed' => {
    if (textEnhancementState === 'idle' || textEnhancementState === 'text-selected') return 'queued';
    if (textEnhancementState === 'processing') return 'running';
    if (textEnhancementState === 'completed') return 'completed';
    return 'queued';
  };

  const getVideoAnalysisStatus = (): 'queued' | 'running' | 'completed' => {
    if (videoRecordingState === 'idle' || videoRecordingState === 'dialog-open' || 
        videoRecordingState === 'capturing' || videoRecordingState === 'recording') return 'queued';
    if (videoRecordingState === 'stopping') return 'running';
    if (videoRecordingState === 'completed') return 'completed';
    return 'queued';
  };

  const getDeepResearchStatus = (): 'queued' | 'running' | 'completed' => {
    if (deepResearchState === 'ready' || deepResearchState === 'idle') return 'queued';
    if (deepResearchState === 'processing') return 'running';
    if (deepResearchState === 'completed') return 'completed';
    return 'queued';
  };

  const getFileFinderJobStatus = (jobId: string): 'queued' | 'running' | 'completed' => {
    // All jobs complete when results are shown
    if (fileSearchState === 'results-shown') return 'completed';
    
    switch (jobId) {
      case 'regex-filter':
        if (fileSearchState === 'ai-finding-regex') return 'running';
        if (['ai-finding-relevance', 'ai-finding-path', 'ai-finding-correction'].includes(fileSearchState)) return 'completed';
        return 'queued';
      case 'relevance-assessment':
        if (fileSearchState === 'ai-finding-relevance') return 'running';
        if (['ai-finding-path', 'ai-finding-correction'].includes(fileSearchState)) return 'completed';
        return 'queued';
      case 'path-finder':
        if (fileSearchState === 'ai-finding-path') return 'running';
        if (fileSearchState === 'ai-finding-correction') return 'completed';
        return 'queued';
      case 'path-correction':
        if (fileSearchState === 'ai-finding-correction') return 'running';
        return 'queued';
      default:
        return 'queued';
    }
  };

  const jobs: JobData[] = [
    {
      id: 'text-enhancement',
      title: 'Text Enhancement',
      model: 'Claude 3.5 Sonnet',
      estimatedTokens: 290,
      actualTokens: 287,
      status: getTextEnhancementStatus(),
      icon: <Sparkles className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    },
    {
      id: 'video-analysis',
      title: 'Video Analysis',
      model: 'GPT-4o Vision',
      estimatedTokens: 18500,
      actualTokens: 17892,
      status: getVideoAnalysisStatus(),
      icon: <Video className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    },
    {
      id: 'deep-research',
      title: 'Deep Research',
      model: 'Claude 3.5 Sonnet',
      estimatedTokens: 5200,
      actualTokens: 4987,
      status: getDeepResearchStatus(),
      icon: <Search className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    },
    {
      id: 'regex-filter',
      title: 'Regex File Filter',
      model: 'Claude 3.5 Sonnet',
      estimatedTokens: 1200,
      actualTokens: 1187,
      status: getFileFinderJobStatus('regex-filter'),
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
      status: getFileFinderJobStatus('relevance-assessment'),
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
      status: getFileFinderJobStatus('path-finder'),
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
      status: getFileFinderJobStatus('path-correction'),
      icon: <FolderOpen className="h-4 w-4" />,
      workflowGroup: 'file-finding',
      isConnectedToPrevious: true
    },
    {
      id: 'code-analysis',
      title: 'Code Analysis',
      model: 'Claude 3.5 Sonnet',
      estimatedTokens: 12500,
      actualTokens: 12347,
      status: 'completed',
      icon: <CheckCircle className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    },
    {
      id: 'implementation-planning',
      title: 'Implementation Planning',
      model: 'GPT-4 Turbo',
      estimatedTokens: 8200,
      actualTokens: 7890,
      status: 'running',
      icon: <Play className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    },
    {
      id: 'code-generation',
      title: 'Code Generation',
      model: 'Claude 3.5 Sonnet',
      estimatedTokens: 15600,
      actualTokens: 15600,
      status: 'queued',
      icon: <Clock className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    },
    {
      id: 'test-suite',
      title: 'Test Suite Creation',
      model: 'GPT-4o',
      estimatedTokens: 6800,
      actualTokens: 6800,
      status: 'queued',
      icon: <Zap className="h-4 w-4" />,
      workflowGroup: '',
      isConnectedToPrevious: false
    }
  ];

  return (
    <div className="space-y-3 overflow-hidden">
      <div className="mb-4">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-1">Background Jobs</h3>
        <p className="text-xs text-muted-foreground">{jobs.length} jobs in queue</p>
      </div>
      
      <div className="space-y-3">
        {jobs.map((job, _index) => {
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
                isInView={isInView} 
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
          <span className="font-mono">~{jobs.reduce((total, job) => total + job.estimatedTokens, 0).toLocaleString()} tokens</span>
        </div>
      </div>
    </div>
  );
}