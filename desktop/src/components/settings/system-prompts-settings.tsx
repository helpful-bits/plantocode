import { useState, useCallback } from 'react';
import { TaskType } from '../../types/session-types';
import { useSystemPrompt, useDefaultSystemPrompts } from '../../hooks/use-system-prompts';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Alert } from '../../ui/alert';
import { VirtualizedCodeViewer } from '../../ui/virtualized-code-viewer';
import { extractPlaceholders, getAvailablePlaceholders } from '../../actions/system-prompts.actions';

interface SystemPromptsSettingsProps {
  sessionId: string;
  className?: string;
}

interface SystemPromptEditorProps {
  sessionId: string;
  taskType: TaskType;
  onSave?: () => void;
}

function SystemPromptEditor({ sessionId, taskType, onSave }: SystemPromptEditorProps) {
  const { prompt, loading, error, isCustom, update, reset, validate } = useSystemPrompt({
    sessionId,
    taskType
  });
  const { getDefault } = useDefaultSystemPrompts();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const defaultPrompt = getDefault(taskType);
  const currentPrompt = prompt?.systemPrompt || '';
  const taskDisplayName = getTaskTypeDisplayName(taskType);

  const handleStartEdit = useCallback(() => {
    setEditedPrompt(currentPrompt);
    setIsEditing(true);
    setValidationError(null);
  }, [currentPrompt]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedPrompt('');
    setValidationError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const validation = validate(editedPrompt);
    if (!validation.isValid) {
      setValidationError(validation.errors.join(', '));
      return;
    }

    setIsSaving(true);
    setValidationError(null);

    try {
      await update(editedPrompt);
      setIsEditing(false);
      setEditedPrompt('');
      onSave?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setIsSaving(false);
    }
  }, [editedPrompt, validate, update, onSave]);

  const handleReset = useCallback(async () => {
    if (!confirm('Are you sure you want to reset this prompt to the default? This will remove your custom prompt.')) {
      return;
    }

    setIsSaving(true);
    try {
      await reset();
      setIsEditing(false);
      setEditedPrompt('');
      onSave?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to reset prompt');
    } finally {
      setIsSaving(false);
    }
  }, [reset, onSave]);

  const placeholders = extractPlaceholders(isEditing ? editedPrompt : currentPrompt);
  const availablePlaceholders = getAvailablePlaceholders();

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">{taskDisplayName}</h3>
          <p className="text-sm text-gray-600">{defaultPrompt?.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {isCustom && <Badge variant="secondary">Custom</Badge>}
          {!isCustom && <Badge variant="outline">Default</Badge>}
          {prompt?.version && (
            <Badge variant="outline" className="text-xs">
              v{prompt.version}
            </Badge>
          )}
          {isCustom && prompt?.basedOnVersion && (
            <Badge variant="outline" className="text-xs text-gray-500">
              Based on v{prompt.basedOnVersion}
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          {error}
        </Alert>
      )}

      {validationError && (
        <Alert variant="destructive">
          {validationError}
        </Alert>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">System Prompt</label>
        <VirtualizedCodeViewer
          content={isEditing ? editedPrompt : currentPrompt}
          height="300px"
          showCopy={true}
          copyText="Copy Prompt"
          showContentSize={true}
          readOnly={!isEditing}
          placeholder={isEditing ? "Enter your custom system prompt..." : "No prompt available"}
          language="markdown"
          onChange={isEditing ? (value) => setEditedPrompt(value || '') : undefined}
          virtualizationThreshold={10000}
          className={isEditing ? "border-primary/40" : undefined}
        />
      </div>

      {placeholders.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Available Placeholders</label>
          <div className="flex flex-wrap gap-2">
            {placeholders.map((placeholder) => (
              <Badge key={placeholder} variant="outline" className="text-xs">
                {`{{${placeholder}}}`}
                {availablePlaceholders[placeholder] && (
                  <span className="ml-1 text-gray-500">
                    - {availablePlaceholders[placeholder]}
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {isEditing ? (
          <>
            <Button 
              variant="outline" 
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </>
        ) : (
          <>
            {isCustom && (
              <Button 
                variant="outline" 
                onClick={handleReset}
                disabled={isSaving}
              >
                Reset to Default
              </Button>
            )}
            <Button onClick={handleStartEdit}>
              {isCustom ? 'Edit' : 'Customize'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function getTaskTypeDisplayName(taskType: TaskType): string {
  const displayNames: Record<TaskType, string> = {
    'path_finder': 'Path Finder',
    'text_improvement': 'Text Improvement',
    'guidance_generation': 'Guidance Generation',
    'text_correction': 'Text Correction',
    'implementation_plan': 'Implementation Plan',
    'path_correction': 'Path Correction',
    'task_enhancement': 'Task Enhancement',
    'regex_pattern_generation': 'Regex Pattern Generation',
    'regex_summary_generation': 'Regex Summary Generation',
    'generic_llm_stream': 'Generic LLM Stream',
    'voice_transcription': 'Voice Transcription',
    'file_finder_workflow': 'File Finder Workflow',
    'server_proxy_transcription': 'Server Proxy Transcription',
    'streaming': 'Streaming',
    'directory_tree_generation': 'Directory Tree Generation',
    'local_file_filtering': 'Local File Filtering',
    'extended_path_finder': 'Extended Path Finder',
    'extended_path_correction': 'Extended Path Correction',
    'initial_path_finding': 'Initial Path Finding',
    'extended_path_finding': 'Extended Path Finding',
    'initial_path_correction': 'Initial Path Correction',
    'regex_generation': 'Regex Generation',
    'unknown': 'Unknown'
  };
  
  return displayNames[taskType] || taskType;
}

const TASK_CATEGORIES = {
  'Code Analysis': ['path_finder', 'path_correction', 'guidance_generation'],
  'Text Processing': ['text_improvement', 'text_correction'],
  'Development': ['implementation_plan', 'task_enhancement'],
  'Pattern Matching': ['regex_pattern_generation', 'regex_summary_generation'],
  'General': ['generic_llm_stream']
} as Record<string, TaskType[]>;

export function SystemPromptsSettings({ sessionId, className }: SystemPromptsSettingsProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handlePromptSaved = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <div className={className}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">System Prompts</h2>
          <p className="text-gray-600">
            Customize the system prompts used for different AI tasks. 
            These prompts control how the AI behaves for each type of request.
          </p>
        </div>

        {Object.entries(TASK_CATEGORIES).map(([category, taskTypes]) => (
          <div key={category} className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">{category}</h3>
            <div className="space-y-4">
              {taskTypes.map((taskType) => (
                <SystemPromptEditor
                  key={`${taskType}-${refreshTrigger}`}
                  sessionId={sessionId}
                  taskType={taskType}
                  onSave={handlePromptSaved}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-4 mt-8">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">About Placeholders</h4>
            <p className="text-sm text-blue-800">
              System prompts support dynamic placeholders like <code className="bg-blue-100 px-1 rounded">{'{{PROJECT_CONTEXT}}'}</code> 
              and <code className="bg-blue-100 px-1 rounded">{'{{CUSTOM_INSTRUCTIONS}}'}</code> that get replaced with actual values when the prompt is used. 
              This allows you to create flexible, reusable prompts that adapt to different contexts.
            </p>
          </div>
          
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-900 mb-2">Version Management</h4>
            <p className="text-sm text-green-800">
              Default prompts are versioned to track updates. When you customize a prompt, it shows which version of the default it was based on. 
              This helps you understand if the default has been updated since you made your customization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}