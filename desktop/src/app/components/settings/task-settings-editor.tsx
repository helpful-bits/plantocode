"use client";

import { type TaskSettings } from "@/types";
import { TaskTypeDetails } from "@/types/task-type-defs";
import { type ProviderWithModels, type CopyButtonConfig } from "@/types/config-types";
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
import TaskSettingsCard from "./task-settings-card";
import { CopyButtonListEditor } from "./copy-button-list-editor";
import { ValidationResult, taskSettingsKeyToTaskType, TRANSCRIPTION_LANGUAGES } from "./shared/task-settings-types";
import type React from "react";


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
  onCopyButtonsChange: (copyButtons: CopyButtonConfig[]) => void;
  onResetToDefault: (settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode' | 'copyButtons') => void;
  isDifferentFromDefault: (settingName: 'model' | 'maxTokens' | 'temperature' | 'languageCode' | 'copyButtons') => boolean;
  getSliderValue: (settingName: 'maxTokens' | 'temperature') => number;
  providersWithModels: ProviderWithModels[] | null;
  readOnly?: boolean; // New flag for read-only mode
}



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
  onCopyButtonsChange,
  onResetToDefault,
  isDifferentFromDefault,
  getSliderValue,
  providersWithModels,
  readOnly = false, // Disable editing of AI model parameters
}: TaskSettingsEditorProps) {
  const taskType = taskSettingsKeyToTaskType[taskKey];
  const taskDetails = TaskTypeDetails[taskType];
  
  const isVoiceTranscription = taskKey === 'voiceTranscription';
  const currentLanguage = settings.languageCode || 'en';


  return (
    <div className="w-full space-y-6">
      <TaskSettingsCard title="System Prompt">
        <SystemPromptEditor
          key={taskType}
          projectDirectory={projectDirectory}
          taskType={taskType}
        />
      </TaskSettingsCard>
      
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
          </div>
        )}
      </div>
      
      {taskDetails?.requiresLlm !== false ? (
      <TaskSettingsCard title="Model Parameters">
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
            {!readOnly && isDifferentFromDefault('model') && (
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
            providers={providersWithModels || []}
            selectedModelId={settings.model || (serverDefaults?.[taskKey]?.model || "")}
            onSelect={onModelChange}
            disableTooltips={isVoiceTranscription}
            disabled={readOnly}
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
              {!readOnly && isDifferentFromDefault('temperature') && (
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
                disabled={readOnly}
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
              disabled={readOnly}
            />
          </div>
          <p className="text-xs text-muted-foreground text-balance">
            {taskKey === "extendedPathFinder"
              ? "Lower values produce more accurate path suggestions"
              : taskKey === "textImprovement"
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
              {!readOnly && isDifferentFromDefault('languageCode') && (
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
              disabled={readOnly}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel key={`${taskKey}-languages-label`}>Available Languages</SelectLabel>
                  {TRANSCRIPTION_LANGUAGES.map((lang) => (
                    <SelectItem key={`${taskKey}-${lang.code}`} value={lang.code}>
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
              {!readOnly && isDifferentFromDefault('maxTokens') && (
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
                  disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum output tokens for this task type
            </p>
          </div>
        )}
        </div>
      </TaskSettingsCard>
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

      {/* Copy Buttons Section - Only for Implementation Plans */}
      {taskKey === 'implementationPlan' && (
        <TaskSettingsCard title="Copy Buttons">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <p className="text-xs text-muted-foreground">
              Configure buttons that appear when viewing implementation plans for quick copying.
            </p>
            {!readOnly && isDifferentFromDefault('copyButtons') && (
              <Button
                variant="ghost"
                size="xs"
                className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onResetToDefault('copyButtons')}
              >
                Reset to Default
              </Button>
            )}
          </div>
          <CopyButtonListEditor
            copyButtons={(() => {
              const buttons = settings.copyButtons || serverDefaults?.[taskKey]?.copyButtons || [];
              // Ensure all buttons have IDs
              return buttons.map((button: CopyButtonConfig, index: number) => ({
                ...button,
                id: button.id || `default-button-${index}`
              }));
            })()}
            onChange={onCopyButtonsChange}
            showCustomizeButton={!settings.copyButtons && !!serverDefaults?.[taskKey]?.copyButtons}
            onCustomize={() => {
              // Copy server defaults to user settings to enable editing
              const defaultButtons = serverDefaults?.[taskKey]?.copyButtons || [];
              // Ensure each button has a unique ID
              const buttonsWithIds = defaultButtons.map((button, index) => ({
                ...button,
                id: button.id || `button-${Date.now()}-${index}`
              }));
              onCopyButtonsChange(buttonsWithIds);
            }}
            readOnly={readOnly}
          />
        </div>
      </TaskSettingsCard>
      )}
    </div>
  );
}