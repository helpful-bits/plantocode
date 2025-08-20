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
import { Search, RefreshCw, CheckSquare, Square, Sparkles, Filter, FileCheck, FolderOpen, CheckCircle, Loader2, X, Undo2, Redo2, HelpCircle, FileText, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';

interface FileSearchMockProps {
  isInView: boolean;
  progress: number;
}

type SearchState = 'idle' | 'searching' | 'ai-finding' | 'results-shown';

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

export function FileSearchMock({ isInView, progress }: FileSearchMockProps) {
  const { setFileSearchState } = useInteractiveDemoContext();
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [files, setFiles] = useState(mockFiles);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterMode>('all');
  
  // Workflow job states
  const [regexFilterProgress, setRegexFilterProgress] = useState(0);
  const [relevanceProgress, setRelevanceProgress] = useState(0);
  const [pathFinderProgress, setPathFinderProgress] = useState(0);
  const [correctionProgress, setCorrectionProgress] = useState(0);
  
  const [regexComplete, setRegexComplete] = useState(false);
  const [relevanceComplete, setRelevanceComplete] = useState(false);
  const [pathFinderComplete, setPathFinderComplete] = useState(false);
  const [correctionComplete, setCorrectionComplete] = useState(false);

  const currentState: SearchState = (() => {
    if (!isInView) return 'idle';
    if (progress < 0.2) return 'idle';
    if (progress < 0.3) return 'searching';
    if (progress < 0.8) return 'ai-finding';
    return 'results-shown';
  })();

  // Publish state to context
  useEffect(() => {
    setFileSearchState(currentState);
  }, [currentState, setFileSearchState]);

  // Auto-animation system
  useEffect(() => {
    if (!isInView) {
      setSearchState('idle');
      setSearchTerm('');
      setFiles(mockFiles);
      setShowWorkflow(false);
      setActiveTab('all');
      setRegexFilterProgress(0);
      setRelevanceProgress(0);
      setPathFinderProgress(0);
      setCorrectionProgress(0);
      setRegexComplete(false);
      setRelevanceComplete(false);
      setPathFinderComplete(false);
      setCorrectionComplete(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    let progressInterval: NodeJS.Timeout | null = null;

    const runAnimation = () => {
      // Clear any existing timers
      timers.forEach(timer => clearTimeout(timer));
      timers.length = 0;
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      // Reset state
      setSearchState('idle');
      setSearchTerm('');
      setFiles(mockFiles);
      setShowWorkflow(false);
      setActiveTab('all');
      setRegexFilterProgress(0);
      setRelevanceProgress(0);
      setPathFinderProgress(0);
      setCorrectionProgress(0);
      setRegexComplete(false);
      setRelevanceComplete(false);
      setPathFinderComplete(false);
      setCorrectionComplete(false);

      // Step 1: User types search term (1s)
      timers.push(setTimeout(() => {
        setSearchState('searching');
        setSearchTerm('auth');
      }, 1000));

      // Step 2: Filter files by search term (1.5s)
      timers.push(setTimeout(() => {
        const filteredFiles = mockFiles.filter(file => 
          file.path.toLowerCase().includes('auth')
        );
        setFiles(filteredFiles);
      }, 1500));

      // Step 3: Start AI file finding (3s)
      timers.push(setTimeout(() => {
        setSearchState('ai-finding');
        setShowWorkflow(true);
          
        // Start regex file filter
        let regexProg = 0;
        const regexInterval = setInterval(() => {
          regexProg += 8;
          if (regexProg >= 100) {
            setRegexFilterProgress(100);
            setRegexComplete(true);
            clearInterval(regexInterval);
          } else {
            setRegexFilterProgress(regexProg);
          }
        }, 150);
      }, 3000));

      // Step 4: Start file relevance assessment (5s)
      timers.push(setTimeout(() => {
        let relevanceProg = 0;
        const relevanceInterval = setInterval(() => {
          relevanceProg += 12;
          if (relevanceProg >= 100) {
            setRelevanceProgress(100);
            setRelevanceComplete(true);
            clearInterval(relevanceInterval);
          } else {
            setRelevanceProgress(relevanceProg);
          }
        }, 120);
      }, 5000));

      // Step 5: Start extended path finder (7s)
      timers.push(setTimeout(() => {
        let pathProg = 0;
        const pathInterval = setInterval(() => {
          pathProg += 10;
          if (pathProg >= 100) {
            setPathFinderProgress(100);
            setPathFinderComplete(true);
            clearInterval(pathInterval);
          } else {
            setPathFinderProgress(pathProg);
          }
        }, 130);
      }, 7000));

      // Step 6: Start path correction (9s)
      timers.push(setTimeout(() => {
        let correctionProg = 0;
        const correctionInterval = setInterval(() => {
          correctionProg += 15;
          if (correctionProg >= 100) {
            setCorrectionProgress(100);
            setCorrectionComplete(true);
            clearInterval(correctionInterval);
          } else {
            setCorrectionProgress(correctionProg);
          }
        }, 100);
      }, 9000));

      // Step 7: Show results - select AI-found files and switch to Selected tab (11s)
      timers.push(setTimeout(() => {
        setSearchState('results-shown');
        setFiles(prev => prev.map(f => ({ ...f, included: aiSelectedFiles.includes(f.path) })));
        setActiveTab('selected');
      }, 11000));

      // Step 8: Reset and restart (16s)
      timers.push(setTimeout(() => {
        runAnimation();
      }, 16000));
    };

    runAnimation();

    return () => {
      timers.forEach(timer => clearTimeout(timer));
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [isInView]);


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
          <div className="flex-1 flex items-center gap-2 border border-border/50 rounded-lg bg-background/80 px-2 py-1 sm:px-3 sm:py-2">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {searchTerm && (
              <>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  className="flex-shrink-0 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
          
          {/* Filter Mode Toggle with counts - matching desktop */}
          <div className="w-full sm:w-auto">
            <DesktopFilterModeToggle
              currentMode={activeTab}
              onModeChange={setActiveTab}
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
            disabled={searchState === 'ai-finding'}
            className="flex-1 bg-primary hover:bg-primary/90 border-primary hover:border-primary/90 text-primary-foreground font-medium disabled:bg-primary/70 disabled:hover:bg-primary/70 disabled:border-primary/70 disabled:cursor-not-allowed"
          >
            {searchState === 'ai-finding' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {searchState === 'ai-finding' ? 'Finding Files...' : 'Find Relevant Files'}
          </DesktopButton>
          
          <DesktopButton
            variant="ghost"
            size="sm"
            className="px-2"
            disabled={false}
          >
            <HelpCircle className="h-5 w-5" />
          </DesktopButton>
          
          {searchState === 'ai-finding' && (
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
              <div className="w-9 sm:w-12 flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                <span>Inc</span>
                <span>Exc</span>
              </div>
              
              {/* File Name column */}
              <div className="flex-1 min-w-0">
                <button className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
                  File Name
                  <ChevronUp className="h-3 w-3" />
                </button>
              </div>
              
              {/* Size column */}
              <div className="w-7 flex justify-end">
                <button className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
                  Size
                </button>
              </div>
              
              {/* Modified column */}
              <div className="w-7 sm:w-16 flex justify-end">
                <button className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
                  <span className="sm:hidden">Mod</span>
                  <span className="hidden sm:inline">Modified</span>
                </button>
              </div>
            </div>
          </div>

          {/* Table Body - Scrollable */}
          <div className="flex-1 overflow-auto">
            {searchState === 'idle' && filteredFiles.length === 0 ? (
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
                    <div className="w-9 sm:w-12 flex items-center gap-0.5">
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

      {/* Workflow Cards - Show when AI is finding files */}
      {showWorkflow && (
        <div className="mt-6">
          <div className="relative border border-dashed border-muted-foreground/40 rounded-lg p-[3px] w-fit">
            
            {/* Workflow Header */}
            <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary/40" />
              File Finding Workflow
            </div>
            
            {/* Regex File Filter Job Card */}
            <div className="animate-in slide-in-from-bottom-4 duration-500">
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

                {!regexComplete && regexFilterProgress > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground text-xs">Filtering by patterns...</span>
                      <span className="text-muted-foreground text-xs font-medium">{regexFilterProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                      <div 
                        className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${regexFilterProgress}%` }}
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
            {regexComplete && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 mt-3 relative">
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

                  {!relevanceComplete && relevanceProgress > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Analyzing relevance...</span>
                        <span className="text-muted-foreground text-xs font-medium">{relevanceProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${relevanceProgress}%` }}
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
            )}

            {/* Extended Path Finder Job Card */}
            {relevanceComplete && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 mt-3 relative">
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-3 border-l-2 border-dashed border-border/60" />
                <DesktopJobCard>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex-shrink-0",
                        pathFinderComplete ? "text-green-600" : "text-gray-600"
                      )}>
                        {pathFinderComplete ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <Search className="h-5 w-5" />
                        )}
                      </div>
                      <span className={cn(
                        "font-medium text-xs",
                        pathFinderComplete ? "text-foreground" : "text-foreground"
                      )}>
                        {pathFinderComplete ? 'Completed' : 'Processing'}
                      </span>
                      <span className="font-medium text-foreground text-xs">
                        Extended Path Finder
                      </span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="text-muted-foreground text-xs">
                      {pathFinderComplete ? '60 seconds ago' : 'just now'}
                    </span>
                  </div>

                  {!pathFinderComplete && pathFinderProgress > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Finding related paths...</span>
                        <span className="text-muted-foreground text-xs font-medium">{pathFinderProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${pathFinderProgress}%` }}
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
            )}

            {/* Path Correction Job Card */}
            {pathFinderComplete && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 mt-3 relative">
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
                          <FolderOpen className="h-5 w-5" />
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

                  {!correctionComplete && correctionProgress > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-xs">Validating paths...</span>
                        <span className="text-muted-foreground text-xs font-medium">{correctionProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
                        <div 
                          className="bg-gray-600 h-1 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${correctionProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        Tokens: <span className="text-foreground font-medium">1.8k → 1.7k</span>
                      </span>
                      <span className="text-muted-foreground text-xs">2s</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      google/gemini-2.5-flash
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <span className="text-muted-foreground text-xs">
                      $0.001243
                    </span>
                  </div>
                </DesktopJobCard>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}