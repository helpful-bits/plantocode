import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type TaskType } from '@/types/task-type-defs';

interface ProjectSystemPrompt {
  projectHash: string;
  taskType: string;
  systemPrompt: string;
  isCustom: boolean;
  createdAt: number;
  updatedAt: number;
}

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
  update: (newPrompt: string) => Promise<void>;
  reset: () => Promise<void>;
  validate: (prompt: string) => { isValid: boolean; errors: string[] };
}

export function useProjectSystemPrompt({
  projectDirectory,
  taskType,
  autoLoad = true
}: UseProjectSystemPromptOptions): UseProjectSystemPromptReturn {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const loadPrompt = useCallback(async () => {
    if (!projectDirectory || !taskType) return;

    setLoading(true);
    setError(null);

    try {
      // Check if custom prompt exists
      const customPromptObj = await invoke<ProjectSystemPrompt | null>('get_project_system_prompt_command', {
        projectDirectory,
        taskType
      });

      if (customPromptObj) {
        // Use custom prompt from database
        setPrompt(customPromptObj.systemPrompt);
        setIsCustom(true);
      } else {
        // Load default system prompt from server
        const serverSystemPrompts = await invoke<string>('get_server_default_system_prompts_command');
        const systemPromptsMap = JSON.parse(serverSystemPrompts);
        const defaultPrompt = systemPromptsMap[taskType];
        setPrompt(defaultPrompt?.systemPrompt || '');
        setIsCustom(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system prompt');
      setPrompt(null);
      setIsCustom(false);
    } finally {
      setLoading(false);
    }
  }, [projectDirectory, taskType]);

  const update = useCallback(async (newPrompt: string) => {
    if (!projectDirectory || !taskType) throw new Error('Project directory and task type required');

    await invoke('set_project_system_prompt_command', {
      projectDirectory,
      taskType,
      systemPrompt: newPrompt
    });

    setPrompt(newPrompt);
    setIsCustom(true);
    setError(null);
  }, [projectDirectory, taskType]);

  const reset = useCallback(async () => {
    if (!projectDirectory || !taskType) throw new Error('Project directory and task type required');

    await invoke('reset_project_system_prompt_command', {
      projectDirectory,
      taskType
    });

    // Reload to get default prompt
    await loadPrompt();
  }, [projectDirectory, taskType, loadPrompt]);

  const validate = useCallback((promptToValidate: string) => {
    const errors: string[] = [];

    if (!promptToValidate.trim()) {
      errors.push('System prompt cannot be empty');
    }

    if (promptToValidate.length > 10000) {
      errors.push('System prompt is too long (max 10,000 characters)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  useEffect(() => {
    if (autoLoad && projectDirectory && taskType) {
      loadPrompt();
    }
  }, [autoLoad, projectDirectory, taskType, loadPrompt]);

  return {
    prompt,
    loading,
    error,
    isCustom,
    update,
    reset,
    validate
  };
}