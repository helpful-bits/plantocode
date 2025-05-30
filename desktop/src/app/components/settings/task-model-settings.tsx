"use client";


import { type TaskSettings, type TaskType as SessionTaskType } from "@/types";
import { type TaskType as SystemPromptTaskType } from "@/types/system-prompts";
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
  Textarea,
  Badge,
  Alert,
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
  taskType: SessionTaskType;
  onSave?: () => void;
}

function SystemPromptEditor({ sessionId, taskType, onSave }: SystemPromptEditorProps) {
  // Check if this task type supports system prompts
  const supportedTaskTypes: SystemPromptTaskType[] = [
    'path_finder',
    'text_improvement', 
    'guidance_generation',
    'text_correction',
    'implementation_plan',
    'path_correction',
    'task_enhancement',
    'regex_pattern_generation',
    'regex_summary_generation',
    'generic_llm_stream'
  ];
  
  const isSupported = supportedTaskTypes.includes(taskType as SystemPromptTaskType);
  
  const { prompt, loading, error, isCustom, update, reset, validate } = useSystemPrompt({
    sessionId: sessionId || '',
    taskType: taskType as SystemPromptTaskType,
    autoLoad: !!sessionId && isSupported
  });
  const { getDefault } = useDefaultSystemPrompts();
  
  const [editedPrompt, setEditedPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const defaultPrompt = getDefault(taskType as SystemPromptTaskType);
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
      <div className="mt-6 p-4 rounded-lg border">
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
            {isCustom && <Badge variant="secondary" className="text-xs">Custom</Badge>}
            {!isCustom && <Badge variant="outline" className="text-xs">Default</Badge>}
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
          <Textarea
            value={displayedPrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="Enter your custom system prompt..."
            rows={20}
            className="font-mono text-sm min-h-96"
          />

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


// Task type definitions with user-friendly names and default settings
const taskTypeDefinitions: Record<
  SessionTaskType,
  {
    label: string;
    defaultProvider: "google" | "anthropic" | "openai" | "deepseek";
    description?: string;
    hidden?: boolean; // Hide from UI while keeping backend functionality
  }
> = {
  path_finder: {
    label: "File Finder",
    defaultProvider: "google",
    description: "AI model used to find relevant files in your project",
  },
  voice_transcription: {
    label: "Voice Transcription",
    defaultProvider: "openai",
    description: "Convert speech to text using AI transcription",
  },
  path_correction: {
    label: "Path Correction",
    defaultProvider: "google",
    description: "Automatically correct and improve file paths",
  },
  text_improvement: {
    label: "Text Improvement",
    defaultProvider: "anthropic",
    description: "Enhance and refine text using AI",
  },
  text_correction: {
    label: "Text Correction",
    defaultProvider: "anthropic",
    description: "Correct and improve text for accuracy and clarity",
  },
  guidance_generation: {
    label: "AI Guidance",
    defaultProvider: "google",
    description: "Generate contextual guidance for your tasks",
  },
  implementation_plan: {
    label: "Implementation Plans",
    defaultProvider: "google",
    description: "Create detailed implementation plans for features",
  },
  file_finder_workflow: {
    label: "File Finder Workflow",
    defaultProvider: "google",
    description: "Advanced file finding workflow with multiple steps",
  },
  // Hidden task types - backend functionality exists but not exposed in UI
  task_enhancement: {
    label: "Task Enhancement",
    defaultProvider: "google",
    hidden: true,
  },
  generic_llm_stream: {
    label: "Generic LLM Stream",
    defaultProvider: "google",
    hidden: true,
  },
  regex_pattern_generation: {
    label: "Regex Pattern Generation",
    defaultProvider: "anthropic",
    hidden: true,
  },
  regex_summary_generation: {
    label: "Regex Summary Generation",
    defaultProvider: "anthropic",
    hidden: true,
  },
  server_proxy_transcription: {
    label: "Server Proxy Transcription",
    defaultProvider: "openai",
    hidden: true,
  },
  streaming: {
    label: "Streaming",
    defaultProvider: "google",
    hidden: true,
  },
  unknown: {
    label: "Default/Fallback",
    defaultProvider: "google",
    description: "Default settings for unspecified tasks",
    hidden: true,
  },
};


export default function TaskModelSettings({
  taskSettings,
  availableModels,
  onSettingsChange,
  sessionId,
}: TaskModelSettingsProps) {
  const getTaskSettings = (taskType: SessionTaskType) => {
    const settings = taskSettings[taskType as keyof TaskSettings];

    if (!settings) {
      console.error(
        `HARD ERROR: No settings found for task type: ${taskType}`,
        { 
          taskType, 
          availableKeys: Object.keys(taskSettings),
          fullTaskSettings: taskSettings 
        }
      );
      
      throw new Error(`CONFIGURATION ERROR: No settings found for task type: ${taskType}. Available keys: ${Object.keys(taskSettings).join(', ')}. This indicates incomplete configuration loading - check server connection and database integrity.`);
    }

    return settings;
  };

  const handleModelChange = (taskType: SessionTaskType, model: string) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };

    newSettings[taskType as keyof TaskSettings] = {
      ...settings,
      model,
    };

    onSettingsChange(newSettings);
  };

  const handleMaxTokensChange = (taskType: SessionTaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };

    newSettings[taskType as keyof TaskSettings] = {
      ...settings,
      maxTokens: value[0],
    };

    onSettingsChange(newSettings);
  };

  const handleTemperatureChange = (taskType: SessionTaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };

    newSettings[taskType as keyof TaskSettings] = {
      ...settings,
      temperature: value[0],
    };

    onSettingsChange(newSettings);
  };

  const getModelsForTask = (taskType: SessionTaskType) => {
    if (!availableModels || availableModels.length === 0) {
      return [];
    }
    
    const apiType = taskTypeDefinitions[taskType].defaultProvider;
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
        <Tabs defaultValue="path_finder">
          <TabsList className="mb-4 flex flex-wrap gap-1 h-auto p-1">
            {Object.entries(taskTypeDefinitions).map(
              ([type, config]) =>
                !config.hidden && (
                  <TabsTrigger
                    key={type}
                    value={type}
                    className="text-xs px-3 h-8"
                  >
                    {config.label}
                  </TabsTrigger>
                )
            )}
          </TabsList>

          {Object.entries(taskTypeDefinitions).map(([type, config]) => {
            const taskType = type as SessionTaskType;
            if (config.hidden) return null;

            const settings = getTaskSettings(taskType);
            const models = getModelsForTask(taskType);

            return (
              <TabsContent key={type} value={type} className="w-full">
                <div className="w-full">
                  {/* Task description */}
                  {config.description && (
                    <div className="mb-6 p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {config.description}
                      </p>
                    </div>
                  )}
                  
                  {/* Model, Max Tokens, and Temperature in the same row */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-6">
                    {/* Model Selection */}
                    <div className="space-y-2">
                      <Label
                        htmlFor={`model-select-${type}`}
                        className="text-sm font-medium"
                      >
                        Model
                      </Label>
                      <Select
                        value={settings.model}
                        onValueChange={(value: string) =>
                          handleModelChange(taskType, value)
                        }
                      >
                        <SelectTrigger
                          id={`model-select-${type}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>
                              {config.defaultProvider.charAt(0).toUpperCase() +
                                config.defaultProvider.slice(1)}{" "}
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
                      <Label
                        htmlFor={`max-tokens-${type}`}
                        className="text-sm font-medium"
                      >
                        Max Tokens
                      </Label>
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 min-w-[120px]">
                          <Slider
                            id={`max-tokens-${type}`}
                            defaultValue={[settings.maxTokens]}
                            max={100000}
                            min={1000}
                            step={1000}
                            onValueChange={(value: number[]) =>
                              handleMaxTokensChange(taskType, value)
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
                              handleMaxTokensChange(taskType, [value]);
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
                    {(taskType as string) !== "voice_transcription" ? (
                      <div className="space-y-2">
                        <Label
                          htmlFor={`temperature-${type}`}
                          className="text-sm font-medium"
                        >
                          Temperature
                        </Label>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 min-w-[120px]">
                            <Slider
                              id={`temperature-${type}`}
                              defaultValue={[settings.temperature]}
                              max={1}
                              min={0}
                              step={0.05}
                              onValueChange={(value: number[]) =>
                                handleTemperatureChange(taskType, value)
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
                                handleTemperatureChange(taskType, [value]);
                              }
                            }}
                            className="w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2"
                            min={0}
                            max={1}
                            step={0.01}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-balance">
                          {taskType === "path_correction" || taskType === "path_finder"
                            ? "Lower values produce more accurate path suggestions"
                            : taskType === "voice_transcription"
                            ? "Not applicable for transcription models"
                            : taskType === "text_correction"
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
