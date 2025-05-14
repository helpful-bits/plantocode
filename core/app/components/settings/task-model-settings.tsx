"use client";

import React from "react";
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
  Separator
} from "@core/components/ui";
import { TaskSettings, TaskType } from "@core/types";
import { DEFAULT_TASK_SETTINGS } from "@core/lib/constants";

// Interface for component props
interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  onSettingsChange: (settings: TaskSettings) => void;
  onInteraction?: () => void;
}

// Model options by API type
const modelOptions = {
  gemini: [
    { value: DEFAULT_TASK_SETTINGS.streaming.model, label: "Gemini 2.5 Flash", description: "Fast response, great for most tasks." },
    { value: DEFAULT_TASK_SETTINGS.implementation_plan.model, label: "Gemini 2.5 Pro", description: "Higher quality, better reasoning for complex tasks." },
  ],
  claude: [
    { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", description: "High quality for complex text processing." },
    { value: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet", description: "Balanced quality and speed." },
  ],
  whisper: [
    { value: "whisper-large-v3", label: "Whisper Large v3", description: "Latest model for accurate transcription." },
  ]
};

// Task type definitions with user-friendly names and default settings
const taskTypeDefinitions: Record<TaskType, {
  label: string;
  defaultApiType: 'gemini' | 'claude' | 'whisper';
}> = {
  pathfinder: {
    label: "Path Finder",
    defaultApiType: 'gemini',
  },
  transcription: {
    label: "Voice Transcription",
    defaultApiType: 'whisper',
  },
  regex_generation: {
    label: "Regex Generation",
    defaultApiType: 'claude',
  },
  path_correction: {
    label: "Path Correction",
    defaultApiType: 'gemini',
  },
  text_improvement: {
    label: "Text Improvement",
    defaultApiType: 'claude',
  },
  voice_correction: {
    label: "Voice Correction",
    defaultApiType: 'claude',
  },
  task_enhancement: {
    label: "Task Enhancement",
    defaultApiType: 'gemini',
  },
  guidance_generation: {
    label: "Guidance Generation",
    defaultApiType: 'gemini',
  },
  implementation_plan: {
    label: "Implementation Plan",
    defaultApiType: 'gemini',
  },
  generic_llm_stream: {
    label: "Generic LLM Stream",
    defaultApiType: 'gemini',
  },
  streaming: {
    label: "Streaming",
    defaultApiType: 'gemini',
  },
  unknown: {
    label: "Unknown Task",
    defaultApiType: 'gemini',
  }
};

// Task model settings component
export default function TaskModelSettings({ taskSettings, onSettingsChange, onInteraction }: TaskModelSettingsProps) {
  // Helper to ensure all task types have settings
  const getTaskSettings = (taskType: TaskType) => {
    // Start with defaults to ensure all properties exist
    const defaultSettings = DEFAULT_TASK_SETTINGS[taskType];
    
    if (taskSettings[taskType]) {
      // Merge user settings with defaults
      const userSettings = taskSettings[taskType]!;
      return {
        model: userSettings.model || defaultSettings.model,
        maxTokens: userSettings.maxTokens || defaultSettings.maxTokens,
        temperature: userSettings.temperature !== undefined ? 
          userSettings.temperature : defaultSettings.temperature
      };
    }
    
    // Return default settings from the centralized DEFAULT_TASK_SETTINGS
    return defaultSettings;
  };

  // Handle model change for a specific task
  const handleModelChange = (taskType: TaskType, model: string) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };
    
    // Determine API type from the model
    let apiType: 'gemini' | 'claude' | 'whisper';
    if (model.includes('gemini')) {
      apiType = 'gemini';
    } else if (model.includes('claude')) {
      apiType = 'claude';
    } else if (model.includes('whisper')) {
      apiType = 'whisper';
    } else {
      apiType = taskTypeDefinitions[taskType].defaultApiType;
    }
    
    newSettings[taskType] = {
      ...settings,
      model,
    };
    
    onSettingsChange(newSettings);
    if (onInteraction) {
      onInteraction();
    }
  };

  // Handle max tokens change for a specific task
  const handleMaxTokensChange = (taskType: TaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };
    
    newSettings[taskType] = {
      ...settings,
      maxTokens: value[0],
    };
    
    onSettingsChange(newSettings);
    if (onInteraction) {
      onInteraction();
    }
  };

  // Handle temperature change for a specific task
  const handleTemperatureChange = (taskType: TaskType, value: number[]) => {
    const settings = getTaskSettings(taskType);
    const newSettings = { ...taskSettings };
    
    newSettings[taskType] = {
      ...settings,
      temperature: value[0],
    };
    
    onSettingsChange(newSettings);
    if (onInteraction) {
      onInteraction();
    }
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
          Configure model settings for each task type in this project. These settings will be used when 
          running AI tasks like path finding, code generation, and text improvement.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="implementation_plan">
          <TabsList className="mb-4 flex flex-wrap gap-1 h-auto p-1">
            {Object.entries(taskTypeDefinitions).map(([type, config]) => (
              type !== 'unknown' && (
                <TabsTrigger key={type} value={type} className="text-xs px-3 h-8">
                  {config.label}
                </TabsTrigger>
              )
            ))}
          </TabsList>

          {Object.entries(taskTypeDefinitions).map(([type, config]) => {
            const taskType = type as TaskType;
            if (taskType === 'unknown') return null;

            const settings = getTaskSettings(taskType);
            const models = getModelsForTask(taskType);

            return (
              <TabsContent key={type} value={type} className="w-full">
                <div className="w-full max-w-full">
                  {/* Model, Max Tokens, and Temperature in the same row */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Model Selection */}
                    <div className="space-y-2">
                      <Label htmlFor={`model-select-${type}`} className="text-sm font-medium">
                        Model
                      </Label>
                      <Select
                        value={settings.model}
                        onValueChange={(value) => handleModelChange(taskType, value)}
                      >
                        <SelectTrigger id={`model-select-${type}`} className="w-full">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>{config.defaultApiType.charAt(0).toUpperCase() + config.defaultApiType.slice(1)} Models</SelectLabel>
                            {models.map(model => (
                              <SelectItem key={model.value} value={model.value}>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {models.find(m => m.value === settings.model)?.description || "Select a model"}
                        {settings.model && <span className="block text-[10px] text-muted-foreground/70 mt-0.5 font-mono">{settings.model}</span>}
                      </p>
                    </div>

                    {/* Max Tokens Slider */}
                    <div className="space-y-2">
                      <Label htmlFor={`max-tokens-${type}`} className="text-sm font-medium">
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
                            onValueChange={(value) => handleMaxTokensChange(taskType, value)}
                            className="w-full"
                            aria-label="Max tokens"
                          />
                        </div>
                        <Input
                          type="number"
                          value={settings.maxTokens}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            // Validate the input
                            if (!isNaN(value) && value >= 1000 && value <= 100000) {
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
                    {taskType !== 'transcription' ? (
                      <div className="space-y-2">
                        <Label htmlFor={`temperature-${type}`} className="text-sm font-medium">
                          Temperature
                        </Label>
                        <div className="flex items-center gap-4 py-2 w-full">
                          <div className="flex-1 min-w-[70%] mr-4">
                            <Slider
                              id={`temperature-${type}`}
                              defaultValue={[settings.temperature as number]}
                              max={1}
                              min={0}
                              step={0.05}
                              onValueChange={(value) => handleTemperatureChange(taskType, value)}
                              className="w-full"
                              aria-label="Temperature"
                            />
                          </div>
                          <Input
                            type="number"
                            value={settings.temperature as number}
                            onChange={(e) => {
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
                          {taskType === 'path_correction' || taskType === 'regex_generation' ?
                            "Lower values produce more accurate results" :
                            "Lower (0.0-0.3): factual. Higher (0.7-1.0): creative."
                          }
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