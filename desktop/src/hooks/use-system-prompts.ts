import { useState, useEffect, useCallback } from 'react';
import { 
  SystemPromptResponse, 
  DefaultSystemPrompt, 
  SystemPromptDisplayData
} from '../types/system-prompts';
import { TaskType } from '../types/session-types';
import {
  getSystemPrompt,
  setSystemPrompt,
  resetSystemPrompt,
  getDefaultSystemPrompts,
  hasCustomSystemPrompt,
  getBatchSystemPrompts,
  validateSystemPrompt
} from '../actions/system-prompts.actions';

interface UseSystemPromptOptions {
  sessionId: string;
  taskType: TaskType;
  autoLoad?: boolean;
}

interface UseSystemPromptReturn {
  prompt: SystemPromptResponse | null;
  loading: boolean;
  error: string | null;
  isCustom: boolean;
  refresh: () => Promise<void>;
  update: (newPrompt: string) => Promise<void>;
  reset: () => Promise<void>;
  validate: (prompt: string) => { isValid: boolean; errors: string[] };
}

/**
 * Hook for managing a single system prompt
 */
export function useSystemPrompt({ 
  sessionId, 
  taskType, 
  autoLoad = true 
}: UseSystemPromptOptions): UseSystemPromptReturn {
  const [prompt, setPrompt] = useState<SystemPromptResponse | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId || !taskType) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch both the effective prompt and custom status in parallel
      const [promptResponse, hasCustom] = await Promise.all([
        getSystemPrompt(sessionId, taskType),
        hasCustomSystemPrompt(sessionId, taskType)
      ]);
      
      setPrompt(promptResponse);
      setIsCustom(hasCustom);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load system prompt';
      setError(errorMessage);
      console.error('Error loading system prompt:', {
        sessionId,
        taskType,
        error: err
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, taskType]);

  const update = useCallback(async (newPrompt: string) => {
    if (!sessionId || !taskType) {
      throw new Error('Session ID and task type are required');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await setSystemPrompt(sessionId, taskType, newPrompt);
      // Immediately refresh to get the updated state
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update system prompt';
      setError(errorMessage);
      console.error('Error updating system prompt:', {
        sessionId,
        taskType,
        promptLength: newPrompt.length,
        error: err
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, taskType, refresh]);

  const reset = useCallback(async () => {
    if (!sessionId || !taskType) {
      throw new Error('Session ID and task type are required');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await resetSystemPrompt(sessionId, taskType);
      // Immediately refresh to get the updated state
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset system prompt';
      setError(errorMessage);
      console.error('Error resetting system prompt:', {
        sessionId,
        taskType,
        error: err
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, taskType, refresh]);

  const validate = useCallback((prompt: string) => {
    return validateSystemPrompt(prompt);
  }, []);

  useEffect(() => {
    if (autoLoad) {
      refresh();
    }
  }, [refresh, autoLoad]);

  return {
    prompt,
    loading,
    error,
    isCustom,
    refresh,
    update,
    reset,
    validate
  };
}

interface UseDefaultSystemPromptsReturn {
  defaults: DefaultSystemPrompt[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getDefault: (taskType: TaskType) => DefaultSystemPrompt | undefined;
}

/**
 * Hook for managing default system prompts
 */
export function useDefaultSystemPrompts(): UseDefaultSystemPromptsReturn {
  const [defaults, setDefaults] = useState<DefaultSystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const defaultPrompts = await getDefaultSystemPrompts();
      setDefaults(defaultPrompts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load default system prompts';
      setError(errorMessage);
      console.error('Error loading default system prompts:', {
        error: err,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const getDefault = useCallback((taskType: TaskType) => {
    return defaults.find(d => d.taskType === taskType);
  }, [defaults]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    defaults,
    loading,
    error,
    refresh,
    getDefault
  };
}

interface UseBatchSystemPromptsOptions {
  sessionId: string;
  taskTypes: TaskType[];
  autoLoad?: boolean;
}

interface UseBatchSystemPromptsReturn {
  prompts: Record<TaskType, SystemPromptResponse | null>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getPrompt: (taskType: TaskType) => SystemPromptResponse | null;
}

/**
 * Hook for managing multiple system prompts at once
 */
export function useBatchSystemPrompts({ 
  sessionId, 
  taskTypes, 
  autoLoad = true 
}: UseBatchSystemPromptsOptions): UseBatchSystemPromptsReturn {
  const [prompts, setPrompts] = useState<Record<TaskType, SystemPromptResponse | null>>({} as Record<TaskType, SystemPromptResponse | null>);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId || taskTypes.length === 0) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const batchPrompts = await getBatchSystemPrompts(sessionId, taskTypes);
      setPrompts(batchPrompts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load system prompts';
      setError(errorMessage);
      console.error('Error loading batch system prompts:', {
        sessionId,
        taskTypes,
        taskCount: taskTypes.length,
        error: err
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId, taskTypes]);

  const getPrompt = useCallback((taskType: TaskType) => {
    return prompts[taskType] || null;
  }, [prompts]);

  useEffect(() => {
    if (autoLoad) {
      refresh();
    }
  }, [refresh, autoLoad]);

  return {
    prompts,
    loading,
    error,
    refresh,
    getPrompt
  };
}

/**
 * Utility hook for system prompt display data
 */
export function useSystemPromptDisplayData(
  sessionId: string,
  taskType: TaskType
): SystemPromptDisplayData | null {
  const { prompt, isCustom } = useSystemPrompt({ sessionId, taskType });
  const { getDefault } = useDefaultSystemPrompts();

  if (!prompt) return null;

  const defaultPrompt = getDefault(taskType);
  
  return {
    taskType,
    title: getTaskTypeDisplayName(taskType),
    description: defaultPrompt?.description || `System prompt for ${taskType} tasks`,
    currentPrompt: prompt.systemPrompt,
    isCustom,
    isDefault: !isCustom,
    lastUpdated: undefined // Could be added if needed
  };
}

/**
 * Utility function to get display names for task types
 * Comprehensive mapping of all task types to user-friendly names
 */
export function getTaskTypeDisplayName(taskType: TaskType): string {
  const displayNames: Record<TaskType, string> = {
    // Core AI tasks
    'path_finder': 'Path Finder',
    'text_improvement': 'Text Improvement',
    'guidance_generation': 'Guidance Generation',
    'text_correction': 'Text Correction',
    'implementation_plan': 'Implementation Plan',
    'path_correction': 'Path Correction',
    'task_enhancement': 'Task Enhancement',
    'regex_pattern_generation': 'Regex Pattern Generation',
    'regex_summary_generation': 'Regex Summary Generation',
    'generic_llm_stream': 'Generic LLM Stream',
    'voice_transcription': 'Voice Transcription',
    
    // Workflow tasks
    'file_finder_workflow': 'File Finder Workflow',
    'server_proxy_transcription': 'Server Proxy Transcription',
    'streaming': 'Streaming',
    
    // Workflow stage tasks
    'directory_tree_generation': 'Directory Tree Generation',
    'local_file_filtering': 'Local File Filtering',
    'extended_path_finder': 'Extended Path Finder',
    'extended_path_correction': 'Extended Path Correction',
    'initial_path_finding': 'Initial Path Finding',
    'extended_path_finding': 'Extended Path Finding',
    'initial_path_correction': 'Initial Path Correction',
    'regex_generation': 'Regex Generation',
    
    // Fallback
    'unknown': 'Unknown Task Type'
  };
  
  return displayNames[taskType] || taskType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Hook for validating system prompt changes
 */
export function useSystemPromptValidation() {
  const [isValidating, setIsValidating] = useState(false);
  
  const validatePrompt = useCallback(async (prompt: string) => {
    setIsValidating(true);
    
    try {
      // Basic validation
      const basicValidation = validateSystemPrompt(prompt);
      
      // Could add more advanced validation here (e.g., placeholder checking)
      
      return basicValidation;
    } finally {
      setIsValidating(false);
    }
  }, []);
  
  return {
    validatePrompt,
    isValidating
  };
}