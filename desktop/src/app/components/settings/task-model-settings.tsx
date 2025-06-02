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
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Input,
  Button,
  Badge,
  Alert,
  VirtualizedCodeViewer,
} from "@/ui";
import { useSystemPrompt, useDefaultSystemPrompts } from "@/hooks/use-system-prompts";
import { extractPlaceholders } from "@/actions/system-prompts.actions";
import { useState, useCallback } from "react";

import type React from "react";

// Interface for component props
interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  availableModels: ModelInfo[] | null;
  onSettingsChange: (settings: TaskSettings) => void;
  sessionId?: string;
}

// System Prompt Editor Component
interface SystemPromptEditorProps {
  sessionId?: string;
  taskType: TaskType;
  onSave?: () => void;
}

function SystemPromptEditor({ sessionId, taskType, onSave }: SystemPromptEditorProps) {
  // Check if this task type supports system prompts using the validation utility
  const isSupported = supportsSystemPrompts(taskType);
  
  const { prompt, loading, error, isCustom, update, reset, validate } = useSystemPrompt({
    sessionId: sessionId || '',
    taskType: taskType as TaskTypeSupportingSystemPrompts,
    autoLoad: !!sessionId && isSupported
  });
  const { getDefault } = useDefaultSystemPrompts();
  
  const [editedPrompt, setEditedPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);

  const defaultPrompt = getDefault(taskType as TaskTypeSupportingSystemPrompts);
  const currentPrompt = prompt?.systemPrompt || '';
  
  // Don't show system prompt editor for unsupported task types
  if (!isSupported) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          System prompts are not available for this task type.
        </p>
      </div>
    );
  }

  const handlePromptChange = useCallback((value: string) => {
    setEditedPrompt(value);
    setValidationError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const promptToSave = editedPrompt || currentPrompt;
    const validation = validate(promptToSave);
    if (!validation.isValid) {
      setValidationError(validation.errors.join(', '));
      return;
    }

    setIsSaving(true);
    setValidationError(null);

    try {
      await update(promptToSave);
      onSave?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  }, [editedPrompt, currentPrompt, validate, update, onSave]);

  const handleReset = useCallback(async () => {
    if (!confirm('Are you sure you want to reset this prompt to the default? This will remove your custom prompt.')) {
      return;
    }

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

  const displayedPrompt = editedPrompt || currentPrompt;
  const placeholders = extractPlaceholders(displayedPrompt);

  if (!sessionId) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          No active session. Please create or select a session to manage system prompts.
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
    <div className="mt-6 space-y-4">
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium">System Prompt</h4>
            <p className="text-xs text-muted-foreground">{defaultPrompt?.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCustom ? (
              <Badge variant="default" className="text-xs bg-blue-500/10 text-blue-600 border-blue-200">
                Project Custom
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                System Default
              </Badge>
            )}
            {defaultPrompt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDefaultPrompt(!showDefaultPrompt)}
                className="text-xs h-6 px-2"
              >
                {showDefaultPrompt ? 'Hide' : 'View'} Default
              </Button>
            )}
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
          {showDefaultPrompt && defaultPrompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Default Template</Label>
                <Badge variant="outline" className="text-xs">Read-only</Badge>
              </div>
              <VirtualizedCodeViewer
                content={defaultPrompt.systemPrompt || ''}
                height="250px"
                showCopy={true}
                copyText="Copy Default"
                showContentSize={true}
                readOnly={true}
                placeholder="No default prompt available"
                language="markdown"
                className="bg-muted/30 border-muted"
                virtualizationThreshold={5000}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {isCustom ? 'Custom Prompt' : 'Active Prompt (Default)'}
              </Label>
              {isCustom && (
                <Badge variant="secondary" className="text-xs">
                  Modified from default
                </Badge>
              )}
            </div>
            <VirtualizedCodeViewer
              content={displayedPrompt}
              height="400px"
              showCopy={true}
              copyText="Copy Prompt"
              showContentSize={true}
              readOnly={false}
              placeholder="Enter your custom system prompt..."
              language="markdown"
              onChange={(value) => handlePromptChange(value || '')}
              virtualizationThreshold={10000}
              className={isCustom ? "border-primary/40" : undefined}
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

          <div className="flex justify-end gap-2">
            {isCustom && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
              >
                Reset to Default
              </Button>
            )}
            <Button 
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Mapping camelCase TaskSettings keys to snake_case TaskType values
const taskSettingsKeyToTaskType: Record<keyof TaskSettings, TaskType> = {
  pathFinder: "path_finder",
  voiceTranscription: "voice_transcription",
  pathCorrection: "path_correction",
  textImprovement: "text_improvement",
  textCorrection: "text_correction",
  guidanceGeneration: "guidance_generation",
  implementationPlan: "implementation_plan",
  fileFinderWorkflow: "file_finder_workflow",
  localFileFiltering: "local_file_filtering",
  directoryTreeGeneration: "directory_tree_generation",
  extendedPathFinder: "extended_path_finder",
  extendedPathCorrection: "extended_path_correction",
  taskEnhancement: "task_enhancement",
  genericLlmStream: "generic_llm_stream",
  regexPatternGeneration: "regex_pattern_generation",
  regexSummaryGeneration: "regex_summary_generation",
  streaming: "streaming",
  unknown: "unknown",
};


export default function TaskModelSettings({
  taskSettings,
  availableModels,
  onSettingsChange,
  sessionId,
}: TaskModelSettingsProps) {
  const getTaskSettings = (camelCaseKey: keyof TaskSettings) => {
    const settings = taskSettings[camelCaseKey];
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;

    // For non-LLM tasks, settings might be incomplete or undefined
    if (!settings && !requiresLlm) {
      return {}; // Return empty settings for non-LLM tasks
    }

    if (!settings) {
      console.error(
        `HARD ERROR: No settings found for task type: ${camelCaseKey}`,
        { 
          camelCaseKey, 
          availableKeys: Object.keys(taskSettings),
          fullTaskSettings: taskSettings 
        }
      );
      
      throw new Error(`CONFIGURATION ERROR: No settings found for task type: ${camelCaseKey}. Available keys: ${Object.keys(taskSettings).join(', ')}. This indicates incomplete configuration loading - check server connection and database integrity.`);
    }

    return settings;
  };

  const handleModelChange = (camelCaseKey: keyof TaskSettings, model: string) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return; // Don't handle changes for non-LLM tasks
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      model,
    };

    onSettingsChange(newSettings);
  };

  const isSettingCustomized = (camelCaseKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature') => {
    const settings = getTaskSettings(camelCaseKey);
    
    // For now, we'll consider a setting customized if it differs from a reasonable default
    // This could be enhanced to compare against server-provided defaults
    const defaultValues = {
      model: '', // Empty means server default
      maxTokens: 4000,
      temperature: 0.3
    };
    
    return settings[settingName] !== defaultValues[settingName];
  };

  const handleMaxTokensChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return; // Don't handle changes for non-LLM tasks
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      maxTokens: value[0],
    };

    onSettingsChange(newSettings);
  };

  const handleTemperatureChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return; // Don't handle changes for non-LLM tasks
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      temperature: value[0],
    };

    onSettingsChange(newSettings);
  };

  const getModelsForTask = (camelCaseKey: keyof TaskSettings) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const taskDetails = TaskTypeDetails[taskType];
    const requiresLlm = taskDetails?.requiresLlm ?? true;
    if (!requiresLlm) return []; // No models for non-LLM tasks
    
    if (!availableModels || availableModels.length === 0) {
      return [];
    }
    
    const apiType = taskDetails?.defaultProvider || "google";
    return availableModels.filter(model => model.provider === apiType);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">AI Model Settings</CardTitle>
        <CardDescription className="text-balance">
          Configure model settings for each task type in this project. These
          settings will be used when running AI tasks like path finding, code
          generation, and text improvement.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="pathFinder">
          <TabsList className="mb-4 flex flex-wrap gap-1 h-auto p-1">
            {Object.entries(taskSettingsKeyToTaskType).map(
              ([camelCaseKey, taskType]) => {
                const taskDetails = TaskTypeDetails[taskType];
                return !taskDetails?.hidden && (
                  <TabsTrigger
                    key={camelCaseKey}
                    value={camelCaseKey}
                    className="text-xs px-3 h-8"
                  >
                    {taskDetails?.displayName || camelCaseKey}
                  </TabsTrigger>
                );
              }
            )}
          </TabsList>

          {Object.entries(taskSettingsKeyToTaskType).map(([camelCaseKey, taskType]) => {
            const taskSettingsKey = camelCaseKey as keyof TaskSettings;
            const taskDetails = TaskTypeDetails[taskType];
            if (taskDetails?.hidden) return null;

            const settings = getTaskSettings(taskSettingsKey);
            const models = getModelsForTask(taskSettingsKey);

            return (
              <TabsContent key={camelCaseKey} value={camelCaseKey} className="w-full">
                <div className="w-full">
                  {/* Task description */}
                  {taskDetails?.description && (
                    <div className="mb-6 p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {taskDetails.description}
                      </p>
                    </div>
                  )}
                  
                  {/* Model, Max Tokens, and Temperature in the same row */}
                  {taskDetails?.requiresLlm !== false ? (
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-6">
                    {/* Model Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`model-select-${camelCaseKey}`}
                          className="text-sm font-medium"
                        >
                          Model
                        </Label>
                        {isSettingCustomized(taskSettingsKey, 'model') && (
                          <Badge variant="secondary" className="text-xs">
                            Project Override
                          </Badge>
                        )}
                      </div>
                      <Select
                        value={settings.model}
                        onValueChange={(value: string) =>
                          handleModelChange(taskSettingsKey, value)
                        }
                      >
                        <SelectTrigger
                          id={`model-select-${camelCaseKey}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>
                              {(taskDetails?.defaultProvider || "google").charAt(0).toUpperCase() +
                                (taskDetails?.defaultProvider || "google").slice(1)}{" "}
                              Models
                            </SelectLabel>
                            {models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {models.find((m) => m.id === settings.model)
                          ?.description || "Select a model"}
                        {settings.model && (
                          <span className="block text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                            {settings.model}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Max Tokens Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`max-tokens-${camelCaseKey}`}
                          className="text-sm font-medium"
                        >
                          Max Tokens
                        </Label>
                        {isSettingCustomized(taskSettingsKey, 'maxTokens') && (
                          <Badge variant="secondary" className="text-xs">
                            Project Override
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 min-w-[120px]">
                          <Slider
                            id={`max-tokens-${camelCaseKey}`}
                            defaultValue={[settings.maxTokens ?? 4000]}
                            max={100000}
                            min={1000}
                            step={1000}
                            onValueChange={(value: number[]) =>
                              handleMaxTokensChange(taskSettingsKey, value)
                            }
                            className="w-full"
                            aria-label="Max tokens"
                          />
                        </div>
                        <Input
                          type="number"
                          value={settings.maxTokens}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement>
                          ) => {
                            const value = parseInt(e.target.value);
                            // Validate the input
                            if (
                              !isNaN(value) &&
                              value >= 1000 &&
                              value <= 100000
                            ) {
                              handleMaxTokensChange(taskSettingsKey, [value]);
                            }
                          }}
                          className="w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2"
                          min={1000}
                          max={100000}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Maximum output tokens for this task type
                      </p>
                    </div>

                    {/* Temperature Slider - not used by whisper transcription */}
                    {camelCaseKey !== "voiceTranscription" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`temperature-${camelCaseKey}`}
                            className="text-sm font-medium"
                          >
                            Temperature
                          </Label>
                          {isSettingCustomized(taskSettingsKey, 'temperature') && (
                            <Badge variant="secondary" className="text-xs">
                              Project Override
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 min-w-[120px]">
                            <Slider
                              id={`temperature-${camelCaseKey}`}
                              defaultValue={[settings.temperature ?? 0.7]}
                              max={1}
                              min={0}
                              step={0.05}
                              onValueChange={(value: number[]) =>
                                handleTemperatureChange(taskSettingsKey, value)
                              }
                              className="w-full"
                              aria-label="Temperature"
                            />
                          </div>
                          <Input
                            type="number"
                            value={Number(settings.temperature).toFixed(2)}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>
                            ) => {
                              const value = parseFloat(e.target.value);
                              // Validate the input range
                              if (!isNaN(value) && value >= 0 && value <= 1) {
                                handleTemperatureChange(taskSettingsKey, [value]);
                              }
                            }}
                            className="w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2"
                            min={0}
                            max={1}
                            step={0.01}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-balance">
                          {camelCaseKey === "pathCorrection" || camelCaseKey === "pathFinder"
                            ? "Lower values produce more accurate path suggestions"
                            : camelCaseKey === "voiceTranscription"
                            ? "Not applicable for transcription models"
                            : camelCaseKey === "textCorrection"
                            ? "Lower values for accuracy, higher for more creative corrections"
                            : "Lower (0.0-0.3): factual and precise. Higher (0.7-1.0): creative and varied."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground/80">
                          Temperature
                        </Label>
                        <div className="flex items-center h-[40px] justify-center">
                          <p className="text-xs text-muted-foreground italic">
                            Not used for transcription
                          </p>
                        </div>
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

                  {/* System Prompt Section */}
                  <SystemPromptEditor
                    sessionId={sessionId}
                    taskType={taskType}
                  />
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
