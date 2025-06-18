"use client";

import { TaskModelSettings } from "@/types/task-settings-types";
import { type ProviderWithModels } from "@/types/config-types";
import { Button, Input, Label, Slider } from "@/ui";
import { SystemPromptEditor } from "./system-prompt-editor";
import { CopyButtonListEditor } from "./copy-button-list-editor";
import { ModelSelector } from "./model-selector";
import type React from "react";

interface ImplementationPlanSettingsEditorProps {
  settings: TaskModelSettings;
  serverDefaults: TaskModelSettings | null;
  projectDirectory?: string;
  providersWithModels: ProviderWithModels[] | null;
  onSettingsChange: (settings: TaskModelSettings) => void;
  isDifferentFromDefault: (settingName: 'model' | 'maxTokens' | 'temperature' | 'copyButtons') => boolean;
  onResetToDefault: (settingName: 'model' | 'maxTokens' | 'temperature' | 'copyButtons') => void;
  getSliderValue: (settingName: 'maxTokens' | 'temperature') => number;
  onSliderChange: (settingName: 'maxTokens' | 'temperature', value: number[]) => void;
  onSliderCommit: (settingName: 'maxTokens' | 'temperature', value: number[]) => void;
}

export function ImplementationPlanSettingsEditor({
  settings,
  serverDefaults,
  projectDirectory,
  providersWithModels,
  onSettingsChange,
  isDifferentFromDefault,
  onResetToDefault,
  getSliderValue,
  onSliderChange,
  onSliderCommit,
}: ImplementationPlanSettingsEditorProps) {
  const handleModelChange = (model: string) => {
    onSettingsChange({
      ...settings,
      model,
    });
  };

  const handleCopyButtonsChange = (copyButtons: NonNullable<TaskModelSettings['copyButtons']>) => {
    onSettingsChange({
      ...settings,
      copyButtons,
    });
  };

  const filteredProviders = providersWithModels?.filter(p => p.provider.code !== 'openai_transcription') || [];

  return (
    <div className="w-full space-y-6">
      <SystemPromptEditor
        projectDirectory={projectDirectory}
        taskType="implementation_plan"
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Model</Label>
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
            selectedModelId={settings.model || (serverDefaults?.model || "")}
            onSelect={handleModelChange}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Temperature</Label>
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
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 min-w-[120px]">
              <Slider
                value={[getSliderValue('temperature')]}
                max={1}
                min={0}
                step={0.05}
                onValueChange={(value) => onSliderChange('temperature', value)}
                onValueCommit={(value) => onSliderCommit('temperature', value)}
                className="w-full"
                aria-label="Temperature"
              />
            </div>
            <Input
              type="number"
              value={getSliderValue('temperature').toFixed(2)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = parseFloat(e.target.value);
                if (e.target.value === '' || (!isNaN(value) && value >= 0 && value <= 1)) {
                  onSliderChange('temperature', [value || 0.7]);
                }
              }}
              onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 1) {
                  onSliderCommit('temperature', [value]);
                }
              }}
              className="w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2"
              min={0}
              max={1}
              step={0.01}
              placeholder="0.70"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Lower values for more focused plans, higher for more creative approaches
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Max Tokens</Label>
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
                value={[getSliderValue('maxTokens')]}
                max={100000}
                min={1000}
                step={1000}
                onValueChange={(value) => onSliderChange('maxTokens', value)}
                onValueCommit={(value) => onSliderCommit('maxTokens', value)}
                className="w-full"
                aria-label="Max tokens"
              />
            </div>
            <Input
              type="number"
              value={getSliderValue('maxTokens')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = parseInt(e.target.value);
                if (e.target.value === '' || (!isNaN(value) && value >= 1000 && value <= 100000)) {
                  onSliderChange('maxTokens', [value || 4000]);
                }
              }}
              onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 1000 && value <= 100000) {
                  onSliderCommit('maxTokens', [value]);
                }
              }}
              className="w-24 font-mono text-sm text-right shrink-0 text-foreground pr-2"
              min={1000}
              max={100000}
              placeholder="4000"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum tokens for implementation plan generation
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Copy Buttons</Label>
          {isDifferentFromDefault('copyButtons') && (
            <Button
              variant="ghost"
              size="xs"
              className="px-2 h-6 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onResetToDefault('copyButtons')}
            >
              Reset
            </Button>
          )}
        </div>
        <CopyButtonListEditor
          copyButtons={settings.copyButtons || []}
          onChange={handleCopyButtonsChange}
        />
      </div>
    </div>
  );
}