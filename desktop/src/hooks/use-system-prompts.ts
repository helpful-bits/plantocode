import { useState, useEffect, useCallback } from 'react';
import { 
  SystemPromptResponse, 
  DefaultSystemPrompt, 
  TaskType,
  SystemPromptDisplayData
} from '../types/system-prompts';
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
    if (!sessionId || !taskType) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [promptResponse, hasCustom] = await Promise.all([
        getSystemPrompt(sessionId, taskType),
        hasCustomSystemPrompt(sessionId, taskType)
      ]);
      
      setPrompt(promptResponse);
      setIsCustom(hasCustom);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load system prompt';
      setError(errorMessage);
      console.error('Error loading system prompt:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, taskType]);

  const update = useCallback(async (newPrompt: string) => {
    if (!sessionId || !taskType) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await setSystemPrompt(sessionId, taskType, newPrompt);
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update system prompt';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, taskType, refresh]);

  const reset = useCallback(async () => {
    if (!sessionId || !taskType) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await resetSystemPrompt(sessionId, taskType);
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset system prompt';
      setError(errorMessage);
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
      console.error('Error loading default system prompts:', err);
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
    if (!sessionId || taskTypes.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const batchPrompts = await getBatchSystemPrompts(sessionId, taskTypes);
      setPrompts(batchPrompts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load system prompts';
      setError(errorMessage);
      console.error('Error loading batch system prompts:', err);
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
 */
function getTaskTypeDisplayName(taskType: TaskType): string {
  const displayNames: Record<TaskType, string> = {
    'path_finder': 'Path Finder',
    'text_improvement': 'Text Improvement',
    'guidance_generation': 'Guidance Generation',
    'text_correction': 'Text Correction',
    'implementation_plan': 'Implementation Plan',
    'path_correction': 'Path Correction',
    'task_enhancement': 'Task Enhancement',
    'regex_pattern_generation': 'Regex Pattern Generation',
    'regex_summary_generation': 'Regex Summary Generation',
    'generic_llm_stream': 'Generic LLM Stream'
  };
  
  return displayNames[taskType] || taskType;
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