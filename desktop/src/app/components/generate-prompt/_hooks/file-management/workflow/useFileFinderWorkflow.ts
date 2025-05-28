import { useState, useCallback, useEffect, useRef } from 'react';
import { useBackgroundJob } from '@/contexts/_hooks/use-background-job';
import {
  FileFinderWorkflowProps,
  FileFinderWorkflowStage,
  FILE_FINDER_WORKFLOW_STAGES,
  FileFinderIntermediateData,
  FileFinderJobType,
  RawRegexPatterns
} from './workflowTypes';
import {
  extractPathsFromPathFinderJobResult,
  validateAndNormalizePathsAgainstMap
} from './stageUtils';
import { runDirectoryTreeStage } from './directoryTreeStage';
import { runRegexPatternGenerationStage } from './regexPatternGenerationStage';
import { performLocalFiltering } from './localFilteringStage';
import { runInitialPathFinderStage } from './initialPathFinderStage';
import { runInitialPathCorrectionStage } from './initialPathCorrectionStage';
import { runExtendedPathFinderStage } from './extendedPathFinderStage';
import { runExtendedPathCorrectionStage } from './extendedPathCorrectionStage';

export function useFileFinderWorkflow(props: FileFinderWorkflowProps) {
  const [currentStage, setCurrentStage] = useState<FileFinderWorkflowStage>(FILE_FINDER_WORKFLOW_STAGES.IDLE);
  const [activeJobId, setActiveJobId] = useState<string | undefined>();
  const [activeJobType, setActiveJobType] = useState<FileFinderJobType>(null);
  const [intermediateData, setIntermediateData] = useState<FileFinderIntermediateData>({
    directoryTreeContent: null,
    rawRegexPatterns: null,
    locallyFilteredFiles: [],
    initialPathFinderResult: { verified: [], unverified: [] },
    initialCorrectedPaths: [],
    extendedPathFinderResult: { verified: [], unverified: [] },
    extendedCorrectedPaths: []
  });
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { job: activeJobResult } = useBackgroundJob(activeJobId ?? null);

  const resetWorkflowState = useCallback(() => {
    setActiveJobId(undefined);
    setActiveJobType(null);
    setIntermediateData({
      directoryTreeContent: null,
      rawRegexPatterns: null,
      locallyFilteredFiles: [],
      initialPathFinderResult: { verified: [], unverified: [] },
      initialCorrectedPaths: [],
      extendedPathFinderResult: { verified: [], unverified: [] },
      extendedCorrectedPaths: []
    });
    setWorkflowError(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const finalizeWorkflow = useCallback((isError: boolean) => {
    setIsWorkflowRunning(false);
    setCurrentStage(isError ? FILE_FINDER_WORKFLOW_STAGES.FAILED : FILE_FINDER_WORKFLOW_STAGES.COMPLETED);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const executeWorkflow = useCallback(async () => {
    setIsWorkflowRunning(true);
    setWorkflowError(null);
    setIntermediateData({
      directoryTreeContent: null,
      rawRegexPatterns: null,
      locallyFilteredFiles: [],
      initialPathFinderResult: { verified: [], unverified: [] },
      initialCorrectedPaths: [],
      extendedPathFinderResult: { verified: [], unverified: [] },
      extendedCorrectedPaths: []
    });

    // Set global timeout
    const effectiveTimeout = props.timeout ?? 180000;
    if (effectiveTimeout > 0) {
      timeoutRef.current = setTimeout(() => {
        setWorkflowError('Workflow timed out');
        finalizeWorkflow(true);
      }, effectiveTimeout);
    }

    try {
      // Start with directory tree generation
      setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.GENERATING_DIR_TREE);
      const directoryTreeContent = await runDirectoryTreeStage(props.projectDirectory);
      
      setIntermediateData(prev => ({ ...prev, directoryTreeContent }));
      
      // Proceed to regex generation
      setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.GENERATING_REGEX);
      const regexJobId = await runRegexPatternGenerationStage(
        props.activeSessionId,
        props.projectDirectory,
        props.taskDescription,
        directoryTreeContent
      );
      
      setActiveJobId(regexJobId);
      setActiveJobType('regexPatternGeneration');
    } catch (error) {
      setWorkflowError(`Failed to start workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      finalizeWorkflow(true);
    }
  }, [props, finalizeWorkflow]);

  // Monitor active job results - Main State Machine
  useEffect(() => {
    if (!activeJobResult || !activeJobId || !activeJobType) return;

    const handleJobCompletion = async () => {
      try {
        switch (currentStage) {

          case FILE_FINDER_WORKFLOW_STAGES.GENERATING_REGEX: {
            // Parse regex patterns from metadata if available and valid, otherwise fall back to response
            let rawRegexPatterns: RawRegexPatterns | null = null;
            if (activeJobResult.status === 'completed') {
              // First, try to use validated JSON from metadata
              if (activeJobResult.metadata?.json_valid && activeJobResult.metadata.parsed_json) {
                rawRegexPatterns = activeJobResult.metadata.parsed_json as RawRegexPatterns;
              } else if (activeJobResult.response) {
                // Fall back to parsing the raw response
                try {
                  rawRegexPatterns = JSON.parse(activeJobResult.response) as RawRegexPatterns;
                } catch {
                  rawRegexPatterns = null;
                }
              }
            }
            
            setIntermediateData(prev => ({ ...prev, rawRegexPatterns }));
            
            // Proceed to local filtering
            setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.LOCAL_FILTERING);
            const locallyFilteredFiles = performLocalFiltering(rawRegexPatterns, props.rawFilesMap);
            setIntermediateData(prev => ({ ...prev, locallyFilteredFiles }));
            
            // Proceed to initial path finder
            setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.INITIAL_PATH_FINDER);
            const pathFinderJobId = await runInitialPathFinderStage(
              props.activeSessionId,
              props.projectDirectory,
              props.taskDescription,
              intermediateData.directoryTreeContent,
              locallyFilteredFiles,
              props.excludedPaths
            );
            
            setActiveJobId(pathFinderJobId);
            setActiveJobType('initialPathFinder');
            break;
          }

          case FILE_FINDER_WORKFLOW_STAGES.INITIAL_PATH_FINDER: {
            if (activeJobResult.status === 'completed') {
              // Extract and validate paths
              const { verified: verifiedPaths, unverified: unverifiedPaths } = extractPathsFromPathFinderJobResult(activeJobResult);
              const validatedVerified = await validateAndNormalizePathsAgainstMap(verifiedPaths, props.projectDirectory, props.rawFilesMap);
              const validatedUnverified = await validateAndNormalizePathsAgainstMap(unverifiedPaths, props.projectDirectory, props.rawFilesMap);
              
              const initialPathFinderResult = {
                verified: validatedVerified,
                unverified: validatedUnverified
              };
              
              setIntermediateData(prev => ({ ...prev, initialPathFinderResult }));
              
              // Replace selection with verified paths
              props.replaceSelection(initialPathFinderResult.verified);
              
              if (initialPathFinderResult.unverified.length > 0) {
                // Proceed to initial path correction
                setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.INITIAL_PATH_CORRECTION);
                const correctionJobId = await runInitialPathCorrectionStage(
                  props.activeSessionId,
                  props.projectDirectory,
                  initialPathFinderResult.unverified,
                  props.taskDescription,
                  intermediateData.directoryTreeContent
                );
                
                setActiveJobId(correctionJobId);
                setActiveJobType('initialPathCorrection');
              } else {
                // Proceed to extended path finder
                setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.EXTENDED_PATH_FINDER);
                const extendedJobId = await runExtendedPathFinderStage(
                  props.activeSessionId,
                  props.projectDirectory,
                  props.taskDescription,
                  intermediateData.directoryTreeContent,
                  initialPathFinderResult.verified,
                  props.excludedPaths
                );
                
                setActiveJobId(extendedJobId);
                setActiveJobType('extendedPathFinder');
              }
            } else {
              setWorkflowError('Initial path finder failed');
              finalizeWorkflow(true);
            }
            break;
          }

          case FILE_FINDER_WORKFLOW_STAGES.INITIAL_PATH_CORRECTION: {
            let initialCorrectedPaths: string[] = [];
            if (activeJobResult.status === 'completed' && activeJobResult.response) {
              const correctedPaths = activeJobResult.response.split('\n').filter((p: string) => p.trim());
              initialCorrectedPaths = await validateAndNormalizePathsAgainstMap(correctedPaths, props.projectDirectory, props.rawFilesMap);
            }
            
            setIntermediateData(prev => ({ ...prev, initialCorrectedPaths }));
            
            // Extend selection with corrected paths
            props.extendSelection(initialCorrectedPaths);
            
            // Proceed to extended path finder
            setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.EXTENDED_PATH_FINDER);
            const currentVerifiedPaths = [
              ...intermediateData.initialPathFinderResult.verified,
              ...initialCorrectedPaths
            ];
            
            const extendedJobId = await runExtendedPathFinderStage(
              props.activeSessionId,
              props.projectDirectory,
              props.taskDescription,
              intermediateData.directoryTreeContent,
              currentVerifiedPaths,
              props.excludedPaths
            );
            
            setActiveJobId(extendedJobId);
            setActiveJobType('extendedPathFinder');
            break;
          }

          case FILE_FINDER_WORKFLOW_STAGES.EXTENDED_PATH_FINDER: {
            if (activeJobResult.status === 'completed') {
              const { verified: verifiedPaths, unverified: unverifiedPaths } = extractPathsFromPathFinderJobResult(activeJobResult);
              const validatedVerified = await validateAndNormalizePathsAgainstMap(verifiedPaths, props.projectDirectory, props.rawFilesMap);
              const validatedUnverified = await validateAndNormalizePathsAgainstMap(unverifiedPaths, props.projectDirectory, props.rawFilesMap);
              
              const extendedPathFinderResult = {
                verified: validatedVerified,
                unverified: validatedUnverified
              };
              
              setIntermediateData(prev => ({ ...prev, extendedPathFinderResult }));
              
              // Extend selection with verified paths
              props.extendSelection(extendedPathFinderResult.verified);
              
              if (extendedPathFinderResult.unverified.length > 0) {
                // Proceed to extended path correction
                setCurrentStage(FILE_FINDER_WORKFLOW_STAGES.EXTENDED_PATH_CORRECTION);
                const correctionJobId = await runExtendedPathCorrectionStage(
                  props.activeSessionId,
                  props.projectDirectory,
                  extendedPathFinderResult.unverified,
                  props.taskDescription,
                  intermediateData.directoryTreeContent
                );
                
                setActiveJobId(correctionJobId);
                setActiveJobType('extendedPathCorrection');
              } else {
                // Workflow complete
                finalizeWorkflow(false);
              }
            } else {
              setWorkflowError('Extended path finder failed');
              finalizeWorkflow(true);
            }
            break;
          }

          case FILE_FINDER_WORKFLOW_STAGES.EXTENDED_PATH_CORRECTION: {
            let extendedCorrectedPaths: string[] = [];
            if (activeJobResult.status === 'completed' && activeJobResult.response) {
              const correctedPaths = activeJobResult.response.split('\n').filter((p: string) => p.trim());
              extendedCorrectedPaths = await validateAndNormalizePathsAgainstMap(correctedPaths, props.projectDirectory, props.rawFilesMap);
            }
            
            setIntermediateData(prev => ({ ...prev, extendedCorrectedPaths }));
            
            // Extend selection with corrected paths
            props.extendSelection(extendedCorrectedPaths);
            
            // Workflow complete
            finalizeWorkflow(false);
            break;
          }

          default:
            break;
        }
      } catch (error) {
        setWorkflowError(`Stage execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        finalizeWorkflow(true);
      }
    };

    if (activeJobResult.status === 'completed' || activeJobResult.status === 'failed') {
      handleJobCompletion();
    }
  }, [activeJobResult, activeJobId, activeJobType, currentStage, props, intermediateData, finalizeWorkflow]);

  return {
    isWorkflowRunning,
    workflowError,
    executeWorkflow,
    currentStage,
    resetWorkflowState
  };
}