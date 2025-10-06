/* Desktop Parity Mapping:
 * Sources: desktop/src/app/components/generate-prompt/file-browser.tsx
 * Classes: border border-border/60, bg-background/95, flex items-center gap-4
 * Structure: Search input + filter toggles + file list + AI Find button
 */
// Step 8: File Search & AI Find - Shows file browser with intelligent file discovery
'use client';

import { useState, useEffect } from 'react';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopCheckbox } from '../desktop-ui/DesktopCheckbox';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { DesktopFilterModeToggle, FilterMode } from '../desktop-ui/DesktopFilterModeToggle';
import { DesktopInput } from '../desktop-ui/DesktopInput';
import { Search, RefreshCw, CheckSquare, Square, Sparkles, Filter, FileCheck, CheckCircle, Loader2, X, Undo2, Redo2, HelpCircle, FileText, ChevronUp, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';
import { useTimedCycle, useTweenNumber } from '../hooks';

interface FileSearchMockProps {
  isInView: boolean;
  resetKey?: number;
}


const mockFiles = [
  { path: 'src/components/auth/LoginForm.tsx', included: false, excluded: false, size: 2150, sizeDisplay: '2.1KB', type: 'tsx', modified: new Date(Date.now() - 1000 * 60 * 60 * 2) },
  { path: 'src/components/auth/SignupForm.tsx', included: false, excluded: false, size: 2867, sizeDisplay: '2.8KB', type: 'tsx', modified: new Date(Date.now() - 1000 * 60 * 60 * 4) },
  { path: 'src/hooks/useAuth.ts', included: false, excluded: false, size: 1229, sizeDisplay: '1.2KB', type: 'ts', modified: new Date(Date.now() - 1000 * 60 * 60 * 6) },
  { path: 'src/contexts/AuthContext.tsx', included: false, excluded: false, size: 3481, sizeDisplay: '3.4KB', type: 'tsx', modified: new Date(Date.now() - 1000 * 60 * 60 * 8) },
  { path: 'src/utils/authHelpers.ts', included: false, excluded: false, size: 1843, sizeDisplay: '1.8KB', type: 'ts', modified: new Date(Date.now() - 1000 * 60 * 60 * 12) },
  { path: 'src/middleware/auth.ts', included: false, excluded: false, size: 2252, sizeDisplay: '2.2KB', type: 'ts', modified: new Date(Date.now() - 1000 * 60 * 60 * 18) },
];

const aiSelectedFiles = [
  'src/components/auth/LoginForm.tsx',
  'src/hooks/useAuth.ts',
  'src/contexts/AuthContext.tsx',
  'src/middleware/auth.ts',
];

// Define phases outside component to prevent recreation on each render
const FILE_SEARCH_PHASES = [
  { name: 'idle', durationMs: 800 },           // Brief initial state
  { name: 'typing', durationMs: 2000 },       // Typing search query (reduced from 2500ms)
  { name: 'filtering', durationMs: 600 },     // Quick filtering (reduced from 800ms)
  { name: 'ai-finding-regex', durationMs: 1800 },      // AI regex generation (reduced from 2500ms)
  { name: 'ai-finding-relevance', durationMs: 1800 },  // AI relevance assessment (reduced from 2500ms)
  { name: 'ai-finding-path', durationMs: 1800 },       // AI path finding (reduced from 2500ms)
  { name: 'ai-finding-correction', durationMs: 1800 }, // AI correction (reduced from 2500ms)
  { name: 'results-shown', durationMs: 2000 }, // Time to see results (reduced from 2500ms)
  { name: 'wait', durationMs: 1000 },         // Brief pause (reduced from 1200ms)
];

export function FileSearchMock({ isInView }: FileSearchMockProps) {
  const { setFileSearchState } = useInteractiveDemoContext();
  const [files, setFiles] = useState(mockFiles);
  
  const { phaseName, phaseProgress01 } = useTimedCycle({ 
    active: isInView, 
    phases: FILE_SEARCH_PHASES, 
    loop: true, 
    resetOnDeactivate: true 
  });
  
  const searchTerm = phaseName === 'idle' ? '' : 
    phaseName === 'typing' ? 'auth'.slice(0, Math.floor(phaseProgress01 * 4)) : 'auth';
  
  const showWorkflow = ['ai-finding-regex', 'ai-finding-relevance', 'ai-finding-path', 'ai-finding-correction', 'results-shown'].includes(phaseName);
  const activeTab: FilterMode = phaseName === 'results-shown' ? 'selected' : 'all';
  
  const regexProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-regex', 
    from: 0, 
    to: 95, 
    durationMs: 1600,
    loop: true 
  });
  
  const relevanceProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-relevance', 
    from: 0, 
    to: 95, 
    durationMs: 1600,
    loop: true 
  });
  
  const pathProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-path', 
    from: 0, 
    to: 95, 
    durationMs: 1600,
    loop: true 
  });
  
  const correctionProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-correction', 
    from: 0, 
    to: 95, 
    durationMs: 1600,
    loop: true 
  });
  
  // Token streaming animations for each job
  const regexTokens = useTweenNumber({ 
    active: phaseName === 'ai-finding-regex', 
    from: 1200, 
    to: 2300, // 1200 input + 1100 output
    durationMs: 1600,
    loop: true 
  });
  
  const relevanceTokens = useTweenNumber({ 
    active: phaseName === 'ai-finding-relevance', 
    from: 2800, 
    to: 5500, // 2800 input + 2700 output
    durationMs: 1600,
    loop: true 
  });
  
  const pathTokens = useTweenNumber({ 
    active: phaseName === 'ai-finding-path', 
    from: 3400, 
    to: 6700, // 3400 input + 3300 output
    durationMs: 1600,
    loop: true 
  });
  
  const correctionTokens = useTweenNumber({ 
    active: phaseName === 'ai-finding-correction', 
    from: 2100, 
    to: 4100, // 2100 input + 2000 output
    durationMs: 1600,
    loop: true 
  });
  
  const regexComplete = ['ai-finding-relevance', 'ai-finding-path', 'ai-finding-correction', 'results-shown'].includes(phaseName);
  const relevanceComplete = ['ai-finding-path', 'ai-finding-correction', 'results-shown'].includes(phaseName);
  const pathComplete = ['ai-finding-correction', 'results-shown'].includes(phaseName);
  const correctionComplete = phaseName === 'results-shown';

  useEffect(() => {
    setFileSearchState(phaseName as any);
  }, [phaseName, setFileSearchState]);

  useEffect(() => {
    if (phaseName === 'filtering' || !isInView) {
      if (!isInView) {
        setFiles(mockFiles);
      } else {
        const filteredFiles = mockFiles.filter(file => 
          file.path.toLowerCase().includes('auth')
        );
        setFiles(filteredFiles);
      }
    } else if (phaseName === 'results-shown') {
      setFiles(prev => prev.map(f => ({ ...f, included: aiSelectedFiles.includes(f.path) })));
    }
  }, [phaseName, isInView]);


  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    if (diffInDays > 0) return `${diffInDays}d`;
    if (diffInHours > 0) return `${diffInHours}h`;
    if (diffInMinutes > 0) return `${diffInMinutes}m`;
    return `${diffInSeconds}s`;
  };

  // Filter files based on active tab
  const getFilteredFiles = () => {
    if (activeTab === 'selected') {
      return files.filter(file => file.included);
    }
    return files;
  };

  const filteredFiles = getFilteredFiles();

  return (
    <div className="w-full px-1 sm:px-0">
        {/* Search and Filter Controls - Row 1 */}
        <div className="flex flex-col gap-4 px-0 pt-2 sm:px-0 sm:pt-0 sm:flex-row sm:items-center mb-2 sm:mb-4">
          <div className="flex-1 relative">
            <div className="relative grow border border-[oklch(0.90_0.04_195_/_0.5)] rounded-lg bg-background/80 backdrop-blur-sm focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-ring/50 transition-all duration-200 hover:border-[oklch(0.90_0.04_195_/_0.7)]">
              <DesktopInput
                type="search"
                placeholder="Search files..."
                value={searchTerm}
                disabled={true}
                icon={<Search className="h-4 w-4" />}
                className="border-0 bg-transparent focus-visible:ring-0 pr-20"
              />
              {searchTerm && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
                  </span>
                  <DesktopButton
                    compact
                    variant="ghost"
                    size="xs"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    title="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </DesktopButton>
                </div>
              )}
            </div>
          </div>
          
          {/* Filter Mode Toggle with counts - matching desktop */}
          <div className="w-full sm:w-auto">
            <DesktopFilterModeToggle
              currentMode={activeTab}
              onModeChange={() => {}}
              includedCount={files.filter(f => f.included).length}
              totalCount={mockFiles.length}
            />
          </div>
        </div>

        {/* Action Controls - Row 2 */}
        <div className="flex items-center justify-between px-0 sm:px-0 mb-2 sm:mb-4">
          <div className="flex items-center gap-2">
            {/* Select/Deselect All */}
            <div className="flex items-center gap-1">
              <DesktopButton
                variant="outline"
                size="sm"
                disabled={files.length === 0}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Select
              </DesktopButton>
              <DesktopButton
                variant="outline"
                size="sm"
                disabled={!files.filter(f => f.included).length}
              >
                <Square className="h-4 w-4 mr-1" />
                Deselect
              </DesktopButton>
            </div>
            
            {/* Undo/Redo buttons */}
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[oklch(0.90_0.04_195_/_0.3)]">
              <DesktopButton
                compact
                variant="outline"
                size="xs"
                disabled={true}
                className="h-6 w-6 p-0"
              >
                <Undo2 className="h-3 w-3" />
              </DesktopButton>
              <DesktopButton
                compact
                variant="outline"
                size="xs"
                disabled={true}
                className="h-6 w-6 p-0"
              >
                <Redo2 className="h-3 w-3" />
              </DesktopButton>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <DesktopButton
              variant="outline"
              size="sm"
            >
              <RefreshCw className="h-4 w-4" />
            </DesktopButton>
          </div>
        </div>

        {/* AI Find Button - Full width like original */}
        <div className="flex items-center gap-2 px-0 pb-2 sm:px-0 sm:pb-4 mb-2 sm:mb-4">
          <DesktopButton 
            variant="outline"
            size="sm"
            disabled={showWorkflow && !correctionComplete}
            className="flex-1 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showWorkflow && !correctionComplete ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {showWorkflow && !correctionComplete ? 'Finding Files...' : 'Find Relevant Files'}
          </DesktopButton>
          
          <DesktopButton
            variant="ghost"
            size="sm"
            className="px-2"
            disabled={false}
          >
            <HelpCircle className="h-5 w-5" />
          </DesktopButton>
          
          {showWorkflow && !correctionComplete && (
            <DesktopButton
              variant="outline"
              size="sm"
            >
              Cancel
            </DesktopButton>
          )}
        </div>

        {/* File table with sticky header */}
        <div className="border border-[oklch(0.90_0.04_195_/_0.4)] rounded-lg bg-background/80 h-[450px] overflow-hidden flex flex-col">
          {/* Table Header - Sticky */}
          <div className="flex-shrink-0 px-1 py-1 sm:px-4 sm:py-3 border-b border-[oklch(0.90_0.04_195_/_0.2)] bg-muted/30">
            <div className="flex items-center gap-2">
              {/* Select/Exclude columns */}
              <div className="w-12 sm:w-14 flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                <span>Inc</span>
                <span>Exc</span>
              </div>
              
              {/* File Name column */}
              <div className="flex-1 min-w-0">
                <DesktopButton
                  variant="ghost"
                  size="xs"
                  className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary h-auto p-0"
                >
                  File Name
                  <ChevronUp className="h-3 w-3" />
                </DesktopButton>
              </div>
              
              {/* Size column */}
              <div className="w-7 flex justify-end">
                <DesktopButton
                  variant="ghost"
                  size="xs"
                  className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary h-auto p-0"
                >
                  Size
                </DesktopButton>
              </div>
              
              {/* Modified column */}
              <div className="w-7 sm:w-16 flex justify-end">
                <DesktopButton
                  variant="ghost"
                  size="xs"
                  className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary h-auto p-0"
                >
                  <span className="sm:hidden">Mod</span>
                  <span className="hidden sm:inline">Modified</span>
                </DesktopButton>
              </div>
            </div>
          </div>

          {/* Table Body - Scrollable */}
          <div className="flex-1 overflow-auto">
            {phaseName === 'idle' && filteredFiles.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />
                    <span>Finding Files... (can be expensive)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-1 sm:p-2">
                {filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className={cn(
                      "flex items-center gap-2 text-xs py-1 px-1 sm:py-2 sm:px-2 rounded transition-colors",
                      file.included && !file.excluded ? "bg-primary/5 file-row-selected" : "",
                      file.excluded ? "opacity-60" : "hover:bg-accent/20"
                    )}
                  >
                    {/* Select/Exclude columns */}
                    <div className="w-12 sm:w-14 flex items-center gap-0.5">
                      {/* Include checkbox */}
                      <DesktopCheckbox
                        checked={file.included}
                        disabled={file.excluded}
                      />

                      {/* Exclude checkbox */}
                      <DesktopCheckbox
                        checked={file.excluded}
                        className="destructive"
                      />
                    </div>

                    {/* File Name column */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground hidden sm:block" />
                      <span
                        className={cn(
                          "font-mono flex-1 truncate text-foreground",
                          file.excluded ? "line-through text-muted-foreground/80" : ""
                        )}
                        title={file.path}
                      >
                        {(() => {
                          const pathParts = file.path.split('/');
                          const fileName = pathParts.pop() || '';
                          const dirPath = pathParts.join('/');
                          return dirPath ? (
                            <>
                              <span className="opacity-60 text-xs text-muted-foreground">{dirPath}/</span>
                              <span className="font-semibold text-foreground">{fileName}</span>
                            </>
                          ) : fileName;
                        })()}
                      </span>
                    </div>

                    {/* Size column */}
                    <div className="w-7 text-right">
                      <span className="text-muted-foreground text-xs font-mono">
                        {file.sizeDisplay}
                      </span>
                    </div>

                    {/* Modified column */}
                    <div className="w-7 sm:w-16 text-right">
                      <span className="text-muted-foreground text-xs">
                        {formatTimeAgo(file.modified)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* Workflow Cards - Natural height container */}
      <div className="mt-6 transition-all duration-300 ease-in-out">
        <div className={cn(
          "relative border border-dashed border-muted-foreground/40 rounded-lg p-[3px] w-fit transition-all duration-300 ease-in-out",
          showWorkflow ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
            
            {/* Workflow Header */}
            <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary/40" />
              File Finding Workflow
            </div>
            
            {/* Regex File Filter Job Card - EXACT match to desktop */}
            <div className={cn(
              "transition-all duration-500 ease-in-out",
              showWorkflow ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div
                className={cn(
                  "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-[320px] overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
                )}
                role="button"
                tabIndex={0}
              >
                {/* TOP ROW: Icon + Job Name + Badge | Close Button */}
                <div className="flex items-center justify-between mb-2 w-full min-w-0">
                  <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                    <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
                      {regexComplete ? (
                        <CheckCircle className="h-3 w-3 text-success" />
                      ) : regexProgress.value > 0 ? (
                        <Loader2 className="h-3 w-3 text-primary animate-spin" />
                      ) : (
                        <Filter className="h-3 w-3 text-info" />
                      )}
                    </span>
                    <span className="truncate text-foreground">Regex File Filter</span>
                    <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                      Regex File Filter
                    </DesktopBadge>
                  </div>
                  <div className="w-6 h-6 flex-shrink-0">
                    <DesktopButton
                      variant="ghost"
                      size="xs"
                      className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </DesktopButton>
                  </div>
                </div>

                {/* TIME ROW */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
                  <span>{regexComplete ? 'just now' : regexProgress.value > 0 ? 'just now' : 'just now'}</span>
                </div>

                {/* PROGRESS BAR (only for running jobs) */}
                {!regexComplete && regexProgress.value > 0 && (
                  <div className="mt-2 mb-1">
                    <DesktopProgress value={regexProgress.value} className="h-1" />
                    <div className="flex justify-between items-center min-w-0 overflow-hidden">
                      <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                        Generating regex patterns for file filtering...
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                        {Math.round(regexProgress.value)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* TOKEN/MODEL INFO */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between  w-full min-w-0">
                  <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                    <span className="flex items-center gap-1 overflow-hidden min-w-0">
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">1.2K</span>
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                        {phaseName === 'ai-finding-regex' ? 
                          ((regexTokens.value - 1200) / 1000).toFixed(1) + 'K' : '1.1K'}
                      </span>
                    </span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-full" title="anthropic/claude-sonnet-4-5-20250929">
                      anthropic/claude-sonnet-4-5-20250929
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                    {regexComplete ? '2.3s' : '-'}
                  </span>
                </div>

                {/* BOTTOM SECTION: Results + Cost */}
                <div className="flex-1 flex flex-col justify-end">
                  <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                        <span className="font-medium text-foreground">
                          {regexComplete ? '18 files found' : 'Filtering files...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-[9px] text-foreground">
                          {/* Only show cost after job completes */}
                          {regexComplete && '$0.002156'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* File Relevance Assessment Job Card - EXACT match to desktop */}
            <div className={cn(
              "mt-3 relative transition-all duration-500 ease-in-out",
              regexComplete ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-[oklch(0.90_0.04_195_/_0.6)]" />
              <div
                className={cn(
                  "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-[320px] overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
                )}
                role="button"
                tabIndex={0}
              >
                {/* TOP ROW: Icon + Job Name + Badge | Close Button */}
                <div className="flex items-center justify-between mb-2 w-full min-w-0">
                  <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                    <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
                      {relevanceComplete ? (
                        <CheckCircle className="h-3 w-3 text-success" />
                      ) : relevanceProgress.value > 0 ? (
                        <Loader2 className="h-3 w-3 text-primary animate-spin" />
                      ) : (
                        <FileCheck className="h-3 w-3 text-info" />
                      )}
                    </span>
                    <span className="truncate text-foreground">File Relevance Assessment</span>
                    <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                      File Relevance Assessment
                    </DesktopBadge>
                  </div>
                  <div className="w-6 h-6 flex-shrink-0">
                    <DesktopButton
                      variant="ghost"
                      size="xs"
                      className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </DesktopButton>
                  </div>
                </div>

                {/* TIME ROW */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
                  <span>{relevanceComplete ? 'just now' : relevanceProgress.value > 0 ? 'just now' : 'just now'}</span>
                </div>

                {/* PROGRESS BAR (only for running jobs) */}
                {!relevanceComplete && relevanceProgress.value > 0 && (
                  <div className="mt-2 mb-1">
                    <DesktopProgress value={relevanceProgress.value} className="h-1" />
                    <div className="flex justify-between items-center min-w-0 overflow-hidden">
                      <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                        Analyzing file relevance for task context...
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                        {Math.round(relevanceProgress.value)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* TOKEN/MODEL INFO */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between  w-full min-w-0">
                  <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                    <span className="flex items-center gap-1 overflow-hidden min-w-0">
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">2.8K</span>
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                        {phaseName === 'ai-finding-relevance' ? 
                          ((relevanceTokens.value - 2800) / 1000).toFixed(1) + 'K' : '2.7K'}
                      </span>
                    </span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-full" title="google/gemini-2.5-flash">
                      google/gemini-2.5-flash
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                    {relevanceComplete ? '3.1s' : '-'}
                  </span>
                </div>

                {/* BOTTOM SECTION: Results + Cost */}
                <div className="flex-1 flex flex-col justify-end">
                  <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                        <span className="font-medium text-foreground">
                          {relevanceComplete ? '12 relevant files identified' : 'Assessing relevance...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-[9px] text-foreground">
                          {/* Only show cost after job completes */}
                          {relevanceComplete && '$0.001892'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Extended Path Finder Job Card - EXACT match to desktop */}
            <div className={cn(
              "mt-3 relative transition-all duration-500 ease-in-out",
              relevanceComplete ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-[oklch(0.90_0.04_195_/_0.6)]" />
              <div
                className={cn(
                  "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-[320px] overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
                )}
                role="button"
                tabIndex={0}
              >
                {/* TOP ROW: Icon + Job Name + Badge | Close Button */}
                <div className="flex items-center justify-between mb-2 w-full min-w-0">
                  <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                    <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
                      {pathComplete ? (
                        <CheckCircle className="h-3 w-3 text-success" />
                      ) : pathProgress.value > 0 ? (
                        <Loader2 className="h-3 w-3 text-primary animate-spin" />
                      ) : (
                        <Search className="h-3 w-3 text-info" />
                      )}
                    </span>
                    <span className="truncate text-foreground">Extended Path Finder</span>
                    <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                      Extended Path Finder
                    </DesktopBadge>
                  </div>
                  <div className="w-6 h-6 flex-shrink-0">
                    <DesktopButton
                      variant="ghost"
                      size="xs"
                      className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </DesktopButton>
                  </div>
                </div>

                {/* TIME ROW */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
                  <span>{pathComplete ? 'just now' : pathProgress.value > 0 ? 'just now' : 'just now'}</span>
                </div>

                {/* PROGRESS BAR (only for running jobs) */}
                {!pathComplete && pathProgress.value > 0 && (
                  <div className="mt-2 mb-1">
                    <DesktopProgress value={pathProgress.value} className="h-1" />
                    <div className="flex justify-between items-center min-w-0 overflow-hidden">
                      <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                        Discovering related file paths and dependencies...
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                        {Math.round(pathProgress.value)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* TOKEN/MODEL INFO */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between  w-full min-w-0">
                  <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                    <span className="flex items-center gap-1 overflow-hidden min-w-0">
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">3.4K</span>
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                        {phaseName === 'ai-finding-path' ? 
                          ((pathTokens.value - 3400) / 1000).toFixed(1) + 'K' : '3.3K'}
                      </span>
                    </span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-full" title="google/gemini-2.5-flash">
                      google/gemini-2.5-flash
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                    {pathComplete ? '4.2s' : '-'}
                  </span>
                </div>

                {/* BOTTOM SECTION: Results + Cost */}
                <div className="flex-1 flex flex-col justify-end">
                  <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                        <span className="font-medium text-foreground">
                          {pathComplete ? '8 additional paths discovered' : 'Searching paths...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-[9px] text-foreground">
                          {/* Only show cost after job completes */}
                          {pathComplete && '$0.003421'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Path Correction Job Card - EXACT match to desktop */}
            <div className={cn(
              "mt-3 relative transition-all duration-500 ease-in-out",
              pathComplete ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-[oklch(0.90_0.04_195_/_0.6)]" />
              <div
                className={cn(
                  "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-[320px] overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
                )}
                role="button"
                tabIndex={0}
              >
                {/* TOP ROW: Icon + Job Name + Badge | Close Button */}
                <div className="flex items-center justify-between mb-2 w-full min-w-0">
                  <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                    <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
                      {correctionComplete ? (
                        <CheckCircle className="h-3 w-3 text-success" />
                      ) : correctionProgress.value > 0 ? (
                        <Loader2 className="h-3 w-3 text-primary animate-spin" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-warning" />
                      )}
                    </span>
                    <span className="truncate text-foreground">Path Correction</span>
                    <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                      Path Correction
                    </DesktopBadge>
                  </div>
                  <div className="w-6 h-6 flex-shrink-0">
                    <DesktopButton
                      variant="ghost"
                      size="xs"
                      className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </DesktopButton>
                  </div>
                </div>

                {/* TIME ROW */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
                  <span>{correctionComplete ? 'just now' : correctionProgress.value > 0 ? 'just now' : 'just now'}</span>
                </div>

                {/* PROGRESS BAR (only for running jobs) */}
                {!correctionComplete && correctionProgress.value > 0 && (
                  <div className="mt-2 mb-1">
                    <DesktopProgress value={correctionProgress.value} className="h-1" />
                    <div className="flex justify-between items-center min-w-0 overflow-hidden">
                      <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                        Correcting path mismatches and typos...
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                        {Math.round(correctionProgress.value)}%
                      </p>
                    </div>
                  </div>
                )}

                {/* TOKEN/MODEL INFO */}
                <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between  w-full min-w-0">
                  <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                    <span className="flex items-center gap-1 overflow-hidden min-w-0">
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">2.1K</span>
                      <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                      <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                        {phaseName === 'ai-finding-correction' ? 
                          ((correctionTokens.value - 2100) / 1000).toFixed(1) + 'K' : '2.0K'}
                      </span>
                    </span>
                    <span className="text-[9px] text-muted-foreground truncate max-w-full" title="google/gemini-2.5-flash">
                      google/gemini-2.5-flash
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                    {correctionComplete ? '2.1s' : '-'}
                  </span>
                </div>

                {/* BOTTOM SECTION: Results + Cost */}
                <div className="flex-1 flex flex-col justify-end">
                  <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                        <span className="font-medium text-foreground">
                          {correctionComplete ? '3 path corrections applied' : 'Correcting paths...'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono text-[9px] text-foreground">
                          {/* Only show cost after job completes */}
                          {correctionComplete && '$0.001845'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
    </div>
  );
}

export default FileSearchMock;