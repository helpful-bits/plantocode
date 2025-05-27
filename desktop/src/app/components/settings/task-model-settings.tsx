"use client";


import { type TaskSettings, type TaskType } from "@/types";
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
  onSettingsChange: (settings: TaskSettings) => void;
}

// Model options by API type
const modelOptions = {
  gemini: [
    {
      value: "google/gemini-2.5-flash-preview-05-20:thinking",
      label: "Gemini 2.5 Flash Thinking",
      description: "Latest 2025 model with advanced reasoning capabilities.",
    },
    {
      value: "google/gemini-2.5-flash-preview-05-20",
      label: "Gemini 2.5 Flash Preview",
      description: "Fast response, great for most tasks.",
    },
    {
      value: "google/gemini-2.5-pro-preview",
      label: "Gemini 2.5 Pro Preview",
      description: "Higher quality, better reasoning for complex tasks.",
    },
    {
      value: "google/gemini-2.5-flash-preview-05-20",
      label: "Gemini 2.5 Flash (Legacy)",
      description: "Legacy flash model for compatibility.",
    },
  ],
  claude: [
    {
      value: "anthropic/claude-sonnet-4",
      label: "Claude Sonnet 4",
      description: "Latest 2025 model with advanced coding and reasoning capabilities.",
    },
    {
      value: "claude-3-7-sonnet-20250219",
      label: "Claude 3.7 Sonnet",
      description: "High quality for complex text processing.",
    },
    {
      value: "claude-opus-4-20250522",
      label: "Claude Opus 4",
      description: "Most intelligent model with state-of-the-art agent capabilities.",
    },
  ],
  whisper: [
    {
      value: "whisper-large-v3",
      label: "Whisper Large v3",
      description: "Latest model for accurate transcription.",
    },
  ],
  reasoning: [
    {
      value: "deepseek/deepseek-r1",
      label: "DeepSeek R1",
      description: "State-of-the-art reasoning model, performance on par with OpenAI o1.",
    },
    {
      value: "deepseek/deepseek-r1-distill-qwen-32b",
      label: "DeepSeek R1 Distill 32B",
      description: "Distilled reasoning model with excellent performance.",
    },
  ],
};

// Task type definitions with user-friendly names and default settings
const taskTypeDefinitions: Record<
  TaskType,
  {
    label: string;
    defaultApiType: "gemini" | "claude" | "whisper" | "reasoning";
  }
> = {
  path_finder: {
    label: "Path Finder",
    defaultApiType: "gemini",
  },
  transcription: {
    label: "Voice Transcription",
    defaultApiType: "whisper",
  },
  regex_generation: {
    label: "Regex Generation",
    defaultApiType: "claude",
  },
  regex_summary_generation: {
    label: "Regex Summary Generation",
    defaultApiType: "claude",
  },
  path_correction: {
    label: "Path Correction",
    defaultApiType: "gemini",
  },
  text_improvement: {
    label: "Text Improvement",
    defaultApiType: "claude",
  },
  voice_correction: {
    label: "Voice Correction",
    defaultApiType: "claude",
  },
  task_enhancement: {
    label: "Task Enhancement",
    defaultApiType: "gemini",
  },
  guidance_generation: {
    label: "Guidance Generation",
    defaultApiType: "gemini",
  },
  implementation_plan: {
    label: "Implementation Plan",
    defaultApiType: "reasoning",
  },
  generic_llm_stream: {
    label: "Generic LLM Stream",
    defaultApiType: "gemini",
  },
  generate_directory_tree: {
    label: "Generate Directory Tree",
    defaultApiType: "gemini",
  },
  text_correction_post_transcription: {
    label: "Post-Transcription Correction",
    defaultApiType: "claude",
  },
  unknown: {
    label: "Unknown Task",
    defaultApiType: "gemini",
  },
};

// Map from TaskType (snake_case) to TaskSettings (camelCase)
// This mapping MUST match the backend snake_to_camel_case function in settings_commands.rs
const taskTypeToSettingsKey: Record<string, string> = {
  implementation_plan: "implementationPlan",
  path_finder: "pathFinder",
  text_improvement: "textImprovement",
  transcription: "transcription",
  voice_correction: "voiceCorrection",
  path_correction: "pathCorrection",
  regex_generation: "regexGeneration",
  guidance_generation: "guidanceGeneration",
  task_enhancement: "taskEnhancement",
  generic_llm_stream: "genericLlmStream",
  regex_summary_generation: "regexSummaryGeneration",
  generate_directory_tree: "generateDirectoryTree",
  text_correction_post_transcription: "textCorrectionPostTranscription",
  streaming: "streaming",
  unknown: "unknown",
};

// Task model settings component
export default function TaskModelSettings({
  taskSettings,
  onSettingsChange,
}: TaskModelSettingsProps) {
  // Helper to ensure all task types have settings and map snake_case to camelCase
  const getTaskSettings = (taskType: TaskType) => {
    // Convert TaskType to TaskSettings key
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    // Get the settings for this task type from the taskSettings prop
    // This should already be complete from the backend
    const settings = taskSettings[settingsKey];

    if (!settings) {
      console.error(
        `No settings found for task type: ${taskType} (mapped to ${settingsKey})`
      );
      // This should not happen if taskSettings is properly loaded from server
      throw new Error(`No settings found for task type: ${taskType} (mapped to ${settingsKey}). Ensure server data is loaded properly.`);
    }

    return settings;
  };

  // Handle model change for a specific task
  const handleModelChange = (taskType: TaskType, model: string) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };

    // Convert TaskType to TaskSettings key
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    // Determine API type from the model
    // Model value already determined from selection
    if (model.includes("gemini") || model.includes("claude") || model.includes("whisper")) {
      // Model type handled automatically based on name
    }

    newSettings[settingsKey] = {
      ...settings,
      model,
    };

    onSettingsChange(newSettings);
  };

  // Handle max tokens change for a specific task
  const handleMaxTokensChange = (taskType: TaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };

    // Convert TaskType to TaskSettings key
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    newSettings[settingsKey] = {
      ...settings,
      maxTokens: value[0],
    };

    onSettingsChange(newSettings);
  };

  // Handle temperature change for a specific task
  const handleTemperatureChange = (taskType: TaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };

    // Convert TaskType to TaskSettings key
    const settingsKey = taskTypeToSettingsKey[taskType] as keyof TaskSettings;

    newSettings[settingsKey] = {
      ...settings,
      temperature: value[0],
    };

    onSettingsChange(newSettings);
  };

  // Get available models based on the task type's default API
  const getModelsForTask = (taskType: TaskType) => {
    const apiType = taskTypeDefinitions[taskType].defaultApiType;
    return modelOptions[apiType];
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
        <Tabs defaultValue="implementation_plan">
          <TabsList className="mb-4 flex flex-wrap gap-1 h-auto p-1">
            {Object.entries(taskTypeDefinitions).map(
              ([type, config]) =>
                type !== "unknown" && (
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
            if (taskType === "unknown") return null;

            const settings = getTaskSettings(taskType);
            const models = getModelsForTask(taskType);

            return (
              <TabsContent key={type} value={type} className="w-full">
                <div className="w-full max-w-full">
                  {/* Model, Max Tokens, and Temperature in the same row */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                              <SelectItem key={model.value} value={model.value}>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {models.find((m) => m.value === settings.model)
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
                      <div className="flex items-center gap-4 py-2 w-full">
                        <div className="flex-1 min-w-[70%] mr-4">
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
                          className="w-20 font-mono text-sm ml-auto text-right pr-2"
                          min={1000}
                          max={100000}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Maximum output tokens for this task type
                      </p>
                    </div>

                    {/* Temperature Slider - not used by whisper transcription */}
                    {taskType !== "transcription" ? (
                      <div className="space-y-2">
                        <Label
                          htmlFor={`temperature-${type}`}
                          className="text-sm font-medium"
                        >
                          Temperature
                        </Label>
                        <div className="flex items-center gap-4 py-2 w-full">
                          <div className="flex-1 min-w-[70%] mr-4">
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
                            className="w-16 font-mono text-sm ml-auto text-right pr-2"
                            min={0}
                            max={1}
                            step={0.05}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-balance">
                          {taskType === "path_correction" ||
                          taskType === "regex_generation"
                            ? "Lower values produce more accurate results"
                            : "Lower (0.0-0.3): factual. Higher (0.7-1.0): creative."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground/80">
                          Temperature
                        </Label>
                        <div className="flex items-center h-[38px] justify-center">
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
