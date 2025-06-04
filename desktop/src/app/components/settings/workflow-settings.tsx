"use client";

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Input,
  Button,
  Alert,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/ui";
import { CheckCircle, Loader2, Save, RotateCcw, AlertCircle } from "lucide-react";
import { useNotification } from "@/contexts/notification-context";
import { getAvailableAIModels, type ModelInfo } from "@/actions/config.actions";
import { getErrorMessage, logError } from "@/utils/error-handling";

interface WorkflowSettingsProps {
  className?: string;
}

interface WorkflowConfig {
  name: string;
  displayName: string;
  description: string;
  stages: {
    [stageName: string]: {
      displayName: string;
      description: string;
      modelConfigurable: boolean;
    };
  };
  defaultSettings: {
    [settingKey: string]: string;
  };
}

// Define available workflows and their configurable aspects
const WORKFLOW_CONFIGS: WorkflowConfig[] = [
  {
    name: "FileFinderWorkflow",
    displayName: "File Finder Workflow", 
    description: "Multi-stage process to find relevant files based on task descriptions using AI-powered analysis.",
    stages: {
      "GeneratingRegex": {
        displayName: "Regex Pattern Generation", 
        description: "Generates patterns to filter relevant files",
        modelConfigurable: true
      },
      "LocalFiltering": {
        displayName: "Local File Filtering",
        description: "Filters files based on generated patterns",
        modelConfigurable: false
      },
      "FileRelevanceAssessment": {
        displayName: "AI File Relevance Assessment",
        description: "Uses AI to assess relevance of filtered files before extended path finding.",
        modelConfigurable: true
      },
      "ExtendedPathFinder": {
        displayName: "Extended Path Finding",
        description: "Comprehensive file discovery with deeper analysis",
        modelConfigurable: true
      },
      "ExtendedPathCorrection": {
        displayName: "Extended Path Correction",
        description: "Final validation and correction of discovered files",
        modelConfigurable: true
      }
    },
    defaultSettings: {
      "excludedPaths": ".git,node_modules,target,dist,build",
      "timeoutMs": "300000",
      "maxFilesWithContent": "50"
    }
  }
];

export default function WorkflowSettings({ className }: WorkflowSettingsProps) {
  const { showNotification } = useNotification();
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [workflowSettings, setWorkflowSettings] = useState<Record<string, Record<string, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load available models and workflow settings
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        // Load available models
        const models = await getAvailableAIModels();
        setAvailableModels(models || []);

        // Load workflow settings for each workflow
        const allSettings: Record<string, Record<string, string>> = {};
        
        for (const workflow of WORKFLOW_CONFIGS) {
          try {
            const settings = await invoke("get_all_workflow_settings_command", {
              workflowName: workflow.name
            });
            allSettings[workflow.name] = settings as Record<string, string>;
          } catch (err) {
            console.warn(`Failed to load settings for workflow ${workflow.name}:`, err);
            allSettings[workflow.name] = {};
          }
        }

        setWorkflowSettings(allSettings);
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        await logError(err, "WorkflowSettings - Load Data Failed");
        setError(`Failed to load workflow settings: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const handleSettingChange = useCallback((workflowName: string, settingKey: string, value: string) => {
    setWorkflowSettings(prev => ({
      ...prev,
      [workflowName]: {
        ...prev[workflowName],
        [settingKey]: value
      }
    }));
    setSaveSuccess(null);
    setError(null);
  }, []);

  const saveSetting = useCallback(async (workflowName: string, settingKey: string, value: string) => {
    setIsSaving(true);
    setError(null);

    try {
      if (value.trim() === '' || value === 'system-default') {
        // Delete setting if empty or system-default
        await invoke("delete_workflow_setting_command", {
          workflowName,
          settingKey
        });
      } else {
        // Set setting value
        await invoke("set_workflow_setting_command", {
          workflowName,
          settingKey,
          value: value.trim()
        });
      }

      setSaveSuccess(`${workflowName}:${settingKey}`);
      setTimeout(() => setSaveSuccess(null), 2000);
      
      showNotification({
        title: "Setting Saved",
        message: `Updated ${settingKey} for ${workflowName}`,
        type: "success"
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      await logError(err, "WorkflowSettings - Save Setting Failed", { workflowName, settingKey, value });
      setError(`Failed to save setting: ${errorMessage}`);
      
      showNotification({
        title: "Save Failed",
        message: `Failed to save ${settingKey}: ${errorMessage}`,
        type: "error"
      });
    } finally {
      setIsSaving(false);
    }
  }, [showNotification]);

  const resetToDefault = useCallback(async (workflowName: string, settingKey: string) => {
    const workflow = WORKFLOW_CONFIGS.find(w => w.name === workflowName);
    if (!workflow) return;

    const defaultValue = workflow.defaultSettings[settingKey] || '';
    handleSettingChange(workflowName, settingKey, defaultValue);
    
    if (defaultValue === '') {
      await saveSetting(workflowName, settingKey, '');
    }
  }, [handleSettingChange, saveSetting]);

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className || ''}`}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading workflow settings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <div>
          <p className="font-medium">Failed to load workflow settings</p>
          <p className="text-sm">{error}</p>
        </div>
      </Alert>
    );
  }

  return (
    <div className={`space-y-6 ${className || ''}`}>
      <div className="text-sm text-muted-foreground">
        Configure default parameters and model preferences for different workflows. 
        These settings override system defaults when workflows are executed.
      </div>

      {WORKFLOW_CONFIGS.map((workflow) => (
        <Card key={workflow.name} className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{workflow.displayName}</CardTitle>
                <CardDescription className="mt-1">
                  {workflow.description}
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {workflow.name}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">General Settings</TabsTrigger>
                <TabsTrigger value="stages">Stage Models</TabsTrigger>
              </TabsList>
              
              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="grid gap-4">
                  {Object.entries(workflow.defaultSettings).map(([settingKey, defaultValue]) => {
                    const currentValue = workflowSettings[workflow.name]?.[settingKey] || defaultValue;
                    const isModified = currentValue !== defaultValue;
                    const saveKey = `${workflow.name}:${settingKey}`;
                    
                    return (
                      <div key={settingKey} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`${workflow.name}-${settingKey}`} className="text-sm font-medium">
                            {settingKey}
                            {isModified && <Badge variant="secondary" className="ml-2 text-xs">Modified</Badge>}
                          </Label>
                          <div className="flex items-center gap-2">
                            {saveSuccess === saveKey && (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resetToDefault(workflow.name, settingKey)}
                              disabled={!isModified || isSaving}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => saveSetting(workflow.name, settingKey, currentValue)}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                        <Input
                          id={`${workflow.name}-${settingKey}`}
                          value={currentValue}
                          onChange={(e) => handleSettingChange(workflow.name, settingKey, e.target.value)}
                          placeholder={`Default: ${defaultValue}`}
                          className={`text-sm ${isModified ? 'border-blue-200 bg-blue-50/30' : ''}`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Default: {defaultValue}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
              
              <TabsContent value="stages" className="space-y-4 mt-4">
                <div className="grid gap-4">
                  {Object.entries(workflow.stages).map(([stageName, stageConfig]) => {
                    if (!stageConfig.modelConfigurable) {
                      return (
                        <div key={stageName} className="p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">{stageConfig.displayName}</p>
                              <p className="text-xs text-muted-foreground">{stageConfig.description}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">No Model Config</Badge>
                          </div>
                        </div>
                      );
                    }

                    const settingKey = `${stageName}_model`;
                    const currentModel = workflowSettings[workflow.name]?.[settingKey] || 'system-default';
                    const saveKey = `${workflow.name}:${settingKey}`;
                    
                    return (
                      <div key={stageName} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">{stageConfig.displayName}</Label>
                            <p className="text-xs text-muted-foreground">{stageConfig.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {saveSuccess === saveKey && (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => saveSetting(workflow.name, settingKey, currentModel)}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                        <div className="relative">
                          <Select
                            value={currentModel}
                            onValueChange={(value) => handleSettingChange(workflow.name, settingKey, value)}
                          >
                            <SelectTrigger className={`text-sm ${currentModel !== 'system-default' ? 'border-blue-200 bg-blue-50/30' : ''}`}>
                              <SelectValue placeholder="Use system default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="system-default">
                                <div className="flex items-center gap-2">
                                  <span>Use system default</span>
                                  <Badge variant="outline" className="text-xs">Default</Badge>
                                </div>
                              </SelectItem>
                              {availableModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{model.name}</span>
                                    {model.provider && (
                                      <Badge variant="secondary" className="text-xs ml-2">
                                        {model.provider}
                                      </Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {currentModel !== 'system-default' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSettingChange(workflow.name, settingKey, 'system-default')}
                              className="absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              title="Reset to default"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        {currentModel !== 'system-default' && (
                          <p className="text-xs text-blue-600 mt-1">
                            Override active: Using {availableModels.find(m => m.id === currentModel)?.name || currentModel}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}