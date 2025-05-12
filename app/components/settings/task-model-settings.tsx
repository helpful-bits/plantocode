"use client";

import React from "react";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { TaskSettings, TaskType } from "@/types";
import { DEFAULT_TASK_SETTINGS } from "@/lib/constants";

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
  generic_llm_stream: {
    label: "Generic LLM Stream",
    defaultApiType: 'gemini',
  },
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
  unknown: { 
    label: "Unknown Task", 
    defaultApiType: 'gemini',
  },
  streaming: {
    label: "Legacy Streaming",
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
              <TabsContent key={type} value={type}>
                <div className="space-y-6">
                  {/* Model Selection */}
                  <div className="grid grid-cols-4 items-center gap-4 mb-5">
                    <Label htmlFor={`model-select-${type}`} className="text-right text-sm font-medium">
                      Model
                    </Label>
                    <div className="col-span-3">
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
                      <p className="text-xs text-muted-foreground mt-1">
                        {models.find(m => m.value === settings.model)?.description || "Select a model"}
                        {settings.model && <span className="block text-[10px] text-muted-foreground/70 mt-0.5 font-mono">{settings.model}</span>}
                      </p>
                    </div>
                  </div>
                  
                  {/* Max Tokens Slider */}
                  <div className="grid grid-cols-4 items-center gap-4 mb-5">
                    <Label htmlFor={`max-tokens-${type}`} className="text-right text-sm font-medium">
                      Max Tokens
                    </Label>
                    <div className="col-span-3">
                      <div className="flex items-center gap-4">
                        <Slider
                          id={`max-tokens-${type}`}
                          defaultValue={[settings.maxTokens]}
                          max={100000}
                          min={1000}
                          step={1000}
                          onValueChange={(value) => handleMaxTokensChange(taskType, value)}
                          className="flex-1"
                        />
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
                          className="w-24 font-mono text-sm"
                          min={1000}
                          max={100000}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum output tokens for this task type
                      </p>
                    </div>
                  </div>
                  
                  {/* Temperature Slider - not used by whisper transcription */}
                  {taskType !== 'transcription' && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={`temperature-${type}`} className="text-right text-sm font-medium">
                        Temperature
                      </Label>
                      <div className="col-span-3">
                        <div className="flex items-center gap-4">
                          <Slider
                            id={`temperature-${type}`}
                            defaultValue={[settings.temperature as number]}
                            max={1}
                            min={0}
                            step={0.1}
                            onValueChange={(value) => handleTemperatureChange(taskType, value)}
                            className="flex-1"
                          />
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
                            className="w-20 font-mono text-sm"
                            min={0}
                            max={1}
                            step={0.1}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 text-balance">
                          {taskType === 'path_correction' || taskType === 'regex_generation' ? 
                            "Lower values produce more accurate results for this task" :
                            "Lower values (0.0-0.3) for predictable, factual outputs. Higher values (0.7-1.0) for more creative or diverse results."
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
} 