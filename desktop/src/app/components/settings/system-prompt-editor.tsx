"use client";

import { type TaskType, type TaskTypeSupportingSystemPrompts, supportsSystemPrompts, TaskTypeDetails } from "@/types/task-type-defs";
import {
  Button,
  Badge,
  Alert,
  VirtualizedCodeViewer,
} from "@/ui";
import { useProjectSystemPrompt } from "@/hooks/use-project-system-prompts";
import { useState, useCallback, useEffect, useRef } from "react";

interface SystemPromptEditorProps {
  projectDirectory?: string;
  taskType: TaskType;
  onSave?: () => void;
}

export function SystemPromptEditor({ projectDirectory, taskType, onSave }: SystemPromptEditorProps) {
  const { prompt, loading, error, isCustom, update, reset, validate } = useProjectSystemPrompt({
    projectDirectory: projectDirectory || '',
    taskType: taskType as TaskTypeSupportingSystemPrompts,
    autoLoad: !!projectDirectory && supportsSystemPrompts(taskType)
  });
  
  const isSupported = supportsSystemPrompts(taskType);
  
  const [editedPrompt, setEditedPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [serverDefault, setServerDefault] = useState<{systemPrompt: string, description?: string} | null>(null);

  const currentPrompt = prompt || '';
  const defaultPrompt = serverDefault;
  
  useEffect(() => {
    if (!isCustom && prompt) {
      setServerDefault({
        systemPrompt: prompt,
        description: `Default system prompt for ${TaskTypeDetails[taskType]?.displayName || taskType}`
      });
    }
  }, [isCustom, prompt, taskType]);

  const handlePromptChange = useCallback((value: string) => {
    setEditedPrompt(value);
    setValidationError(null);
    setHasUnsavedChanges(value !== currentPrompt);
  }, [currentPrompt]);

  const handleSave = useCallback(async () => {
    const valueToSave = editedPrompt || currentPrompt;
    const validation = validate(valueToSave);
    if (!validation.isValid) {
      setValidationError(validation.errors.join(', '));
      return;
    }

    setIsSaving(true);
    try {
      await update(valueToSave);
      setHasUnsavedChanges(false);
      onSave?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  }, [editedPrompt, currentPrompt, validate, update, onSave]);

  const handleReset = useCallback(async () => {
    setIsSaving(true);
    try {
      await reset();
      setEditedPrompt('');
      setHasUnsavedChanges(false);
      onSave?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to reset prompt');
    } finally {
      setIsSaving(false);
    }
  }, [reset, onSave]);


  const displayedPrompt = editedPrompt || currentPrompt;
  const placeholders: string[] = currentPrompt ? 
    (currentPrompt.match(/\{\{([A-Z_]+)\}\}/g) || []).map(match => match.slice(2, -2)) : [];
  
  if (!isSupported) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          System prompts are not available for this task type.
        </p>
      </div>
    );
  }

  if (!projectDirectory) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          No project directory available. Please open a project to manage system prompts.
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
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium">System Prompt</h4>
            <p className="text-xs text-muted-foreground">{defaultPrompt?.description || 'Default system prompt'}</p>
          </div>
          <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
            <Button
              variant={!isCustom ? "filter-active" : "filter"}
              size="xs"
              className="px-3 h-7 text-xs"
              onClick={() => {
                if (isCustom) {
                  handleReset();
                }
              }}
            >
              Default
            </Button>
            <div className="w-[1px] h-5 bg-border/40" />
            <Button
              variant={isCustom ? "filter-active" : "filter"}
              size="xs"
              className="px-3 h-7 text-xs"
              onClick={async () => {
                if (!isCustom) {
                  setIsSaving(true);
                  setValidationError(null);
                  
                  try {
                    const promptToSave = defaultPrompt?.systemPrompt || '';
                    await update(promptToSave);
                    setEditedPrompt('');
                  } catch (err) {
                    setValidationError(err instanceof Error ? err.message : 'Failed to activate custom prompt');
                  } finally {
                    setIsSaving(false);
                  }
                }
              }}
              disabled={isSaving}
            >
              Custom
            </Button>
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
          <div className="space-y-2">
            <VirtualizedCodeViewer
              content={isCustom ? displayedPrompt : (defaultPrompt?.systemPrompt || '')}
              height="400px"
              showCopy={true}
              copyText="Copy Prompt"
              showContentSize={true}
              readOnly={!isCustom}
              placeholder={isCustom ? "Enter your custom system prompt..." : "Default system prompt was not defined"}
              language="markdown"
              onChange={isCustom ? (value) => handlePromptChange(value || '') : undefined}
              virtualizationThreshold={10000}
              className={isCustom ? "border-primary/40" : "bg-muted/30 border-muted"}
              enableTextImprovement={true}
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

          {isCustom && (
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
                className="cursor-pointer"
              >
                Reset to Default
              </Button>
              <Button 
                variant={hasUnsavedChanges ? "default" : "outline"}
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
                className="cursor-pointer"
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}