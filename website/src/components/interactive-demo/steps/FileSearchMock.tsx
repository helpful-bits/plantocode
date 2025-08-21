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
import { DesktopJobCard } from '../desktop-ui/DesktopJobCard';
import { DesktopFilterModeToggle, FilterMode } from '../desktop-ui/DesktopFilterModeToggle';
import { DesktopInput } from '../desktop-ui/DesktopInput';
import { Search, RefreshCw, CheckSquare, Square, Sparkles, Filter, FileCheck, CheckCircle, Loader2, X, Undo2, Redo2, HelpCircle, FileText, ChevronUp, AlertTriangle } from 'lucide-react';
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
    to: 100, 
    durationMs: 2500 
  });
  
  const relevanceProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-relevance', 
    from: 0, 
    to: 100, 
    durationMs: 2500 
  });
  
  const pathProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-path', 
    from: 0, 
    to: 100, 
    durationMs: 2500 
  });
  
  const correctionProgress = useTweenNumber({ 
    active: phaseName === 'ai-finding-correction', 
    from: 0, 
    to: 100, 
    durationMs: 2500 
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
            <DesktopInput
              type="search"
              placeholder="Search files..."
              value={searchTerm}
              disabled={true}
              icon={<Search className="h-4 w-4" />}
              className="pr-20"
            />
            {searchTerm && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
                </span>
                <DesktopButton
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
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border/60">
              <DesktopButton
                variant="outline"
                size="sm"
                disabled={true}
                className="h-6 w-6 p-0"
              >
                <Undo2 className="h-3 w-3" />
              </DesktopButton>
              <DesktopButton
                variant="outline"
                size="sm"
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
            variant="default"
            size="sm"
            disabled={showWorkflow && !correctionComplete}
            className="flex-1 bg-primary hover:bg-primary/90 border-primary hover:border-primary/90 text-primary-foreground font-medium disabled:bg-primary/70 disabled:hover:bg-primary/70 disabled:border-primary/70 disabled:cursor-not-allowed"
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
        <div className="border border-border/60 rounded-lg bg-background/80 h-[450px] overflow-hidden flex flex-col">
          {/* Table Header - Sticky */}
          <div className="flex-shrink-0 px-1 py-1 sm:px-4 sm:py-3 border-b border-border/40 bg-muted/30">
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

      {/* Workflow Cards - Stable height container to prevent layout shifts */}
      <div className="mt-6 min-h-[520px] transition-all duration-300 ease-in-out">
        <div className={cn(
          "relative border border-dashed border-muted-foreground/40 rounded-lg p-[3px] w-fit transition-all duration-300 ease-in-out",
          showWorkflow ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
            
            {/* Workflow Header */}
            <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary/40" />
              File Finding Workflow
            </div>
            
            {/* Regex File Filter Job Card */}
            <div className={cn(
              "transition-all duration-500 ease-in-out min-h-[120px]",
              showWorkflow ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <DesktopJobCard>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex-shrink-0",
                      regexComplete ? "text-green-600" : "text-gray-600"
                    )}>
                      {regexComplete ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <Filter className="h-5 w-5" />
                      )}
                    </div>
                    <span className={cn(
                      "font-medium text-xs",
                      regexComplete ? "text-foreground" : "text-foreground"
                    )}>
                      {regexComplete ? 'Completed' : 'Processing'}
                    </span>
                    <span className="font-medium text-foreground text-xs">
                      Regex File Filter
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <span className="text-muted-foreground text-xs">
                    {regexComplete ? '2 minutes ago' : 'just now'}
                  </span>
                </div>

                {!regexComplete && regexProgress.value > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground text-xs">Filtering by patterns...</span>
                      <span className="text-muted-foreground text-xs font-medium">{Math.floor(regexProgress.value)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                      <div 
                        className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${regexProgress.value}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      Tokens: <span className="text-foreground font-medium">1.2k → 1.1k</span>
                    </span>
                    <span className="text-muted-foreground text-xs">2s</span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    anthropic/claude-sonnet-4-20250514
                  </div>
                </div>

                <div className="flex justify-end">
                  <span className="text-muted-foreground text-xs">
                    $0.002156
                  </span>
                </div>
              </DesktopJobCard>
            </div>

            {/* File Relevance Assessment Job Card */}
            <div className={cn(
              "mt-3 relative min-h-[120px] transition-all duration-500 ease-in-out",
              regexComplete ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-border/60" />
              <DesktopJobCard>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex-shrink-0",
                        relevanceComplete ? "text-green-600" : "text-gray-600"
                      )}>
                        {relevanceComplete ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <FileCheck className="h-5 w-5" />
                        )}
                      </div>
                      <span className={cn(
                        "font-medium text-xs",
                        relevanceComplete ? "text-foreground" : "text-foreground"
                      )}>
                        {relevanceComplete ? 'Completed' : 'Processing'}
                      </span>
                      <span className="font-medium text-foreground text-xs">
                        File Relevance Assessment
                      </span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="text-muted-foreground text-xs">
                      {relevanceComplete ? '90 seconds ago' : 'just now'}
                    </span>
                  </div>

                  {!relevanceComplete && relevanceProgress.value > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Analyzing relevance...</span>
                        <span className="text-muted-foreground text-xs font-medium">{Math.floor(relevanceProgress.value)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${relevanceProgress.value}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        Tokens: <span className="text-foreground font-medium">2.8k → 2.7k</span>
                      </span>
                      <span className="text-muted-foreground text-xs">3s</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      google/gemini-2.5-flash
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <span className="text-muted-foreground text-xs">
                      $0.001892
                    </span>
                  </div>
                </DesktopJobCard>
            </div>

            {/* Extended Path Finder Job Card */}
            <div className={cn(
              "mt-3 relative min-h-[120px] transition-all duration-500 ease-in-out",
              relevanceComplete ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-border/60" />
              <DesktopJobCard>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex-shrink-0",
                        pathComplete ? "text-green-600" : "text-gray-600"
                      )}>
                        {pathComplete ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <Search className="h-5 w-5" />
                        )}
                      </div>
                      <span className={cn(
                        "font-medium text-xs",
                        pathComplete ? "text-foreground" : "text-foreground"
                      )}>
                        {pathComplete ? 'Completed' : 'Processing'}
                      </span>
                      <span className="font-medium text-foreground text-xs">
                        Extended Path Finder
                      </span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="text-muted-foreground text-xs">
                      {pathComplete ? '60 seconds ago' : 'just now'}
                    </span>
                  </div>

                  {!pathComplete && pathProgress.value > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Finding related paths...</span>
                        <span className="text-muted-foreground text-xs font-medium">{Math.floor(pathProgress.value)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${pathProgress.value}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        Tokens: <span className="text-foreground font-medium">3.4k → 3.3k</span>
                      </span>
                      <span className="text-muted-foreground text-xs">4s</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      google/gemini-2.5-flash
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <span className="text-muted-foreground text-xs">
                      $0.003421
                    </span>
                  </div>
                </DesktopJobCard>
            </div>

            {/* Path Correction Job Card */}
            <div className={cn(
              "mt-3 relative min-h-[120px] transition-all duration-500 ease-in-out",
              pathComplete ? "opacity-100 transform translate-y-0" : "opacity-0 transform translate-y-2 pointer-events-none"
            )}>
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-border/60" />
              <DesktopJobCard>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex-shrink-0",
                        correctionComplete ? "text-green-600" : "text-gray-600"
                      )}>
                        {correctionComplete ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                      </div>
                      <span className={cn(
                        "font-medium text-xs",
                        correctionComplete ? "text-foreground" : "text-foreground"
                      )}>
                        {correctionComplete ? 'Completed' : 'Processing'}
                      </span>
                      <span className="font-medium text-foreground text-xs">
                        Path Correction
                      </span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="text-muted-foreground text-xs">
                      {correctionComplete ? '30 seconds ago' : 'just now'}
                    </span>
                  </div>

                  {!correctionComplete && correctionProgress.value > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Correcting path mismatches...</span>
                        <span className="text-muted-foreground text-xs font-medium">{Math.floor(correctionProgress.value)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${correctionProgress.value}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        Tokens: <span className="text-foreground font-medium">2.1k → 2.0k</span>
                      </span>
                      <span className="text-muted-foreground text-xs">2s</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      anthropic/claude-sonnet-4-20250514
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <span className="text-muted-foreground text-xs">
                      $0.001845
                    </span>
                  </div>
                </DesktopJobCard>
            </div>

          </div>
        </div>
    </div>
  );
}

export default FileSearchMock;