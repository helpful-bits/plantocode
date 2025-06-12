"use client";

import { type TaskSettings } from "@/types";
import { type TaskType, type TaskTypeSupportingSystemPrompts, supportsSystemPrompts, TaskTypeDetails } from "@/types/task-type-defs";
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
  Input,
  Button,
  Badge,
  Alert,
  VirtualizedCodeViewer,
  Tooltip,
} from "@/ui";
import { useSystemPrompt, useDefaultSystemPrompts } from "@/hooks/use-system-prompts";
import { extractPlaceholders } from "@/actions/system-prompts.actions";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import SettingsEnhancementEngine from "./settings-enhancement-engine";

import type React from "react";

interface TaskModelSettingsProps {
  taskSettings: TaskSettings;
  availableModels: ModelInfo[] | null;
  onSettingsChange: (settings: TaskSettings) => void;
  sessionId?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface AutoSaveState {
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
}

interface SystemPromptEditorProps {
  sessionId?: string;
  taskType: TaskType;
  onSave?: () => void;
}

function SystemPromptEditor({ sessionId, taskType, onSave }: SystemPromptEditorProps) {
  // Always call hooks first, before any conditional logic
  const { prompt, loading, error, isCustom, update, reset, validate } = useSystemPrompt({
    sessionId: sessionId || '',
    taskType: taskType as TaskTypeSupportingSystemPrompts,
    autoLoad: !!sessionId && supportsSystemPrompts(taskType)
  });
  
  const isSupported = supportsSystemPrompts(taskType);
  const { getDefault } = useDefaultSystemPrompts();
  
  const [editedPrompt, setEditedPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDefaultPrompt, setShowDefaultPrompt] = useState(false);

  const defaultPrompt = getDefault(taskType as TaskTypeSupportingSystemPrompts);
  const currentPrompt = prompt?.systemPrompt || '';
  
  // All hooks must be called before any conditional returns
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
  
  // Handle unsupported task types after all hooks are called
  if (!isSupported) {
    return (
      <div className="mt-6 p-4 bg-muted/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          System prompts are not available for this task type.
        </p>
      </div>
    );
  }

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
      <div className="mt-6 p-4 rounded-lg border border-border">
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
            {isCustom ? (
              <Badge variant="default" className="text-xs bg-blue-500/10 text-blue-600 border-blue-200">
                Project Custom
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                System Default
              </Badge>
            )}
            {defaultPrompt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDefaultPrompt(!showDefaultPrompt)}
                className="text-xs h-6 px-2 cursor-pointer"
              >
                {showDefaultPrompt ? 'Hide' : 'View'} Default
              </Button>
            )}
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
          {showDefaultPrompt && defaultPrompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Default Template</Label>
                <Badge variant="outline" className="text-xs">Read-only</Badge>
              </div>
              <VirtualizedCodeViewer
                content={defaultPrompt.systemPrompt || ''}
                height="250px"
                showCopy={true}
                copyText="Copy Default"
                showContentSize={true}
                readOnly={true}
                placeholder="No default prompt available"
                language="markdown"
                className="bg-muted/30 border-muted"
                virtualizationThreshold={5000}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {isCustom ? 'Custom Prompt' : 'Active Prompt (Default)'}
              </Label>
              {isCustom && (
                <Badge variant="secondary" className="text-xs">
                  Modified from default
                </Badge>
              )}
            </div>
            <VirtualizedCodeViewer
              content={displayedPrompt}
              height="400px"
              showCopy={true}
              copyText="Copy Prompt"
              showContentSize={true}
              readOnly={false}
              placeholder="Enter your custom system prompt..."
              language="markdown"
              onChange={(value) => handlePromptChange(value || '')}
              virtualizationThreshold={10000}
              className={isCustom ? "border-primary/40" : undefined}
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

          <div className="flex justify-end gap-2">
            {isCustom && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
                className="cursor-pointer"
              >
                Reset to Default
              </Button>
            )}
            <Button 
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
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
  regexSummaryGeneration: "regex_summary_generation",
  streaming: "streaming",
  unknown: "unknown",
};

const FILE_FINDING_WORKFLOW_STAGES = [
  { 
    key: 'regexPatternGeneration', 
    stageNumber: 1, 
    displayName: 'Pattern Generation',
    nextStage: 'File Filtering',
    description: 'Generate regex patterns to identify relevant files'
  },
  { 
    key: 'localFileFiltering', 
    stageNumber: 2, 
    displayName: 'File Filtering',
    nextStage: 'Relevance Assessment',
    description: 'Filter project files using generated patterns'
  },
  { 
    key: 'fileRelevanceAssessment', 
    stageNumber: 3, 
    displayName: 'Relevance Assessment',
    nextStage: 'Extended Path Finding',
    description: 'AI-powered assessment of file relevance'
  },
  { 
    key: 'extendedPathFinder', 
    stageNumber: 4, 
    displayName: 'Extended Path Finding',
    nextStage: 'Path Correction',
    description: 'Deep analysis to find related files'
  },
  { 
    key: 'pathCorrection', 
    stageNumber: 5, 
    displayName: 'Path Correction',
    nextStage: null,
    description: 'Final refinement and path validation'
  },
] as const;

const STANDALONE_FEATURES = [
  { key: 'voiceTranscription', displayName: 'Voice Transcription', description: 'Convert speech to text' },
  { key: 'textCorrection', displayName: 'Text Correction', description: 'AI-powered text improvement' },
  { key: 'implementationPlan', displayName: 'Implementation Plans', description: 'Generate detailed development plans' },
  { key: 'guidanceGeneration', displayName: 'AI Guidance', description: 'Contextual AI assistance' },
] as const;

// Language options for transcription
const TRANSCRIPTION_LANGUAGES = [
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

// Transcription models are now dynamically fetched from server via RuntimeAIConfig.availableModels
// No hardcoded array needed - we filter by provider type "whisper"

interface TranscriptionSpecificSettingsProps {
  settings: any;
  taskSettingsKey: keyof TaskSettings;
  onSettingsChange: (settings: TaskSettings) => void;
  taskSettings: TaskSettings;
  availableModels: ModelInfo[] | null;
}

function TranscriptionSpecificSettings({
  settings,
  taskSettingsKey,
  onSettingsChange,
  taskSettings,
  availableModels,
}: TranscriptionSpecificSettingsProps) {
  const [promptPreview, setPromptPreview] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewSettings, setPreviewSettings] = useState<any>(null);
  const [isTestingPrompt, setIsTestingPrompt] = useState(false);
  const [promptTestResult, setPromptTestResult] = useState<string | null>(null);

  const currentLanguage = settings.languageCode || 'en';
  const currentModel = settings.transcriptionModel || 'whisper-large-v3';
  const currentTemperature = settings.temperature ?? 0.0;

  // Get transcription models from server-fetched available models
  const transcriptionModels = useMemo((): ModelInfo[] => {
    if (!availableModels || availableModels.length === 0) {
      return [];
    }
    return availableModels.filter(model => model.provider === 'whisper');
  }, [availableModels]);

  // Enhanced validation for transcription settings
  const validateTranscriptionSettings = useCallback((prompt: string, temperature: number, language: string, model: string) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Prompt validation
    if (prompt.length > 1000) {
      errors.push('Prompt should be under 1000 characters for optimal performance');
    }
    
    if (prompt.includes('{{') || prompt.includes('}}')) {
      errors.push('Template variables are not supported in transcription prompts');
    }
    
    if (prompt.length > 500) {
      warnings.push('Very long prompts may reduce transcription speed');
    }
    
    // Temperature validation for transcription
    if (temperature < 0 || temperature > 1) {
      errors.push('Temperature must be between 0.0 and 1.0');
    }
    
    if (temperature > 0.3) {
      warnings.push('High temperature may reduce transcription accuracy');
    }
    
    // Language validation
    const validLanguage = TRANSCRIPTION_LANGUAGES.find(l => l.code === language);
    if (!validLanguage) {
      errors.push('Invalid language code selected');
    }
    
    // Model validation
    const validModel = transcriptionModels.find(m => m.id === model);
    if (!validModel) {
      errors.push('Invalid transcription model selected');
    }
    
    const allErrors = [...errors, ...warnings];
    setValidationErrors(allErrors);
    return { 
      isValid: errors.length === 0, 
      errors,
      warnings
    };
  }, [transcriptionModels]);

  // Generate comprehensive preview text based on current settings
  useEffect(() => {
    const language = TRANSCRIPTION_LANGUAGES.find(l => l.code === currentLanguage) as { code: string; name: string; nativeName: string } | undefined;
    const model = transcriptionModels.find(m => m.id === currentModel);
    
    const preview = [
      `Language: ${language?.nativeName || language?.name || 'English'}`,
      `Model: ${model?.name || model?.id || 'Default Model'}`,
      `Temperature: ${currentTemperature.toFixed(2)}`
    ].join(' • ');
    
    setPromptPreview(preview);
    
    // Update preview settings for modal
    setPreviewSettings({
      language: language?.nativeName || 'English',
      model: model?.name || model?.id || 'Default Model',
      temperature: currentTemperature,
      description: model?.description || ''
    });
  }, [currentLanguage, currentModel, currentTemperature, transcriptionModels]);

  const handleLanguageChange = (languageCode: string) => {
    const newSettings = { ...taskSettings };
    newSettings[taskSettingsKey] = {
      ...settings,
      languageCode,
    };
    onSettingsChange(newSettings);
  };

  const handleModelChange = (transcriptionModel: string) => {
    const newSettings = { ...taskSettings };
    newSettings[taskSettingsKey] = {
      ...settings,
      transcriptionModel,
    };
    onSettingsChange(newSettings);
  };

  const handleTemperatureChange = (temperature: number) => {
    validateTranscriptionSettings('', temperature, currentLanguage, currentModel);
    const newSettings = { ...taskSettings };
    newSettings[taskSettingsKey] = {
      ...settings,
      temperature,
    };
    onSettingsChange(newSettings);
  };
  
  const testPromptSettings = async () => {
    setIsTestingPrompt(true);
    setPromptTestResult(null);
    
    try {
      // Simulate a quick validation test
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const validation = validateTranscriptionSettings('', currentTemperature, currentLanguage, currentModel);
      if (validation.isValid) {
        setPromptTestResult('✓ Settings validated successfully');
      } else {
        setPromptTestResult(`⚠ Issues found: ${validation.errors.join(', ')}`);
      }
    } catch (error) {
      setPromptTestResult('✗ Validation failed');
    } finally {
      setIsTestingPrompt(false);
    }
  };

  const resetToDefaults = () => {
    const defaultModel = transcriptionModels.length > 0 
      ? transcriptionModels[0].id 
      : 'whisper-large-v3'; // fallback if no models available
    
    const newSettings = { ...taskSettings };
    newSettings[taskSettingsKey] = {
      ...settings,
      languageCode: 'en',
      transcriptionModel: defaultModel,
      transcriptionPrompt: '',
      temperature: 0.0,
    };
    onSettingsChange(newSettings);
    setValidationErrors([]);
    setPromptTestResult(null);
  };

  return (
    <div className="mt-8 border-t pt-6">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold">Transcription Configuration</h4>
              <p className="text-sm text-muted-foreground">
                Configure language, model, and prompt settings for voice transcription
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPromptModal(true)}
                className="text-xs"
              >
                Preview Settings
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={testPromptSettings}
                disabled={isTestingPrompt}
                className="text-xs"
              >
                {isTestingPrompt ? 'Testing...' : 'Test Settings'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefaults}
                className="text-xs"
              >
                Reset to Defaults
              </Button>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <Alert variant={validationErrors.some(err => 
              err.includes('must be') || err.includes('Invalid') || err.includes('not supported')
            ) ? "destructive" : "default"}>
              <div className="space-y-1">
                <p className="text-sm font-medium">Configuration Issues:</p>
                <ul className="text-xs space-y-0.5 list-disc list-inside">
                  {validationErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
          
          {promptTestResult && (
            <Alert variant={promptTestResult.startsWith('✓') ? "default" : "destructive"}>
              <p className="text-sm">{promptTestResult}</p>
            </Alert>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Language Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Transcription Language
              </Label>
              <Badge variant="secondary" className="text-xs">
                {TRANSCRIPTION_LANGUAGES.find(l => l.code === currentLanguage)?.nativeName || 'English'}
              </Badge>
            </div>
            <Select
              value={currentLanguage}
              onValueChange={handleLanguageChange}
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
              Primary language for voice transcription. Better accuracy when matched to spoken language.
            </p>
          </div>

          {/* Transcription Model Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Transcription Model
              </Label>
              <Badge variant="secondary" className="text-xs">
                {transcriptionModels.find(m => m.id === currentModel)?.name || transcriptionModels.find(m => m.id === currentModel)?.id || 'Default Model'}
              </Badge>
            </div>
            <Select
              value={currentModel}
              onValueChange={handleModelChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Transcription Models</SelectLabel>
                  {transcriptionModels.length > 0 ? (
                    transcriptionModels.filter(model => model.id && model.id.trim() !== '').map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="space-y-1">
                          <div>{model.name || model.id}</div>
                          <div className="text-xs text-muted-foreground">{model.description || `Provider: ${model.provider}`}</div>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-models-available" disabled>
                      No transcription models available
                    </SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose model based on accuracy vs speed requirements. Large models are more accurate but slower.
            </p>
          </div>
          
          {/* Temperature Control for Transcription */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Temperature
              </Label>
              <Badge variant="secondary" className="text-xs">
                {currentTemperature.toFixed(2)}
              </Badge>
            </div>
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 min-w-[120px]">
                <Slider
                  value={[currentTemperature]}
                  max={1.0}
                  min={0.0}
                  step={0.05}
                  onValueChange={(value: number[]) => handleTemperatureChange(value[0])}
                  className="w-full"
                  aria-label="Transcription Temperature"
                />
              </div>
              <Input
                type="number"
                value={currentTemperature.toFixed(2)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value >= 0 && value <= 1) {
                    handleTemperatureChange(value);
                  }
                }}
                className="w-20 font-mono text-sm text-right shrink-0 text-foreground pr-2"
                min={0}
                max={1}
                step={0.01}
                placeholder="0.00"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Lower values (0.0-0.2) for accuracy, higher (0.3-1.0) for creativity. Recommended: 0.0-0.1 for transcription.
            </p>
          </div>
        </div>


        {/* Current Configuration Preview */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-medium">Current Configuration</h5>
            <Badge variant="outline" className="text-xs">
              Live Preview
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {promptPreview}
          </p>
        </div>

        {/* Preview Modal */}
        {showPromptModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg max-w-md w-full m-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Transcription Settings Preview</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPromptModal(false)}
                  >
                    ×
                  </Button>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Language</Label>
                    <p className="text-sm text-muted-foreground">
                      {previewSettings?.language || 'English'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Model</Label>
                    <p className="text-sm text-muted-foreground">
                      {previewSettings?.model || 'Whisper Large v3'}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {previewSettings?.description || ''}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Temperature</Label>
                    <p className="text-sm text-muted-foreground">
                      {previewSettings?.temperature?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowPromptModal(false)}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TaskModelSettings({
  taskSettings,
  availableModels,
  onSettingsChange,
  sessionId,
}: TaskModelSettingsProps) {
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>({
    isDirty: false,
    isSaving: false,
    lastSaved: null,
    error: null,
  });
  
  const saveTimeoutRef = useRef<number | null>(null);
  
  const validateTaskSettings = useCallback((settings: TaskSettings, taskKey: keyof TaskSettings): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const taskType = taskSettingsKeyToTaskType[taskKey];
    const taskDetails = TaskTypeDetails[taskType];
    const requiresLlm = taskDetails?.requiresLlm !== false;
    
    if (requiresLlm && settings[taskKey]) {
      const taskSetting = settings[taskKey];
      
      if (!taskSetting.model) {
        warnings.push('No model selected - will use system default');
      }
      
      if (taskSetting.maxTokens !== undefined) {
        if (taskSetting.maxTokens < 1000) {
          errors.push('Max tokens must be at least 1000');
        } else if (taskSetting.maxTokens > 100000) {
          errors.push('Max tokens cannot exceed 100,000');
        } else if (taskSetting.maxTokens < 2000) {
          warnings.push('Low token limit may truncate responses');
        }
      }
      
      if (taskSetting.temperature !== undefined && taskKey !== 'voiceTranscription') {
        if (taskSetting.temperature < 0 || taskSetting.temperature > 1) {
          errors.push('Temperature must be between 0.0 and 1.0');
        } else if (taskSetting.temperature > 0.9) {
          warnings.push('High temperature may produce inconsistent results');
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }, []);
  
  const debouncedSave = useCallback((newSettings: TaskSettings) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    setAutoSaveState(prev => ({ ...prev, isDirty: true, error: null }));
    
    saveTimeoutRef.current = window.setTimeout(() => {
      setAutoSaveState(prev => ({ ...prev, isSaving: true }));
      
      try {
        onSettingsChange(newSettings);
        setAutoSaveState(prev => ({
          ...prev,
          isDirty: false,
          isSaving: false,
          lastSaved: new Date(),
          error: null
        }));
      } catch (error) {
        setAutoSaveState(prev => ({
          ...prev,
          isSaving: false,
          error: error instanceof Error ? error.message : 'Failed to save settings'
        }));
      }
    }, 1000);
  }, [onSettingsChange]);
  
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const getTaskSettings = (camelCaseKey: keyof TaskSettings) => {
    const settings = taskSettings[camelCaseKey];
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;

    if (!settings && !requiresLlm) {
      return {};
    }

    if (settings) {
      return settings;
    }
    
    console.error(`Configuration integrity issue: No settings found for task type: '${camelCaseKey}'. The backend should have provided a value for this key. Falling back to an empty object to prevent a UI crash.`);

    return {}; 
  };

  const handleModelChange = (camelCaseKey: keyof TaskSettings, model: string) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return;
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      model,
    };

    debouncedSave(newSettings);
  };

  const isSettingCustomized = (camelCaseKey: keyof TaskSettings, settingName: 'model' | 'maxTokens' | 'temperature') => {
    const settings = getTaskSettings(camelCaseKey);
    
    const defaultValues = {
      model: '',
      maxTokens: 4000,
      temperature: 0.3
    };
    
    return settings[settingName] !== defaultValues[settingName];
  };

  const handleMaxTokensChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return;
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      maxTokens: value[0],
    };

    debouncedSave(newSettings);
  };

  const handleTemperatureChange = (camelCaseKey: keyof TaskSettings, value: number[]) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const requiresLlm = TaskTypeDetails[taskType]?.requiresLlm ?? true;
    if (!requiresLlm) return;
    
    const settings = getTaskSettings(camelCaseKey);
    const newSettings = { ...taskSettings };

    newSettings[camelCaseKey] = {
      ...settings,
      temperature: value[0],
    };

    debouncedSave(newSettings);
  };

  const getModelsForTask = (camelCaseKey: keyof TaskSettings) => {
    const taskType = taskSettingsKeyToTaskType[camelCaseKey];
    const taskDetails = TaskTypeDetails[taskType];
    const requiresLlm = taskDetails?.requiresLlm ?? true;
    if (!requiresLlm) return [];
    
    if (!availableModels || availableModels.length === 0) {
      return [];
    }
    
    const apiType = taskDetails?.defaultProvider || "google";
    return availableModels.filter(model => model.provider === apiType);
  };

  const { workflowStages, standaloneFeatures } = useMemo(() => {
    const stages = FILE_FINDING_WORKFLOW_STAGES.filter(stage => 
      taskSettings[stage.key as keyof TaskSettings] !== undefined
    );
    
    const features = STANDALONE_FEATURES.filter(feature => 
      taskSettings[feature.key as keyof TaskSettings] !== undefined &&
      !TaskTypeDetails[taskSettingsKeyToTaskType[feature.key as keyof TaskSettings]]?.hidden
    );

    return { workflowStages: stages, standaloneFeatures: features };
  }, [taskSettings]);

  const [selectedCategory, setSelectedCategory] = useState<'workflow' | 'standalone' | 'bulk-optimization'>('workflow');
  const [selectedTask, setSelectedTask] = useState<string>('regexPatternGeneration');
  
  useEffect(() => {
    // Only set default task if current selection doesn't exist in taskSettings
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    if (!taskExists) {
      const firstWorkflowTask = workflowStages[0]?.key;
      const firstStandaloneTask = standaloneFeatures[0]?.key;
      
      if (firstWorkflowTask) {
        setSelectedCategory('workflow');
        setSelectedTask(firstWorkflowTask);
      } else if (firstStandaloneTask) {
        setSelectedCategory('standalone');
        setSelectedTask(firstStandaloneTask);
      }
    }
  }, [workflowStages, standaloneFeatures, selectedTask, taskSettings]);
  
  useEffect(() => {
    const isWorkflowTask = workflowStages.some(stage => stage.key === selectedTask);
    const isStandaloneTask = standaloneFeatures.some(feature => feature.key === selectedTask);
    
    if (isWorkflowTask && selectedCategory !== 'workflow') {
      setSelectedCategory('workflow');
    } else if (isStandaloneTask && selectedCategory !== 'standalone') {
      setSelectedCategory('standalone');
    }
  }, [selectedTask, workflowStages, standaloneFeatures]);
  
  useEffect(() => {
    const taskExists = taskSettings[selectedTask as keyof TaskSettings] !== undefined;
    if (!taskExists) {
      const fallbackTask = workflowStages[0]?.key || standaloneFeatures[0]?.key || 'regexPatternGeneration';
      setSelectedTask(fallbackTask);
    }
  }, [taskSettings, selectedTask, workflowStages, standaloneFeatures]);
  

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">AI Model Settings</CardTitle>
            <CardDescription className="text-balance">
              Configure AI models for workflow stages and standalone features. Workflow stages work together in sequence, while standalone features operate independently.
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-3">
            <Tooltip>
              <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                <kbd className="px-1.5 py-0.5 text-xs bg-muted border rounded">Ctrl+S</kbd>
                <span>Force Save</span>
              </div>
              <div className="text-xs">
                Use Ctrl+S (Cmd+S on Mac) to force immediate save of any pending changes
              </div>
            </Tooltip>
            
            <div className="flex items-center gap-2">
              {autoSaveState.isSaving && (
                <Tooltip>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </div>
                  <div className="text-xs">Automatically saving your changes</div>
                </Tooltip>
              )}
              {autoSaveState.lastSaved && !autoSaveState.isSaving && !autoSaveState.isDirty && (
                <Tooltip>
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Saved {autoSaveState.lastSaved.toLocaleTimeString()}</span>
                  </div>
                  <div className="text-xs">All changes have been saved successfully</div>
                </Tooltip>
              )}
              {autoSaveState.isDirty && !autoSaveState.isSaving && (
                <Tooltip>
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                    <span>Unsaved changes</span>
                  </div>
                  <div className="text-xs">Changes will auto-save in 1 second</div>
                </Tooltip>
              )}
              {autoSaveState.error && (
                <Tooltip>
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Save failed</span>
                  </div>
                  <div className="text-xs">Click to retry or check your connection</div>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        
        {autoSaveState.error && (
          <Alert variant="destructive" className="mt-4">
            <span className="text-sm">Failed to save settings: {autoSaveState.error}</span>
          </Alert>
        )}
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
          <div className="space-y-4">
            
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">File Finding Workflow</h3>
                </div>
                <div className="space-y-1 pl-2 border-l-2 border-muted">
                  {workflowStages.map((stage) => {
                    const camelCaseKey = stage.key;
                    const isSelected = selectedTask === camelCaseKey;
                    
                    return (
                      <div key={camelCaseKey} className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedCategory('workflow');
                            setSelectedTask(camelCaseKey);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedCategory('workflow');
                              setSelectedTask(camelCaseKey);
                            }
                          }}
                          aria-label={`Configure ${stage.displayName} settings`}
                          aria-pressed={isSelected}
                          className={`group w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                            isSelected 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-mono">
                                {'stageNumber' in stage ? stage.stageNumber : '#'}
                              </span>
                              <span>{stage.displayName}</span>
                              
                            </div>
                          </div>
                        </button>
                        {'nextStage' in stage && stage.nextStage && (
                          <div className="pl-6 text-xs text-muted-foreground flex items-center gap-1">
                            <span>↓ feeds into</span>
                            <span className="font-medium">{stage.nextStage}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Standalone Features</h3>
                </div>
                <div className="space-y-1 pl-2">
                  {standaloneFeatures.map((feature) => {
                    const camelCaseKey = feature.key;
                    const isSelected = selectedTask === camelCaseKey;
                    
                    return (
                      <button
                        key={camelCaseKey}
                        onClick={() => {
                          setSelectedCategory('standalone');
                          setSelectedTask(camelCaseKey);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedCategory('standalone');
                            setSelectedTask(camelCaseKey);
                          }
                        }}
                        aria-label={`Configure ${feature.displayName} settings`}
                        aria-pressed={isSelected}
                        className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                          isSelected 
                            ? 'bg-primary/10 text-primary border border-primary/20' 
                            : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{feature.displayName}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Bulk Optimization Available</h3>
                </div>
                <div className="space-y-1 pl-2">
                  <button
                    onClick={() => {
                      setSelectedCategory('bulk-optimization');
                      setSelectedTask('bulk-optimization');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCategory('bulk-optimization');
                        setSelectedTask('bulk-optimization');
                      }
                    }}
                    aria-label="Configure bulk optimization settings"
                    aria-pressed={selectedCategory === 'bulk-optimization'}
                    className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                      selectedCategory === 'bulk-optimization'
                        ? 'bg-primary/10 text-primary border border-primary/20' 
                        : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Settings Enhancement</span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="min-h-[600px]">

            {(() => {
              // Handle bulk optimization section
              if (selectedCategory === 'bulk-optimization') {
                return (
                  <div className="w-full space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <h2 className="text-lg font-semibold">Settings Enhancement Engine</h2>
                          <p className="text-sm text-muted-foreground">
                            Bulk optimization and recommendations for all AI model settings
                          </p>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          Analyze your current settings and get AI-powered recommendations to optimize performance, cost, and accuracy across all task types.
                        </p>
                      </div>
                    </div>
                    
                    <SettingsEnhancementEngine
                      taskSettings={taskSettings}
                      onSettingsChange={onSettingsChange}
                      onRecommendationApply={(recommendation) => {
                        const newSettings = { ...taskSettings };
                        const currentSettings = newSettings[recommendation.taskKey];
                        
                        if (currentSettings) {
                          if (recommendation.id.includes('temp')) {
                            currentSettings.temperature = recommendation.recommendedValue;
                          } else if (recommendation.id.includes('tokens')) {
                            currentSettings.maxTokens = recommendation.recommendedValue;
                          }
                          
                          onSettingsChange(newSettings);
                        }
                      }}
                    />
                  </div>
                );
              }
              
              const taskSettingsKey = selectedTask as keyof TaskSettings;
              
              if (!taskSettings[taskSettingsKey]) {
                return (
                  <div className="flex items-center justify-center h-[400px]">
                    <div className="text-center space-y-4 max-w-md">
                      <div className="w-20 h-20 bg-gradient-to-br from-muted/50 to-muted/30 rounded-full flex items-center justify-center mx-auto">
                        <div className="w-8 h-8 border-2 border-muted-foreground/40 rounded border-dashed animate-pulse"></div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Configuration Not Available</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The selected task <code className="bg-muted px-1.5 py-1 rounded text-xs font-mono">{selectedTask}</code> does not have configuration settings available.
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          This might indicate a missing task definition or a temporary loading state.
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => window.location.reload()}
                        className="text-xs cursor-pointer"
                      >
                        Refresh Application
                      </Button>
                    </div>
                  </div>
                );
              }
              
              const taskType = taskSettingsKeyToTaskType[taskSettingsKey];
              const taskDetails = TaskTypeDetails[taskType];
              const settings = getTaskSettings(taskSettingsKey);
              const models = getModelsForTask(taskSettingsKey);
              const validation = validateTaskSettings(taskSettings, taskSettingsKey);
              
              const workflowStage = FILE_FINDING_WORKFLOW_STAGES.find(stage => stage.key === selectedTask);
              const standaloneFeature = STANDALONE_FEATURES.find(feature => feature.key === selectedTask);
              const isWorkflowStage = selectedCategory === 'workflow' && workflowStage;
              
              return (
                <div className="w-full space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {isWorkflowStage ? (
                        <>
                          <span className="w-8 h-8 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-bold">
                            {'stageNumber' in workflowStage ? workflowStage.stageNumber : '#'}
                          </span>
                          <div>
                            <h2 className="text-lg font-semibold">{workflowStage.displayName}</h2>
                            <p className="text-sm text-muted-foreground">
                              Stage {'stageNumber' in workflowStage ? workflowStage.stageNumber : '?'} of 5 in File Finding Workflow
                            </p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <h2 className="text-lg font-semibold">{standaloneFeature?.displayName || taskDetails?.displayName || selectedTask}</h2>
                          <p className="text-sm text-muted-foreground">Standalone Feature</p>
                        </div>
                      )}
                    </div>
                    
                    {(isWorkflowStage ? workflowStage.description : 
                      (standaloneFeature?.description || taskDetails?.description)) && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          {isWorkflowStage ? workflowStage.description : 
                           (standaloneFeature?.description || taskDetails?.description)}
                        </p>
                        {isWorkflowStage && workflowStage && 'nextStage' in workflowStage && workflowStage.nextStage && (
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <span>↓ Output feeds into:</span>
                            <span className="font-medium">{workflowStage.nextStage}</span>
                          </p>
                        )}
                      </div>
                    )}
                    
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

                  <SystemPromptEditor
                    sessionId={sessionId}
                    taskType={taskType}
                  />
                  
                  {taskDetails?.requiresLlm !== false ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`model-select-${selectedTask}`}
                          className="text-sm font-medium"
                        >
                          Model
                        </Label>
                        {isSettingCustomized(taskSettingsKey, 'model') && (
                          <Badge variant="secondary" className="text-xs">
                            Project Override
                          </Badge>
                        )}
                      </div>
                      <Select
                        value={settings.model || ""}
                        onValueChange={(value: string) =>
                          handleModelChange(taskSettingsKey, value)
                        }
                      >
                        <SelectTrigger
                          id={`model-select-${selectedTask}`}
                          className={`w-full ${
                            validation.errors.some(e => e.includes('model')) ? 'border-red-500 focus:ring-red-200' : ''
                          }`}
                        >
                          <SelectValue placeholder={models.length > 0 ? "Select model" : "No models available"} />
                        </SelectTrigger>
                        <SelectContent>
                          {models.length > 0 ? (
                            <SelectGroup>
                              <SelectLabel>
                                {(taskDetails?.defaultProvider || "google").charAt(0).toUpperCase() +
                                  (taskDetails?.defaultProvider || "google").slice(1)}{" "}
                                Models
                              </SelectLabel>
                              {models.filter(model => model.id && model.id.trim() !== '').map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : (
                            <SelectGroup>
                              <SelectLabel>No models available</SelectLabel>
                            </SelectGroup>
                          )}
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

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`max-tokens-${selectedTask}`}
                          className="text-sm font-medium"
                        >
                          Max Tokens
                        </Label>
                        {isSettingCustomized(taskSettingsKey, 'maxTokens') && (
                          <Badge variant="secondary" className="text-xs">
                            Project Override
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1 min-w-[120px]">
                          <Slider
                            id={`max-tokens-${selectedTask}`}
                            value={[settings.maxTokens ?? 4000]}
                            max={100000}
                            min={1000}
                            step={1000}
                            onValueChange={(value: number[]) =>
                              handleMaxTokensChange(taskSettingsKey, value)
                            }
                            className="w-full"
                            aria-label="Max tokens"
                          />
                        </div>
                        <Input
                          type="number"
                          value={settings.maxTokens ?? ''}
                          onChange={(
                            e: React.ChangeEvent<HTMLInputElement>
                          ) => {
                            const value = parseInt(e.target.value);
                            if (e.target.value === '' || (
                              !isNaN(value) &&
                              value >= 1000 &&
                              value <= 100000
                            )) {
                              handleMaxTokensChange(taskSettingsKey, [value || 4000]);
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

                    {selectedTask !== "voiceTranscription" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`temperature-${selectedTask}`}
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
                            {isSettingCustomized(taskSettingsKey, 'temperature') && (
                              <Badge variant="secondary" className="text-xs">
                                Project Override
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 min-w-[120px]">
                            <Slider
                              id={`temperature-${selectedTask}`}
                              value={[settings.temperature ?? 0.7]}
                              max={1}
                              min={0}
                              step={0.05}
                              onValueChange={(value: number[]) =>
                                handleTemperatureChange(taskSettingsKey, value)
                              }
                              className="w-full"
                              aria-label="Temperature"
                            />
                          </div>
                          <Input
                            type="number"
                            value={settings.temperature !== undefined ? Number(settings.temperature).toFixed(2) : ''}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>
                            ) => {
                              const value = parseFloat(e.target.value);
                              if (e.target.value === '' || (
                                !isNaN(value) && 
                                value >= 0 && 
                                value <= 1
                              )) {
                                handleTemperatureChange(taskSettingsKey, [value || 0.7]);
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
                          {selectedTask === "pathCorrection" || selectedTask === "pathFinder"
                            ? "Lower values produce more accurate path suggestions"
                            : selectedTask === "voiceTranscription"
                            ? "Not applicable for transcription models"
                            : selectedTask === "textCorrection"
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

                  {/* Voice Transcription Specific Settings */}
                  {selectedTask === "voiceTranscription" && (
                    <TranscriptionSpecificSettings
                      settings={settings}
                      taskSettingsKey={taskSettingsKey}
                      onSettingsChange={debouncedSave}
                      taskSettings={taskSettings}
                      availableModels={availableModels}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}