"use client";

import { type TaskSettings } from "@/types";
import { TaskTypeDetails } from "@/types/task-type-defs";
import { type ProviderWithModels, type CopyButtonConfig } from "@/types/config-types";
import {
  Card,
  CardContent,
  Button,
} from "@/ui";
import { useState, useCallback, useEffect, useMemo } from "react";
import { TaskSettingsEditor } from "./task-settings-editor";
import { ValidationResult, taskSettingsKeyToTaskType } from "./shared/task-settings-types";
import { setProjectTaskSetting, resetProjectTaskSetting } from "@/actions/project-settings.actions";


interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  serverDefaults: TaskSettings | null;
  providersWithModels: ProviderWithModels[] | null;
  projectDirectory?: string;
  onRefresh?: () => void;
}


const FILE_FINDING_WORKFLOW_STAGES = [
  { 
    key: 'regexFileFilter', 
    stageNumber: 1, 
    displayName: 'Regex File Filter',
    nextStage: 'Relevance Assessment',
    description: 'Generate regex patterns to identify relevant files'
  },
  { 
    key: 'fileRelevanceAssessment', 
    stageNumber: 2, 
    displayName: 'Relevance Assessment',
    nextStage: 'Extended Path Finding',
    description: 'AI-powered assessment of file relevance'
  },
  { 
    key: 'extendedPathFinder', 
    stageNumber: 3, 
    displayName: 'Extended Path Finding',
    nextStage: 'Path Correction',
    description: 'Deep analysis to find related files'
  },
  { 
    key: 'pathCorrection', 
    stageNumber: 4, 
    displayName: 'Path Correction',
    nextStage: null,
    description: 'Final refinement and path validation'
  },
] as const;

const WEB_SEARCH_WORKFLOW_STAGES = [
  {
    key: 'webSearchPromptsGeneration',
    stageNumber: 1,
    displayName: 'Prompts Generation',
    nextStage: 'Search Execution',
    description: 'Generate sophisticated search prompts for web research'
  },
  {
    key: 'webSearchExecution',
    stageNumber: 2,
    displayName: 'Search Execution',
    nextStage: null,
    description: 'Execute web searches and process results'
  },
] as const;




export default function TaskModelSettings({
  taskSettings,
  serverDefaults,
  providersWithModels,
  projectDirectory,
  onRefresh,
}: TaskModelSettingsProps) {
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

  const handleModelChange = useCallback(async (camelCaseKey: keyof TaskSettings, model: string) => {
    if (!projectDirectory) return;
    
    const result = await setProjectTaskSetting(projectDirectory, camelCaseKey, 'model', model);
    if (result.isSuccess && onRefresh) {
      onRefresh();
    }
  }, [projectDirectory, onRefresh]);


  // Generic function to check if a setting is different from default
  const isDifferentFromDefault = useCallback((taskKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode' | 'copyButtons') => {
    if (!serverDefaults || !serverDefaults[taskKey]) return false;
    
    // Only check copyButtons for implementation plans
    if (settingName === 'copyButtons' && taskKey !== 'implementationPlan') {
      return false;
    }
    
    // Only check languageCode for voiceTranscription
    if (settingName === 'languageCode' && taskKey !== 'voiceTranscription') {
      return false;
    }
    
    const currentSettings = getTaskSettings(taskKey);
    const defaultSettings = serverDefaults[taskKey];
    
    // Type-safe property access
    const currentValue = (currentSettings as any)?.[settingName];
    const defaultValue = (defaultSettings as any)?.[settingName];
    
    // For copyButtons, perform deep comparison
    if (settingName === 'copyButtons') {
      // Handle cases where one or both values are undefined or null
      if (!currentValue && !defaultValue) return false;
      if (!currentValue || !defaultValue) return true;
      return JSON.stringify(currentValue) !== JSON.stringify(defaultValue);
    }
    
    return currentValue !== defaultValue;
  }, [serverDefaults, taskSettings]);

  const getSliderValue = (camelCaseKey: keyof TaskSettings, settingName: 'maxTokens' | 'temperature') => {
    const key = `${camelCaseKey}.${settingName}`;
    if (sliderValues[key] !== undefined) {
      return sliderValues[key];
    }
    
    const settings = getTaskSettings(camelCaseKey);
    return settingName === 'maxTokens' ? (settings?.maxTokens ?? 4000) : (settings?.temperature ?? 0.7);
  };

  const setSliderValue = (camelCaseKey: keyof TaskSettings, settingName: 'maxTokens' | 'temperature', value: number) => {
    const key = `${camelCaseKey}.${settingName}`;
    setSliderValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleResetToDefault = useCallback(async (taskKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode' | 'copyButtons') => {
    if (!projectDirectory) return;
    
    const result = await resetProjectTaskSetting(projectDirectory, taskKey, settingName);
    if (result.isSuccess && onRefresh) {
      onRefresh();
    }
  }, [projectDirectory, onRefresh]);


  const handleMaxTokensChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    // Just update local slider state - no saving
    setSliderValue(camelCaseKey, 'maxTokens', value[0]);
  };

  const handleMaxTokensCommit = useCallback(async (camelCaseKey: keyof TaskSettings, value: number[]) => {
    if (!projectDirectory) return;
    
    const result = await setProjectTaskSetting(projectDirectory, camelCaseKey, 'maxTokens', value[0]);
    if (result.isSuccess && onRefresh) {
      onRefresh();
    }
  }, [projectDirectory, onRefresh]);

  const handleTemperatureChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    // Just update local slider state - no saving
    setSliderValue(camelCaseKey, 'temperature', value[0]);
  };

  const handleTemperatureCommit = useCallback(async (camelCaseKey: keyof TaskSettings, value: number[]) => {
    if (!projectDirectory) return;
    
    const result = await setProjectTaskSetting(projectDirectory, camelCaseKey, 'temperature', value[0]);
    if (result.isSuccess && onRefresh) {
      onRefresh();
    }
  }, [projectDirectory, onRefresh]);


  const handleTranscriptionLanguageChange = useCallback(async (camelCaseKey: keyof TaskSettings, languageCode: string) => {
    if (!projectDirectory) return;
    
    const result = await setProjectTaskSetting(projectDirectory, camelCaseKey, 'languageCode', languageCode);
    if (result.isSuccess && onRefresh) {
      onRefresh();
    }
  }, [projectDirectory, onRefresh]);

  const handleCopyButtonsChange = useCallback(async (camelCaseKey: keyof TaskSettings, copyButtons: CopyButtonConfig[]) => {
    if (!projectDirectory) return;
    
    const result = await setProjectTaskSetting(projectDirectory, camelCaseKey, 'copyButtons', copyButtons);
    if (result.isSuccess && onRefresh) {
      onRefresh();
    }
  }, [projectDirectory, onRefresh]);


  const { fileFinderStages, webSearchStages, workflows, standaloneFeatures } = useMemo(() => {
    const fileFinderStages = FILE_FINDING_WORKFLOW_STAGES.filter(stage => 
      taskSettings[stage.key as keyof TaskSettings] !== undefined
    );
    
    const webSearchStages = WEB_SEARCH_WORKFLOW_STAGES.filter(stage => 
      taskSettings[stage.key as keyof TaskSettings] !== undefined
    );
    
    const allWorkflowStageKeys = new Set([
      ...FILE_FINDING_WORKFLOW_STAGES.map(stage => stage.key as keyof TaskSettings),
      ...WEB_SEARCH_WORKFLOW_STAGES.map(stage => stage.key as keyof TaskSettings)
    ]);
    
    const workflowTasks = Object.keys(taskSettings)
      .filter((key): key is keyof TaskSettings => {
        const typedKey = key as keyof TaskSettings;
        const taskType = taskSettingsKeyToTaskType[typedKey];
        const taskDetails = TaskTypeDetails[taskType];
        
        return (
          !allWorkflowStageKeys.has(typedKey) &&
          !taskDetails?.hidden &&
          taskDetails?.category === 'Workflow'
        );
      })
      .map(key => {
        const taskType = taskSettingsKeyToTaskType[key];
        const taskDetails = TaskTypeDetails[taskType];
        
        return {
          key,
          displayName: taskDetails?.displayName || key,
          description: taskDetails?.description || ''
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    const features = Object.keys(taskSettings)
      .filter((key): key is keyof TaskSettings => {
        const typedKey = key as keyof TaskSettings;
        const taskType = taskSettingsKeyToTaskType[typedKey];
        const taskDetails = TaskTypeDetails[taskType];
        
        return (
          !allWorkflowStageKeys.has(typedKey) &&
          !taskDetails?.hidden &&
          taskDetails?.category !== 'Workflow' &&
          taskDetails?.category !== 'Workflow Stage'
        );
      })
      .map(key => {
        const taskType = taskSettingsKeyToTaskType[key];
        const taskDetails = TaskTypeDetails[taskType];
        
        return {
          key,
          displayName: taskDetails?.displayName || key,
          description: taskDetails?.description || ''
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { 
      fileFinderStages,
      webSearchStages,
      workflows: workflowTasks,
      standaloneFeatures: features 
    };
  }, [taskSettings]);

  const [selectedCategory, setSelectedCategory] = useState<'workflow' | 'standalone' | 'bulk-optimization'>('workflow');
  const [selectedTask, setSelectedTask] = useState<string>('');

  const filteredProvidersWithModels = useMemo(() => {
    if (!providersWithModels) return null;
    
    // Filter out openrouter provider
    let filtered = providersWithModels;
    
    // Get settings for the currently selected task
    const settings = taskSettings[selectedTask as keyof TaskSettings];
    
    // If allowedModels is configured and non-empty, apply filtering
    if (settings?.allowedModels && settings.allowedModels.length > 0) {
      const allowedModelsSet = new Set(settings.allowedModels);
      
      filtered = filtered
        .map(providerWithModels => ({
          ...providerWithModels,
          models: providerWithModels.models.filter(model => allowedModelsSet.has(model.id))
        }))
        .filter(providerWithModels => providerWithModels.models.length > 0);
    }
    
    return filtered;
  }, [providersWithModels, selectedTask, taskSettings]);
  
  useEffect(() => {
    // Only set default task if current selection doesn't exist in taskSettings
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    const isBulkOptimization = selectedTask === 'bulk-optimization';
    if (!taskExists && !isBulkOptimization) {
      const firstWorkflowTask = workflows[0]?.key || fileFinderStages[0]?.key || webSearchStages[0]?.key;
      const firstStandaloneTask = standaloneFeatures[0]?.key;
      
      if (firstWorkflowTask) {
        setSelectedCategory('workflow');
        setSelectedTask(firstWorkflowTask);
      } else if (firstStandaloneTask) {
        setSelectedCategory('standalone');
        setSelectedTask(firstStandaloneTask);
      }
    }
  }, [workflows, fileFinderStages, webSearchStages, standaloneFeatures, selectedTask, taskSettings]);
  
  useEffect(() => {
    const isWorkflowTask = workflows.some(workflow => workflow.key === selectedTask) || fileFinderStages.some(stage => stage.key === selectedTask) || webSearchStages.some(stage => stage.key === selectedTask);
    const isStandaloneTask = standaloneFeatures.some(feature => feature.key === selectedTask);
    
    if (isWorkflowTask && selectedCategory !== 'workflow') {
      setSelectedCategory('workflow');
    } else if (isStandaloneTask && selectedCategory !== 'standalone') {
      setSelectedCategory('standalone');
    }
  }, [selectedTask, workflows, fileFinderStages, webSearchStages, standaloneFeatures]);
  
  useEffect(() => {
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    const isBulkOptimization = selectedTask === 'bulk-optimization';
    if (!taskExists && !isBulkOptimization) {
      const fallbackTask = workflows[0]?.key || fileFinderStages[0]?.key || webSearchStages[0]?.key || standaloneFeatures[0]?.key;
      setSelectedTask(fallbackTask);
    }
  }, [taskSettings, selectedTask, workflows, fileFinderStages, webSearchStages, standaloneFeatures]);
  

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
          <div className="space-y-4">
            
            <div className="space-y-3">
              {workflows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Workflows</h3>
                  </div>
                  <div className="space-y-1 pl-2">
                    {workflows.map((workflow) => {
                      const camelCaseKey = workflow.key;
                      const isSelected = selectedTask === camelCaseKey;
                      
                      return (
                        <button
                          key={camelCaseKey}
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
                          aria-label={`Configure ${workflow.displayName} settings`}
                          aria-pressed={isSelected}
                          className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                            isSelected 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{workflow.displayName}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">File Finder Stages</h3>
                </div>
                <div className="space-y-1 pl-2 border-l-2 border-muted">
                  {fileFinderStages.map((stage) => {
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
                  <h3 className="text-sm font-semibold text-foreground">Web Search Stages</h3>
                </div>
                <div className="space-y-1 pl-2 border-l-2 border-muted">
                  {webSearchStages.map((stage) => {
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
                
                <div className="p-4 bg-muted/30 rounded-lg border border-dashed border-muted">
                  <p className="text-sm text-muted-foreground text-center">
                    Settings Enhancement Engine is coming soon.<br/>
                    Configure individual settings below for now.
                  </p>
                </div>
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
                  onCopyButtonsChange={(copyButtons: CopyButtonConfig[]) => handleCopyButtonsChange(taskSettingsKey, copyButtons)}
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