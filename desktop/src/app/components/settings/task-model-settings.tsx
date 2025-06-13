"use client";

import { type TaskSettings } from "@/types";
import { type TaskType, type TaskTypeSupportingSystemPrompts, supportsSystemPrompts, TaskTypeDetails } from "@/types/task-type-defs";
import { type ModelInfo } from "@/actions/config.actions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Label,
  Slider,
  Card,
  CardContent,
  Input,
  Button,
  Badge,
  Alert,
  VirtualizedCodeViewer,
} from "@/ui";
import { useProjectSystemPrompt } from "@/hooks/use-project-system-prompts";
import {
  getServerDefaultTaskModelSettings,
  resetProjectSettingToDefault,
} from "@/actions/project-settings.actions";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import SettingsEnhancementEngine from "./settings-enhancement-engine";

import type React from "react";

interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  availableModels: ModelInfo[] | null;
  onSettingsChange: (settings: TaskSettings) => void;
  sessionId?: string;
  projectDirectory?: string;
  onRefresh?: () => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}


interface SystemPromptEditorProps {
  projectDirectory?: string;
  taskType: TaskType;
  onSave?: () => void;
}

function SystemPromptEditor({ projectDirectory, taskType, onSave }: SystemPromptEditorProps) {
  // Always call hooks first, before any conditional logic
  const { prompt, loading, error, isCustom, update, reset, validate } = useProjectSystemPrompt({
    projectDirectory: projectDirectory || '',
    taskType: taskType as TaskTypeSupportingSystemPrompts,
    autoLoad: !!projectDirectory && supportsSystemPrompts(taskType)
  });
  
  const isSupported = supportsSystemPrompts(taskType);
  // System prompts are now project-based rather than session-based
  
  const [editedPrompt, setEditedPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [serverDefault, setServerDefault] = useState<{systemPrompt: string, description?: string} | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // For project-based system prompts, we need to distinguish between:
  // - Custom prompts (stored at project level)
  // - Default prompts (from server, shown when no custom prompt exists)
  // The hook handles this logic: prompt contains either custom or default content
  const currentPrompt = prompt || '';
  const defaultPrompt = serverDefault;
  
  // Load server default when component mounts
  useEffect(() => {
    if (!isCustom && prompt) {
      // When not custom, the prompt from the hook is the server default
      setServerDefault({
        systemPrompt: prompt,
        description: `Default system prompt for ${TaskTypeDetails[taskType]?.displayName || taskType}`
      });
    }
  }, [isCustom, prompt, taskType]);

  // All hooks must be called before any conditional returns
  const handlePromptChange = useCallback((value: string) => {
    setEditedPrompt(value);
    setValidationError(null);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounced auto-save after 1 second of no typing
    saveTimeoutRef.current = window.setTimeout(async () => {
      const validation = validate(value);
      if (!validation.isValid) {
        setValidationError(validation.errors.join(', '));
        return;
      }

      setIsSaving(true);
      try {
        await update(value);
        onSave?.();
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Failed to save prompt');
      } finally {
        setIsSaving(false);
      }
    }, 1000);
  }, [validate, update, onSave]);


  const handleReset = useCallback(async () => {
    setIsSaving(true);
    try {
      await reset();
      setEditedPrompt('');
      onSave?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to reset prompt');
    } finally {
      setIsSaving(false);
    }
  }, [reset, onSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const displayedPrompt = editedPrompt || currentPrompt;
  // Extract placeholders from the current prompt template
  const placeholders: string[] = currentPrompt ? 
    (currentPrompt.match(/\{\{([A-Z_]+)\}\}/g) || []).map(match => match.slice(2, -2)) : [];
  
  // Handle unsupported task types after all hooks are called
  if (!isSupported) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          System prompts are not available for this task type.
        </p>
      </div>
    );
  }

  if (!projectDirectory) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          No project directory available. Please open a project to manage system prompts.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-6 p-4 rounded-lg border border-border">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium">System Prompt</h4>
            <p className="text-xs text-muted-foreground">{defaultPrompt?.description || 'Default system prompt'}</p>
          </div>
          <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
            <Button
              variant={!isCustom ? "filter-active" : "filter"}
              size="xs"
              className="px-3 h-7 text-xs"
              onClick={() => {
                if (isCustom) {
                  handleReset();
                }
              }}
            >
              Default
            </Button>
            <div className="w-[1px] h-5 bg-border/40" />
            <Button
              variant={isCustom ? "filter-active" : "filter"}
              size="xs"
              className="px-3 h-7 text-xs"
              onClick={async () => {
                if (!isCustom) {
                  setIsSaving(true);
                  setValidationError(null);
                  
                  try {
                    // Create new custom prompt from default or start with empty prompt
                    // For voice transcription and other tasks without defaults, start with empty string
                    const promptToSave = defaultPrompt?.systemPrompt || '';
                    await update(promptToSave);
                    setEditedPrompt('');
                  } catch (err) {
                    setValidationError(err instanceof Error ? err.message : 'Failed to activate custom prompt');
                  } finally {
                    setIsSaving(false);
                  }
                }
              }}
              disabled={isSaving}
            >
              Custom
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            {error}
          </Alert>
        )}

        {validationError && (
          <Alert variant="destructive" className="mb-4">
            {validationError}
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-2">
            <VirtualizedCodeViewer
              content={isCustom ? displayedPrompt : (defaultPrompt?.systemPrompt || '')}
              height="400px"
              showCopy={true}
              copyText="Copy Prompt"
              showContentSize={true}
              readOnly={!isCustom}
              placeholder={isCustom ? "Enter your custom system prompt..." : "Default system prompt was not defined"}
              language="markdown"
              onChange={isCustom ? (value) => handlePromptChange(value || '') : undefined}
              virtualizationThreshold={10000}
              className={isCustom ? "border-primary/40" : "bg-muted/30 border-muted"}
            />
          </div>

          {placeholders.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Available Placeholders</label>
              <div className="flex flex-wrap gap-1">
                {placeholders.slice(0, 3).map((placeholder) => (
                  <Badge key={placeholder} variant="outline" className="text-xs px-2 py-0.5">
                    {`{{${placeholder}}}`}
                  </Badge>
                ))}
                {placeholders.length > 3 && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5">+{placeholders.length - 3} more</Badge>
                )}
              </div>
            </div>
          )}

          {isCustom && (
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
                className="cursor-pointer"
              >
                Reset to Default
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const taskSettingsKeyToTaskType: Record<keyof TaskSettings, TaskType> = {
  pathFinder: "path_finder",
  voiceTranscription: "voice_transcription",
  pathCorrection: "path_correction",
  textCorrection: "text_correction",
  textImprovement: "text_correction",
  guidanceGeneration: "guidance_generation",
  implementationPlan: "implementation_plan",
  fileFinderWorkflow: "file_finder_workflow",
  localFileFiltering: "local_file_filtering",
  extendedPathFinder: "extended_path_finder",
  extendedPathCorrection: "path_correction",
  fileRelevanceAssessment: "file_relevance_assessment",
  taskEnhancement: "task_enhancement",
  genericLlmStream: "generic_llm_stream",
  regexPatternGeneration: "regex_pattern_generation",
  streaming: "streaming",
  unknown: "unknown",
};

const FILE_FINDING_WORKFLOW_STAGES = [
  { 
    key: 'regexPatternGeneration', 
    stageNumber: 1, 
    displayName: 'Pattern Generation',
    nextStage: 'File Filtering',
    description: 'Generate regex patterns to identify relevant files'
  },
  { 
    key: 'localFileFiltering', 
    stageNumber: 2, 
    displayName: 'File Filtering',
    nextStage: 'Relevance Assessment',
    description: 'Filter project files using generated patterns'
  },
  { 
    key: 'fileRelevanceAssessment', 
    stageNumber: 3, 
    displayName: 'Relevance Assessment',
    nextStage: 'Extended Path Finding',
    description: 'AI-powered assessment of file relevance'
  },
  { 
    key: 'extendedPathFinder', 
    stageNumber: 4, 
    displayName: 'Extended Path Finding',
    nextStage: 'Path Correction',
    description: 'Deep analysis to find related files'
  },
  { 
    key: 'pathCorrection', 
    stageNumber: 5, 
    displayName: 'Path Correction',
    nextStage: null,
    description: 'Final refinement and path validation'
  },
] as const;

const STANDALONE_FEATURES = [
  { key: 'voiceTranscription', displayName: 'Voice Transcription', description: 'Convert speech to text' },
  { key: 'textCorrection', displayName: 'Text Correction', description: 'AI-powered text improvement' },
  { key: 'implementationPlan', displayName: 'Implementation Plans', description: 'Generate detailed development plans' },
  { key: 'guidanceGeneration', displayName: 'AI Guidance', description: 'Contextual AI assistance' },
] as const;

// Language options for transcription
const TRANSCRIPTION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
] as const;


export default function TaskModelSettings({
  taskSettings,
  availableModels,
  onSettingsChange,
  projectDirectory,
  onRefresh,
}: TaskModelSettingsProps) {
  const saveTimeoutRef = useRef<number | null>(null);
  const [serverDefaults, setServerDefaults] = useState<TaskSettings | null>(null);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  
  const validateTaskSettings = useCallback((settings: TaskSettings, taskKey: keyof TaskSettings): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const taskType = taskSettingsKeyToTaskType[taskKey];
    const taskDetails = TaskTypeDetails[taskType];
    const requiresLlm = taskDetails?.requiresLlm !== false;
    
    if (requiresLlm && settings[taskKey]) {
      const taskSetting = settings[taskKey];
      
      // Remove warning for empty model - just use server default silently
      
      if (taskSetting.maxTokens !== undefined) {
        if (taskSetting.maxTokens < 1000) {
          errors.push('Max tokens must be at least 1000');
        } else if (taskSetting.maxTokens > 100000) {
          errors.push('Max tokens cannot exceed 100,000');
        } else if (taskSetting.maxTokens < 2000) {
          warnings.push('Low token limit may truncate responses');
        }
      }
      
      if (taskSetting.temperature !== undefined && taskKey !== 'voiceTranscription') {
        if (taskSetting.temperature < 0 || taskSetting.temperature > 1) {
          errors.push('Temperature must be between 0.0 and 1.0');
        } else if (taskSetting.temperature > 0.9) {
          warnings.push('High temperature may produce inconsistent results');
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }, []);
  
  const debouncedSave = useCallback((newSettings: TaskSettings) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = window.setTimeout(() => {
      onSettingsChange(newSettings);
    }, 1000);
  }, [onSettingsChange]);
  
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Load server defaults
  useEffect(() => {
    async function loadServerDefaults() {
      try {
        const result = await getServerDefaultTaskModelSettings();
        if (result.isSuccess && result.data) {
          setServerDefaults(result.data);
        }
      } catch (error) {
        console.error('Failed to load server defaults:', error);
      }
    }
    
    loadServerDefaults();
  }, []);

  // Initialize slider values from taskSettings
  useEffect(() => {
    const newSliderValues: Record<string, number> = {};
    
    for (const taskKey of Object.keys(taskSettings) as (keyof TaskSettings)[]) {
      const settings = taskSettings[taskKey];
      if (settings) {
        newSliderValues[`${taskKey}.maxTokens`] = settings.maxTokens ?? 4000;
        newSliderValues[`${taskKey}.temperature`] = settings.temperature ?? 0.7;
      }
    }
    
    setSliderValues(newSliderValues);
  }, [taskSettings]);


  const getTaskSettings = (camelCaseKey: keyof TaskSettings) => {
    const settings = taskSettings[camelCaseKey];
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;

    if (!settings && !requiresLlm) {
      return {};
    }

    if (settings) {
      return settings;
    }
    
    console.error(`Configuration integrity issue: No settings found for task type: '${camelCaseKey}'. The backend should have provided a value for this key. Falling back to an empty object to prevent a UI crash.`);

    return {}; 
  };

  const handleModelChange = (camelCaseKey: keyof TaskSettings, model: string) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return;
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      model,
    };

    debouncedSave(newSettings);
  };


  const isDifferentFromDefault = (camelCaseKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode') => {
    if (!serverDefaults || !serverDefaults[camelCaseKey]) return false;
    
    const currentSettings = getTaskSettings(camelCaseKey);
    const defaultSettings = serverDefaults[camelCaseKey];
    
    const currentValue = currentSettings[settingName];
    const defaultValue = defaultSettings?.[settingName];
    
    return currentValue !== defaultValue;
  };

  const getSliderValue = (camelCaseKey: keyof TaskSettings, settingName: 'maxTokens' | 'temperature') => {
    const key = `${camelCaseKey}.${settingName}`;
    if (sliderValues[key] !== undefined) {
      return sliderValues[key];
    }
    
    const settings = getTaskSettings(camelCaseKey);
    return settingName === 'maxTokens' ? (settings.maxTokens ?? 4000) : (settings.temperature ?? 0.7);
  };

  const setSliderValue = (camelCaseKey: keyof TaskSettings, settingName: 'maxTokens' | 'temperature', value: number) => {
    const key = `${camelCaseKey}.${settingName}`;
    setSliderValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleResetToDefault = async (camelCaseKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode') => {
    if (!projectDirectory) return;
    
    try {
      await resetProjectSettingToDefault(projectDirectory, camelCaseKey, settingName);
      
      
      // Clear slider value for this setting so it gets reinitialized
      if (settingName === 'maxTokens' || settingName === 'temperature') {
        setSliderValues(prev => {
          const updated = { ...prev };
          delete updated[`${camelCaseKey}.${settingName}`];
          return updated;
        });
      }
      
      // Refresh settings through parent component
      if (onRefresh) {
        onRefresh();
      }
      
    } catch (error) {
      console.error(`Failed to reset ${camelCaseKey}.${settingName} to default:`, error);
    }
  };


  const handleMaxTokensChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    // Just update local slider state - no saving
    setSliderValue(camelCaseKey, 'maxTokens', value[0]);
  };

  const handleMaxTokensCommit = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return;
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      maxTokens: value[0],
    };

    debouncedSave(newSettings);
  };

  const handleTemperatureChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    // Just update local slider state - no saving
    setSliderValue(camelCaseKey, 'temperature', value[0]);
  };

  const handleTemperatureCommit = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return;
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      temperature: value[0],
    };

    debouncedSave(newSettings);
  };

  const getModelsForTask = (camelCaseKey: keyof TaskSettings) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const taskDetails = TaskTypeDetails[taskType];
    const requiresLlm = taskDetails?.requiresLlm ?? true;
    if (!requiresLlm) return [];
    
    if (!availableModels || availableModels.length === 0) {
      return [];
    }
    
    // Special case for voice transcription - filter for specific transcription models
    if (camelCaseKey === 'voiceTranscription') {
      return availableModels.filter(model => 
        model.id.includes('gpt-4o-transcribe') || 
        model.id.includes('gpt-4o-mini-transcribe') ||
        model.id.includes('openai/gpt-4o-transcribe') ||
        model.id.includes('openai/gpt-4o-mini-transcribe')
      );
    }
    
    const apiType = taskDetails?.defaultProvider || "google";
    return availableModels.filter(model => model.provider === apiType);
  };

  // Transcription-specific handlers
  const handleTranscriptionLanguageChange = (camelCaseKey: keyof TaskSettings, languageCode: string) => {
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      languageCode,
    };

    debouncedSave(newSettings);
  };


  const { workflowStages, standaloneFeatures } = useMemo(() => {
    const stages = FILE_FINDING_WORKFLOW_STAGES.filter(stage => 
      taskSettings[stage.key as keyof TaskSettings] !== undefined
    );
    
    const features = STANDALONE_FEATURES.filter(feature => 
      taskSettings[feature.key as keyof TaskSettings] !== undefined &&
      !TaskTypeDetails[taskSettingsKeyToTaskType[feature.key as keyof TaskSettings]]?.hidden
    );

    return { workflowStages: stages, standaloneFeatures: features };
  }, [taskSettings]);

  const [selectedCategory, setSelectedCategory] = useState<'workflow' | 'standalone' | 'bulk-optimization'>('workflow');
  const [selectedTask, setSelectedTask] = useState<string>('regexPatternGeneration');
  
  useEffect(() => {
    // Only set default task if current selection doesn't exist in taskSettings
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    if (!taskExists) {
      const firstWorkflowTask = workflowStages[0]?.key;
      const firstStandaloneTask = standaloneFeatures[0]?.key;
      
      if (firstWorkflowTask) {
        setSelectedCategory('workflow');
        setSelectedTask(firstWorkflowTask);
      } else if (firstStandaloneTask) {
        setSelectedCategory('standalone');
        setSelectedTask(firstStandaloneTask);
      }
    }
  }, [workflowStages, standaloneFeatures, selectedTask, taskSettings]);
  
  useEffect(() => {
    const isWorkflowTask = workflowStages.some(stage => stage.key === selectedTask);
    const isStandaloneTask = standaloneFeatures.some(feature => feature.key === selectedTask);
    
    if (isWorkflowTask && selectedCategory !== 'workflow') {
      setSelectedCategory('workflow');
    } else if (isStandaloneTask && selectedCategory !== 'standalone') {
      setSelectedCategory('standalone');
    }
  }, [selectedTask, workflowStages, standaloneFeatures]);
  
  useEffect(() => {
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    if (!taskExists) {
      const fallbackTask = workflowStages[0]?.key || standaloneFeatures[0]?.key || 'regexPatternGeneration';
      setSelectedTask(fallbackTask);
    }
  }, [taskSettings, selectedTask, workflowStages, standaloneFeatures]);
  

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
          <div className="space-y-4">
            
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">File Finding Workflow</h3>
                </div>
                <div className="space-y-1 pl-2 border-l-2 border-muted">
                  {workflowStages.map((stage) => {
                    const camelCaseKey = stage.key;
                    const isSelected = selectedTask === camelCaseKey;
                    
                    return (
                      <div key={camelCaseKey} className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedCategory('workflow');
                            setSelectedTask(camelCaseKey);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedCategory('workflow');
                              setSelectedTask(camelCaseKey);
                            }
                          }}
                          aria-label={`Configure ${stage.displayName} settings`}
                          aria-pressed={isSelected}
                          className={`group w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                            isSelected 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-mono">
                                {'stageNumber' in stage ? stage.stageNumber : '#'}
                              </span>
                              <span>{stage.displayName}</span>
                              
                            </div>
                          </div>
                        </button>
                        {'nextStage' in stage && stage.nextStage && (
                          <div className="pl-6 text-xs text-muted-foreground flex items-center gap-1">
                            <span>↓ feeds into</span>
                            <span className="font-medium">{stage.nextStage}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Standalone Features</h3>
                </div>
                <div className="space-y-1 pl-2">
                  {standaloneFeatures.map((feature) => {
                    const camelCaseKey = feature.key;
                    const isSelected = selectedTask === camelCaseKey;
                    
                    return (
                      <button
                        key={camelCaseKey}
                        onClick={() => {
                          setSelectedCategory('standalone');
                          setSelectedTask(camelCaseKey);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedCategory('standalone');
                            setSelectedTask(camelCaseKey);
                          }
                        }}
                        aria-label={`Configure ${feature.displayName} settings`}
                        aria-pressed={isSelected}
                        className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                          isSelected 
                            ? 'bg-primary/10 text-primary border border-primary/20' 
                            : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{feature.displayName}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Bulk Optimization Available</h3>
                </div>
                <div className="space-y-1 pl-2">
                  <button
                    onClick={() => {
                      setSelectedCategory('bulk-optimization');
                      setSelectedTask('bulk-optimization');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCategory('bulk-optimization');
                        setSelectedTask('bulk-optimization');
                      }
                    }}
                    aria-label="Configure bulk optimization settings"
                    aria-pressed={selectedCategory === 'bulk-optimization'}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                      selectedCategory === 'bulk-optimization'
                        ? 'bg-primary/10 text-primary border border-primary/20' 
                        : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Settings Enhancement</span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="min-h-[600px]">

            {(() => {
              // Handle bulk optimization section
              if (selectedCategory === 'bulk-optimization') {
                return (
                  <div className="w-full space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <h2 className="text-lg font-semibold">Settings Enhancement Engine</h2>
                          <p className="text-sm text-muted-foreground">
                            Bulk optimization and recommendations for all AI model settings
                          </p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Analyze your current settings and get AI-powered recommendations to optimize performance, cost, and accuracy across all task types.
                        </p>
                      </div>
                    </div>
                    
                    <SettingsEnhancementEngine
                      taskSettings={taskSettings}
                      onSettingsChange={onSettingsChange}
                      onRecommendationApply={(recommendation) => {
                        const newSettings = { ...taskSettings };
                        const currentSettings = newSettings[recommendation.taskKey];
                        
                        if (currentSettings) {
                          if (recommendation.id.includes('temp')) {
                            currentSettings.temperature = recommendation.recommendedValue;
                          } else if (recommendation.id.includes('tokens')) {
                            currentSettings.maxTokens = recommendation.recommendedValue;
                          }
                          
                          onSettingsChange(newSettings);
                        }
                      }}
                    />
                  </div>
                );
              }
              
              const taskSettingsKey = selectedTask as keyof TaskSettings;
              
              if (!taskSettings[taskSettingsKey]) {
                return (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center space-y-4 max-w-md">
                      <div className="w-20 h-20 bg-gradient-to-br from-muted/50 to-muted/30 rounded-full flex items-center justify-center mx-auto">
                        <div className="w-8 h-8 border-2 border-muted-foreground/40 rounded border-dashed animate-pulse"></div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Configuration Not Available</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The selected task <code className="bg-muted px-1.5 py-1 rounded text-xs font-mono">{selectedTask}</code> does not have configuration settings available.
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          This might indicate a missing task definition or a temporary loading state.
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.location.reload()}
                        className="text-xs cursor-pointer"
                      >
                        Refresh Application
                      </Button>
                    </div>
                  </div>
                );
              }
              
              const taskType = taskSettingsKeyToTaskType[taskSettingsKey];
              const taskDetails = TaskTypeDetails[taskType];
              const settings = getTaskSettings(taskSettingsKey);
              const models = getModelsForTask(taskSettingsKey);
              const validation = validateTaskSettings(taskSettings, taskSettingsKey);
              
              // Voice transcription specific variables
              const isVoiceTranscription = taskSettingsKey === 'voiceTranscription';
              const currentLanguage = settings.languageCode || 'en';
              
              
              return (
                <div className="w-full space-y-6">
                  <SystemPromptEditor
                    projectDirectory={projectDirectory}
                    taskType={taskType}
                  />
                  
                  <div className="space-y-3">
                    {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                      <div className="space-y-2">
                        {validation.errors.length > 0 && (
                          <Alert variant="destructive">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">Configuration Errors:</p>
                              <ul className="text-xs space-y-0.5 list-disc list-inside">
                                {validation.errors.map((error, idx) => (
                                  <li key={idx}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          </Alert>
                        )}
                        {validation.warnings.length > 0 && (
                          <Alert>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-amber-700">Configuration Warnings:</p>
                              <ul className="text-xs space-y-0.5 list-disc list-inside text-amber-600">
                                {validation.warnings.map((warning, idx) => (
                                  <li key={idx}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          </Alert>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {taskDetails?.requiresLlm !== false ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {/* First Column - Model */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`model-select-${selectedTask}`}
                          className="text-sm font-medium"
                        >
                          Model
                        </Label>
                        {isDifferentFromDefault(taskSettingsKey, 'model') && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleResetToDefault(taskSettingsKey, 'model')}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                      <Select
                        value={settings.model || (serverDefaults?.[taskSettingsKey]?.model || "")}
                        onValueChange={(value: string) =>
                          handleModelChange(taskSettingsKey, value)
                        }
                      >
                        <SelectTrigger
                          id={`model-select-${selectedTask}`}
                          className={`w-full ${
                            validation.errors.some(e => e.includes('model')) ? 'border-red-500 focus:ring-red-200' : ''
                          }`}
                        >
                          <SelectValue placeholder={models.length > 0 ? "Select model" : "No models available"} />
                        </SelectTrigger>
                        <SelectContent>
                          {models.length > 0 ? (
                            <SelectGroup>
                              <SelectLabel>
                                {isVoiceTranscription ? 'Transcription Models' : (
                                  (taskDetails?.defaultProvider || "google").charAt(0).toUpperCase() +
                                  (taskDetails?.defaultProvider || "google").slice(1) + " Models"
                                )}
                              </SelectLabel>
                              {models.filter(model => model.id && model.id.trim() !== '').map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : (
                            <SelectGroup>
                              <SelectLabel>No models available</SelectLabel>
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const currentModel = settings.model || serverDefaults?.[taskSettingsKey]?.model;
                          const modelInfo = models.find((m) => m.id === currentModel);
                          return modelInfo?.description || "Select a model";
                        })()}
                        {(() => {
                          const currentModel = settings.model || serverDefaults?.[taskSettingsKey]?.model;
                          return currentModel && (
                            <span className="block text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                              {currentModel}
                            </span>
                          );
                        })()}
                      </p>
                    </div>

                    {/* Second Column - Temperature */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`temperature-${selectedTask}`}
                          className="text-sm font-medium"
                        >
                          Temperature
                        </Label>
                        <div className="flex items-center gap-2">
                          {validation.errors.some(e => e.includes('Temperature')) && (
                            <Badge variant="destructive" className="text-xs">
                              Error
                            </Badge>
                          )}
                          {validation.warnings.some(w => w.includes('temperature')) && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">
                              Warning
                            </Badge>
                          )}
                          {isDifferentFromDefault(taskSettingsKey, 'temperature') && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleResetToDefault(taskSettingsKey, 'temperature')}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 min-w-[120px]">
                          <Slider
                            id={`temperature-${selectedTask}`}
                            value={[getSliderValue(taskSettingsKey, 'temperature')]}
                            max={1}
                            min={0}
                            step={0.05}
                            onValueChange={(value: number[]) =>
                              handleTemperatureChange(taskSettingsKey, value)
                            }
                            onValueCommit={(value: number[]) =>
                              handleTemperatureCommit(taskSettingsKey, value)
                            }
                            className="w-full"
                            aria-label="Temperature"
                          />
                        </div>
                        <Input
                          type="number"
                          value={getSliderValue(taskSettingsKey, 'temperature').toFixed(2)}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement>
                          ) => {
                            const value = parseFloat(e.target.value);
                            if (e.target.value === '' || (
                              !isNaN(value) && 
                              value >= 0 && 
                              value <= 1
                            )) {
                              handleTemperatureChange(taskSettingsKey, [value || 0.7]);
                            }
                          }}
                          onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value) && value >= 0 && value <= 1) {
                              handleTemperatureCommit(taskSettingsKey, [value]);
                            }
                          }}
                          className={`w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2 ${
                            validation.errors.some(e => e.includes('Temperature')) ? 'border-red-500 focus:ring-red-200' : ''
                          }`}
                          min={0}
                          max={1}
                          step={0.01}
                          placeholder="0.70"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-balance">
                        {taskSettingsKey === "pathCorrection" || taskSettingsKey === "pathFinder"
                          ? "Lower values produce more accurate path suggestions"
                          : taskSettingsKey === "textCorrection"
                          ? "Lower values for accuracy, higher for more creative corrections"
                          : "Lower (0.0-0.3): factual and precise. Higher (0.7-1.0): creative and varied."}
                      </p>
                    </div>

                    {/* Third Column - Language for voice transcription, Max Tokens for others */}
                    {isVoiceTranscription ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`language-select-${selectedTask}`}
                            className="text-sm font-medium"
                          >
                            Language
                          </Label>
                          {isDifferentFromDefault(taskSettingsKey, 'languageCode') && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleResetToDefault(taskSettingsKey, 'languageCode')}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                        <Select
                          value={currentLanguage}
                          onValueChange={(value: string) =>
                            handleTranscriptionLanguageChange(taskSettingsKey, value)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Available Languages</SelectLabel>
                              {TRANSCRIPTION_LANGUAGES.map((lang) => (
                                <SelectItem key={lang.code} value={lang.code}>
                                  <div className="flex items-center gap-2">
                                    <span>{lang.nativeName}</span>
                                    <span className="text-xs text-muted-foreground">({lang.name})</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Primary language for voice transcription
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`max-tokens-${selectedTask}`}
                            className="text-sm font-medium"
                          >
                            Max Tokens
                          </Label>
                          {isDifferentFromDefault(taskSettingsKey, 'maxTokens') && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleResetToDefault(taskSettingsKey, 'maxTokens')}
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 min-w-[120px]">
                            <Slider
                              id={`max-tokens-${selectedTask}`}
                              value={[getSliderValue(taskSettingsKey, 'maxTokens')]}
                              max={100000}
                              min={1000}
                              step={1000}
                              onValueChange={(value: number[]) =>
                                handleMaxTokensChange(taskSettingsKey, value)
                              }
                              onValueCommit={(value: number[]) =>
                                handleMaxTokensCommit(taskSettingsKey, value)
                              }
                              className="w-full"
                              aria-label="Max tokens"
                            />
                          </div>
                          <Input
                            type="number"
                            value={getSliderValue(taskSettingsKey, 'maxTokens')}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>
                            ) => {
                              const value = parseInt(e.target.value);
                              if (e.target.value === '' || (
                                !isNaN(value) &&
                                value >= 1000 &&
                                value <= 100000
                              )) {
                                handleMaxTokensChange(taskSettingsKey, [value || 4000]);
                              }
                            }}
                            onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const value = parseInt(e.target.value);
                              if (!isNaN(value) && value >= 1000 && value <= 100000) {
                                handleMaxTokensCommit(taskSettingsKey, [value]);
                              }
                            }}
                            className={`w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2 ${
                              validation.errors.some(e => e.includes('tokens')) ? 'border-red-500 focus:ring-red-200' : ''
                            }`}
                            min={1000}
                            max={100000}
                            placeholder="4000"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Maximum output tokens for this task type
                        </p>
                      </div>
                    )}
                  </div>
                  ) : (
                    <div className="p-6 bg-muted/30 rounded-lg text-center border border-dashed">
                      <div className="flex flex-col items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Non-LLM Task
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          This task type performs local processing or workflow coordination and does not require AI model configuration.
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          {taskDetails?.description}
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}