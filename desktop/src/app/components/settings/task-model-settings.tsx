"use client";


import { type TaskSettings, type TaskType } from "@/types";
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
} from "@/ui";

import type React from "react";

// Interface for component props
interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  availableModels: ModelInfo[] | null;
  onSettingsChange: (settings: TaskSettings) => void;
}


// Task type definitions with user-friendly names and default settings
const taskTypeDefinitions: Record<
  TaskType,
  {
    label: string;
    defaultApiType: "google" | "anthropic" | "openai" | "deepseek";
    description?: string;
    hidden?: boolean; // Hide from UI while keeping backend functionality
  }
> = {
  path_finder: {
    label: "File Finder",
    defaultApiType: "google",
    description: "AI model used to find relevant files in your project",
  },
  voice_transcription: {
    label: "Voice Transcription",
    defaultApiType: "openai",
    description: "Convert speech to text using AI transcription",
  },
  path_correction: {
    label: "Path Correction",
    defaultApiType: "google",
    description: "Automatically correct and improve file paths",
  },
  text_improvement: {
    label: "Text Improvement",
    defaultApiType: "anthropic",
    description: "Enhance and refine text using AI",
  },
  text_correction: {
    label: "Text Correction",
    defaultApiType: "anthropic",
    description: "Correct and improve text for accuracy and clarity",
  },
  guidance_generation: {
    label: "AI Guidance",
    defaultApiType: "google",
    description: "Generate contextual guidance for your tasks",
  },
  implementation_plan: {
    label: "Implementation Plans",
    defaultApiType: "google",
    description: "Create detailed implementation plans for features",
  },
  // Hidden task types - backend functionality exists but not exposed in UI
  task_enhancement: {
    label: "Task Enhancement",
    defaultApiType: "google",
    hidden: true,
  },
  generic_llm_stream: {
    label: "Generic LLM Stream",
    defaultApiType: "google",
    hidden: true,
  },
  regex_pattern_generation: {
    label: "Regex Pattern Generation",
    defaultApiType: "anthropic",
    hidden: true,
  },
  regex_summary_generation: {
    label: "Regex Summary Generation",
    defaultApiType: "anthropic",
    hidden: true,
  },
  unknown: {
    label: "Default/Fallback",
    defaultApiType: "google",
    description: "Default settings for unspecified tasks",
    hidden: true,
  },
};

const taskTypeToSettingsKey: Record<string, string> = {
  implementation_plan: "implementationPlan",
  path_finder: "pathFinder",
  text_improvement: "textImprovement",
  voice_transcription: "transcription",
  text_correction: "textCorrection",
  path_correction: "pathCorrection",
  guidance_generation: "guidanceGeneration",
  task_enhancement: "taskEnhancement",
  generic_llm_stream: "genericLlmStream",
  regex_pattern_generation: "regexGeneration",
  regex_summary_generation: "regexSummaryGeneration",
  streaming: "streaming",
  unknown: "unknown",
};

export default function TaskModelSettings({
  taskSettings,
  availableModels,
  onSettingsChange,
}: TaskModelSettingsProps) {
  const getTaskSettings = (taskType: TaskType) => {
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;
    const settings = taskSettings[settingsKey];

    if (!settings) {
      console.error(
        `HARD ERROR: No settings found for task type: ${taskType} (mapped to ${settingsKey})`,
        { 
          taskType, 
          settingsKey, 
          availableKeys: Object.keys(taskSettings),
          fullTaskSettings: taskSettings 
        }
      );
      
      throw new Error(`CONFIGURATION ERROR: No settings found for task type: ${taskType} (mapped to ${settingsKey}). Available keys: ${Object.keys(taskSettings).join(', ')}. This indicates incomplete configuration loading - check server connection and database integrity.`);
    }

    return settings;
  };

  const handleModelChange = (taskType: TaskType, model: string) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    newSettings[settingsKey] = {
      ...settings,
      model,
    };

    onSettingsChange(newSettings);
  };

  const handleMaxTokensChange = (taskType: TaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    newSettings[settingsKey] = {
      ...settings,
      maxTokens: value[0],
    };

    onSettingsChange(newSettings);
  };

  const handleTemperatureChange = (taskType: TaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    newSettings[settingsKey] = {
      ...settings,
      temperature: value[0],
    };

    onSettingsChange(newSettings);
  };

  const getModelsForTask = (taskType: TaskType) => {
    if (!availableModels || availableModels.length === 0) {
      return [];
    }
    
    const apiType = taskTypeDefinitions[taskType].defaultApiType;
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
            const taskType = type as TaskType;
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
                              {config.defaultApiType.charAt(0).toUpperCase() +
                                config.defaultApiType.slice(1)}{" "}
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
                            value={settings.temperature}
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
                            step={0.05}
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
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
