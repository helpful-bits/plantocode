"use client";

import { type TaskSettings } from "@/types";
import { type TaskType, TaskTypeDetails } from "@/types/task-type-defs";
import { type ProviderWithModels } from "@/types/config-types";
import {
  Label,
  Slider,
  Input,
  Button,
  Badge,
  Alert,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/ui";
import { SystemPromptEditor } from "./system-prompt-editor";
import { ModelSelector } from "./model-selector";
import type React from "react";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface TaskSettingsEditorProps {
  taskKey: keyof TaskSettings;
  settings: any;
  serverDefaults: TaskSettings | null;
  validation: ValidationResult;
  projectDirectory?: string;
  onModelChange: (model: string) => void;
  onTemperatureChange: (value: number[]) => void;
  onTemperatureCommit: (value: number[]) => void;
  onMaxTokensChange: (value: number[]) => void;
  onMaxTokensCommit: (value: number[]) => void;
  onTranscriptionLanguageChange: (languageCode: string) => void;
  onResetToDefault: (settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode') => void;
  isDifferentFromDefault: (settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode') => boolean;
  getSliderValue: (settingName: 'maxTokens' | 'temperature') => number;
  providersWithModels: ProviderWithModels[] | null;
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

export const TRANSCRIPTION_LANGUAGES = [
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

export function TaskSettingsEditor({
  taskKey,
  settings,
  serverDefaults,
  validation,
  projectDirectory,
  onModelChange,
  onTemperatureChange,
  onTemperatureCommit,
  onMaxTokensChange,
  onMaxTokensCommit,
  onTranscriptionLanguageChange,
  onResetToDefault,
  isDifferentFromDefault,
  getSliderValue,
  providersWithModels,
}: TaskSettingsEditorProps) {
  const taskType = taskSettingsKeyToTaskType[taskKey];
  const taskDetails = TaskTypeDetails[taskType];
  
  const isVoiceTranscription = taskKey === 'voiceTranscription';
  const currentLanguage = settings.languageCode || 'en';

  const filteredProviders = providersWithModels ? 
    (isVoiceTranscription 
      ? providersWithModels.filter(p => p.provider.code === 'openai_transcription')
      : providersWithModels.filter(p => p.provider.code !== 'openai_transcription')
    ) : [];

  return (
    <div className="w-full space-y-6">
      <SystemPromptEditor
        key={taskType}
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
              htmlFor={`model-select-${taskKey}`}
              className="text-sm font-medium"
            >
              Model
            </Label>
            {isDifferentFromDefault('model') && (
              <Button
                variant="ghost"
                size="xs"
                className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onResetToDefault('model')}
              >
                Reset
              </Button>
            )}
          </div>
<ModelSelector
            providers={filteredProviders}
            selectedModelId={settings.model || (serverDefaults?.[taskKey]?.model || "")}
            onSelect={onModelChange}
            disableTooltips={isVoiceTranscription}
          />
        </div>

        {/* Second Column - Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor={`temperature-${taskKey}`}
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
              {isDifferentFromDefault('temperature') && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onResetToDefault('temperature')}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 min-w-[120px]">
              <Slider
                id={`temperature-${taskKey}`}
                value={[getSliderValue('temperature')]}
                max={1}
                min={0}
                step={0.05}
                onValueChange={onTemperatureChange}
                onValueCommit={onTemperatureCommit}
                className="w-full"
                aria-label="Temperature"
              />
            </div>
            <Input
              type="number"
              value={getSliderValue('temperature').toFixed(2)}
              onChange={(
                e: React.ChangeEvent<HTMLInputElement>
              ) => {
                const value = parseFloat(e.target.value);
                if (e.target.value === '' || (
                  !isNaN(value) && 
                  value >= 0 && 
                  value <= 1
                )) {
                  onTemperatureChange([value || 0.7]);
                }
              }}
              onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 1) {
                  onTemperatureCommit([value]);
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
            {taskKey === "pathCorrection" || taskKey === "pathFinder"
              ? "Lower values produce more accurate path suggestions"
              : taskKey === "textCorrection"
              ? "Lower values for accuracy, higher for more creative corrections"
              : "Lower (0.0-0.3): factual and precise. Higher (0.7-1.0): creative and varied."}
          </p>
        </div>

        {/* Third Column - Language for voice transcription, Max Tokens for others */}
        {isVoiceTranscription ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor={`language-select-${taskKey}`}
                className="text-sm font-medium"
              >
                Language
              </Label>
              {isDifferentFromDefault('languageCode') && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onResetToDefault('languageCode')}
                >
                  Reset
                </Button>
              )}
            </div>
            <Select
              value={currentLanguage}
              onValueChange={onTranscriptionLanguageChange}
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
                htmlFor={`max-tokens-${taskKey}`}
                className="text-sm font-medium"
              >
                Max Tokens
              </Label>
              {isDifferentFromDefault('maxTokens') && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onResetToDefault('maxTokens')}
                >
                  Reset
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 min-w-[120px]">
                <Slider
                  id={`max-tokens-${taskKey}`}
                  value={[getSliderValue('maxTokens')]}
                  max={100000}
                  min={1000}
                  step={1000}
                  onValueChange={onMaxTokensChange}
                  onValueCommit={onMaxTokensCommit}
                  className="w-full"
                  aria-label="Max tokens"
                />
              </div>
              <Input
                type="number"
                value={getSliderValue('maxTokens')}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement>
                ) => {
                  const value = parseInt(e.target.value);
                  if (e.target.value === '' || (
                    !isNaN(value) &&
                    value >= 1000 &&
                    value <= 100000
                  )) {
                    onMaxTokensChange([value || 4000]);
                  }
                }}
                onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 1000 && value <= 100000) {
                    onMaxTokensCommit([value]);
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
}