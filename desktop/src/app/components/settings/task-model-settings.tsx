"use client";

import { type TaskSettings } from "@/types";
import { type TaskType, TaskTypeDetails } from "@/types/task-type-defs";
import { type ProviderWithModels } from "@/types/config-types";
import {
  Card,
  CardContent,
  Button,
} from "@/ui";
import {
  getServerDefaultTaskModelSettings,
  resetProjectSettingToDefault,
} from "@/actions/project-settings.actions";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import SettingsEnhancementEngine from "./enhancement-engine";
import { TaskSettingsEditor } from "./task-settings-editor";
import { ImplementationPlanSettingsEditor } from "./implementation-plan-settings-editor";


interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  providersWithModels: ProviderWithModels[] | null;
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


const taskSettingsKeyToTaskType: Record<keyof TaskSettings, TaskType> = {
  pathFinder: "path_finder",
  voiceTranscription: "voice_transcription",
  pathCorrection: "path_correction",
  textImprovement: "text_improvement",
  guidanceGeneration: "guidance_generation",
  implementationPlan: "implementation_plan",
  fileFinderWorkflow: "file_finder_workflow",
  localFileFiltering: "local_file_filtering",
  extendedPathFinder: "extended_path_finder",
  extendedPathCorrection: "path_correction",
  fileRelevanceAssessment: "file_relevance_assessment",
  taskRefinement: "task_refinement",
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
  { key: 'textImprovement', displayName: 'Text Improvement', description: 'AI-powered text enhancement' },
  { key: 'taskRefinement', displayName: 'Task Refinement', description: 'Refine and optimize task descriptions' },
  { key: 'implementationPlan', displayName: 'Implementation Plans', description: 'Generate detailed development plans' },
  { key: 'guidanceGeneration', displayName: 'AI Guidance', description: 'Contextual AI assistance' },
] as const;



export default function TaskModelSettings({
  taskSettings,
  providersWithModels,
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
    return taskSettings[camelCaseKey];
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


  const isDifferentFromDefault = (camelCaseKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode' | 'copyButtons') => {
    if (!serverDefaults || !serverDefaults[camelCaseKey]) return false;
    
    const currentSettings = getTaskSettings(camelCaseKey);
    const defaultSettings = serverDefaults[camelCaseKey];
    
    const currentValue = currentSettings[settingName];
    const defaultValue = defaultSettings?.[settingName];
    
    // For copyButtons, perform deep comparison
    if (settingName === 'copyButtons') {
      // Handle cases where one or both values are undefined or null
      if (!currentValue && !defaultValue) return false;
      if (!currentValue || !defaultValue) return true;
      return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
    }
    
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

  const handleResetToDefault = async (camelCaseKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode' | 'copyButtons') => {
    if (!projectDirectory || !serverDefaults || !serverDefaults[camelCaseKey]) return;
    
    try {
      await resetProjectSettingToDefault(projectDirectory, camelCaseKey, settingName);
      
      // Immediately update local state with default value
      let defaultValue;
      if (settingName === 'copyButtons') {
        defaultValue = serverDefaults[camelCaseKey]?.copyButtons;
      } else {
        defaultValue = serverDefaults[camelCaseKey]?.[settingName];
      }
      
      if (defaultValue !== undefined) {
        const newSettings = { ...taskSettings };
        if (!newSettings[camelCaseKey]) {
          newSettings[camelCaseKey] = {};
        }
        newSettings[camelCaseKey] = {
          ...newSettings[camelCaseKey],
          [settingName]: defaultValue,
        };
        onSettingsChange(newSettings);
      }
      
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

  const filteredProvidersWithModels = useMemo(() => {
    if (!providersWithModels) return null;
    
    const taskType = taskSettingsKeyToTaskType[selectedTask as keyof TaskSettings];
    
    if (taskType === 'voice_transcription') {
      return providersWithModels.filter(providerWithModels => providerWithModels.provider.code === 'openai_transcription');
    } else {
      return providersWithModels.filter(providerWithModels => providerWithModels.provider.code !== 'openai_transcription');
    }
  }, [providersWithModels, selectedTask]);
  
  useEffect(() => {
    // Only set default task if current selection doesn't exist in taskSettings
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    const isBulkOptimization = selectedTask === 'bulk-optimization';
    if (!taskExists && !isBulkOptimization) {
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
    const isBulkOptimization = selectedTask === 'bulk-optimization';
    if (!taskExists && !isBulkOptimization) {
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
              
{/* 
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">AI Optimizer</h3>
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
                    aria-label="Configure AI optimization settings"
                    aria-pressed={selectedCategory === 'bulk-optimization'}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                      selectedCategory === 'bulk-optimization'
                        ? 'bg-primary/10 text-primary border border-primary/20' 
                        : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Optimize Settings</span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
              */}
            </div>
          </div>
          
          <div className="min-h-[600px]">

{selectedCategory === 'bulk-optimization' ? (
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
                    
                    if (currentSettings && recommendation.fieldToChange) {
                      (currentSettings as any)[recommendation.fieldToChange] = recommendation.recommendedValue;
                      onSettingsChange(newSettings);
                    }
                  }}
                />
              </div>
            ) : (() => {
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
              
              const settings = getTaskSettings(taskSettingsKey);
              const validation = validateTaskSettings(taskSettings, taskSettingsKey);
              
              if (selectedTask === 'implementationPlan') {
                return (
                  <ImplementationPlanSettingsEditor
                    settings={settings}
                    serverDefaults={serverDefaults?.[taskSettingsKey] || null}
                    projectDirectory={projectDirectory}
                    providersWithModels={filteredProvidersWithModels}
                    onSettingsChange={(updatedSettings) => {
                      const newSettings = { ...taskSettings };
                      newSettings[taskSettingsKey] = {
                        ...settings,
                        ...updatedSettings,
                      };
                      debouncedSave(newSettings);
                    }}
                    isDifferentFromDefault={(settingName) => isDifferentFromDefault(taskSettingsKey, settingName)}
                    onResetToDefault={(settingName) => handleResetToDefault(taskSettingsKey, settingName)}
                    getSliderValue={(settingName) => getSliderValue(taskSettingsKey, settingName)}
                    onSliderChange={(settingName, value) => {
                      if (settingName === 'temperature') {
                        handleTemperatureChange(taskSettingsKey, value);
                      } else if (settingName === 'maxTokens') {
                        handleMaxTokensChange(taskSettingsKey, value);
                      }
                    }}
                    onSliderCommit={(settingName, value) => {
                      if (settingName === 'temperature') {
                        handleTemperatureCommit(taskSettingsKey, value);
                      } else if (settingName === 'maxTokens') {
                        handleMaxTokensCommit(taskSettingsKey, value);
                      }
                    }}
                  />
                );
              }
              
              return (
                <TaskSettingsEditor
                  taskKey={taskSettingsKey}
                  settings={settings}
                  serverDefaults={serverDefaults}
                  validation={validation}
                  projectDirectory={projectDirectory}
                  onModelChange={(model: string) => handleModelChange(taskSettingsKey, model)}
                  onTemperatureChange={(value: number[]) => handleTemperatureChange(taskSettingsKey, value)}
                  onTemperatureCommit={(value: number[]) => handleTemperatureCommit(taskSettingsKey, value)}
                  onMaxTokensChange={(value: number[]) => handleMaxTokensChange(taskSettingsKey, value)}
                  onMaxTokensCommit={(value: number[]) => handleMaxTokensCommit(taskSettingsKey, value)}
                  onTranscriptionLanguageChange={(languageCode: string) => handleTranscriptionLanguageChange(taskSettingsKey, languageCode)}
                  onResetToDefault={(settingName) => handleResetToDefault(taskSettingsKey, settingName)}
                  isDifferentFromDefault={(settingName) => isDifferentFromDefault(taskSettingsKey, settingName)}
                  getSliderValue={(settingName) => getSliderValue(taskSettingsKey, settingName)}
                  providersWithModels={filteredProvidersWithModels}
                />
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}