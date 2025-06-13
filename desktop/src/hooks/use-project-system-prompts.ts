import { useState, useEffect, useCallback } from 'react';
import { TaskType } from '../types/task-type-defs';
import {
  getProjectSystemPrompt,
  setProjectSystemPrompt,
  resetProjectSystemPrompt,
  validateSystemPrompt
} from '../actions/project-system-prompts.actions';
import { getDefaultSystemPrompt } from '../actions/system-prompts.actions';

interface UseProjectSystemPromptOptions {
  projectDirectory: string;
  taskType: TaskType;
  autoLoad?: boolean;
}

interface UseProjectSystemPromptReturn {
  prompt: string | null;
  loading: boolean;
  error: string | null;
  isCustom: boolean;
  refresh: () => Promise<void>;
  update: (newPrompt: string) => Promise<void>;
  reset: () => Promise<void>;
  validate: (prompt: string) => { isValid: boolean; errors: string[] };
}

/**
 * Hook for managing a single system prompt at project level
 */
export function useProjectSystemPrompt({ 
  projectDirectory, 
  taskType, 
  autoLoad = true 
}: UseProjectSystemPromptOptions): UseProjectSystemPromptReturn {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectDirectory || !taskType) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    setPrompt(null); // Clear previous state immediately
    
    try {
      const projectPrompt = await getProjectSystemPrompt(projectDirectory, taskType);
      
      if (projectPrompt !== null) {
        setPrompt(projectPrompt);
        setIsCustom(true);
      } else {
        // Get default prompt directly from server (no caching)
        try {
          const defaultPrompt = await getDefaultSystemPrompt(taskType);
          if (defaultPrompt) {
            // Try both field name formats (server might use either snake_case or camelCase)
            const promptText = defaultPrompt.system_prompt !== undefined ? defaultPrompt.system_prompt : 
                              defaultPrompt.systemPrompt !== undefined ? defaultPrompt.systemPrompt : '';
            setPrompt(promptText);
          } else {
            setPrompt('');
          }
          setIsCustom(false);
        } catch (error) {
          console.error('Failed to load default system prompt:', error);
          setPrompt('');
          setIsCustom(false);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load system prompt';
      setError(errorMessage);
      console.error('Error loading project system prompt:', {
        projectDirectory,
        taskType,
        error: err
      });
    } finally {
      setLoading(false);
    }
  }, [projectDirectory, taskType]);

  const update = useCallback(async (newPrompt: string) => {
    if (!projectDirectory || !taskType) {
      throw new Error('Project directory and task type are required');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await setProjectSystemPrompt(projectDirectory, taskType, newPrompt);
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update system prompt';
      setError(errorMessage);
      console.error('Error updating project system prompt:', {
        projectDirectory,
        taskType,
        promptLength: newPrompt.length,
        error: err
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectDirectory, taskType, refresh]);

  const reset = useCallback(async () => {
    if (!projectDirectory || !taskType) {
      throw new Error('Project directory and task type are required');
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await resetProjectSystemPrompt(projectDirectory, taskType);
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset system prompt';
      setError(errorMessage);
      console.error('Error resetting project system prompt:', {
        projectDirectory,
        taskType,
        error: err
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectDirectory, taskType, refresh]);

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