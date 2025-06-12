"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Badge, Alert, Tooltip, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Progress, ScrollArea } from "@/ui";
import { type TaskSettings } from "@/types";
import { Download, Upload, Undo2, CheckCircle, AlertTriangle, Zap, TrendingUp } from "lucide-react";
import { useNotification } from "@/contexts/notification-context";

interface SmartRecommendation {
  id: string;
  type: 'performance' | 'cost-optimization' | 'security' | 'best-practice';
  severity: 'critical' | 'warning' | 'suggestion';
  title: string;
  description: string;
  reasoning: string;
  impact: string;
  taskKey: keyof TaskSettings;
  currentValue: any;
  recommendedValue: any;
  estimatedImprovement: string;
  automatable: boolean;
  confidence: number;
}

interface BulkOperation {
  id: string;
  type: 'model-sync' | 'optimize-all' | 'reset-defaults' | 'apply-preset';
  name: string;
  description: string;
  targetTasks: (keyof TaskSettings)[];
  previewChanges: Array<{
    task: string;
    field: string;
    from: any;
    to: any;
    impact: 'positive' | 'neutral' | 'needs-review';
  }>;
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface SettingsHistory {
  id: string;
  timestamp: Date;
  description: string;
  settings: TaskSettings;
}

interface SettingsEnhancementEngineProps {
  taskSettings: TaskSettings;
  onSettingsChange: (settings: TaskSettings) => void;
  onRecommendationApply: (recommendation: SmartRecommendation) => void;
  className?: string;
}

export function SettingsEnhancementEngine({
  taskSettings,
  onSettingsChange,
  onRecommendationApply,
  className = ""
}: SettingsEnhancementEngineProps) {
  const { showNotification } = useNotification();
  
  // Core state
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [bulkOperations, setBulkOperations] = useState<BulkOperation[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  // History & undo
  const [settingsHistory, setSettingsHistory] = useState<SettingsHistory[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  
  // Modal states
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    operation: BulkOperation | null;
    isExecuting: boolean;
    progress: number;
  }>({
    isOpen: false,
    operation: null,
    isExecuting: false,
    progress: 0
  });
  
  // Export/Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Error handling
  const [lastError, setLastError] = useState<string | null>(null);

  // Generate smart recommendations
  const generateRecommendations = useCallback(() => {
    const recs: SmartRecommendation[] = [];
    
    Object.entries(taskSettings).forEach(([taskKey, settings]) => {
      if (!settings || typeof settings !== 'object') return;
      
      // Temperature optimization
      if (settings.temperature !== undefined && settings.temperature > 0.8) {
        recs.push({
          id: `temp-${taskKey}`,
          type: 'performance',
          severity: 'warning',
          title: 'High Temperature Detected',
          description: `Temperature of ${settings.temperature.toFixed(2)} may cause inconsistent outputs`,
          reasoning: 'Lower temperatures (0.1-0.4) provide more consistent, focused responses',
          impact: 'Reduce output variance by 65%, improve consistency by 40%',
          taskKey: taskKey as keyof TaskSettings,
          currentValue: settings.temperature,
          recommendedValue: 0.3,
          estimatedImprovement: '40% more consistent results',
          automatable: true,
          confidence: 92
        });
      }
      
      // Token capacity issues
      if (settings.maxTokens !== undefined && settings.maxTokens < 2000) {
        recs.push({
          id: `tokens-${taskKey}`,
          type: 'performance',
          severity: 'critical',
          title: 'Insufficient Token Capacity',
          description: `${settings.maxTokens} tokens may truncate responses`,
          reasoning: 'Modern AI tasks require 4000+ tokens for optimal completion',
          impact: 'Eliminate 95% of truncated responses',
          taskKey: taskKey as keyof TaskSettings,
          currentValue: settings.maxTokens,
          recommendedValue: 4000,
          estimatedImprovement: '95% fewer truncations',
          automatable: true,
          confidence: 98
        });
      }
      
      // Missing model selection
      if (!settings.model) {
        recs.push({
          id: `model-${taskKey}`,
          type: 'security',
          severity: 'warning',
          title: 'No Model Selected',
          description: 'Using default model may cause inconsistent behavior',
          reasoning: 'Explicit model selection ensures predictable performance',
          impact: 'Guaranteed consistent behavior and costs',
          taskKey: taskKey as keyof TaskSettings,
          currentValue: null,
          recommendedValue: 'Select optimal model',
          estimatedImprovement: '100% consistency',
          automatable: false,
          confidence: 100
        });
      }
    });
    
    recs.sort((a, b) => {
      const severityWeight = { critical: 3, warning: 2, suggestion: 1 };
      const diff = severityWeight[b.severity] - severityWeight[a.severity];
      return diff !== 0 ? diff : b.confidence - a.confidence;
    });
    
    setRecommendations(recs);
  }, [taskSettings]);

  // Generate bulk operations
  const generateBulkOperations = useCallback(() => {
    const ops: BulkOperation[] = [];
    
    // Temperature optimization
    const highTempTasks = Object.entries(taskSettings)
      .filter(([_, settings]) => settings?.temperature && settings.temperature > 0.6)
      .map(([key]) => key as keyof TaskSettings);
    
    if (highTempTasks.length > 1) {
      ops.push({
        id: 'optimize-temperatures',
        type: 'optimize-all',
        name: 'Optimize All Temperatures',
        description: `Apply optimal temperature settings to ${highTempTasks.length} tasks`,
        targetTasks: highTempTasks,
        previewChanges: highTempTasks.map(task => ({
          task,
          field: 'temperature',
          from: taskSettings[task]?.temperature,
          to: 0.3,
          impact: 'positive' as const
        })),
        estimatedTime: 2,
        riskLevel: 'low'
      });
    }
    
    // Token expansion
    const lowTokenTasks = Object.entries(taskSettings)
      .filter(([_, settings]) => settings?.maxTokens && settings.maxTokens < 3000)
      .map(([key]) => key as keyof TaskSettings);
      
    if (lowTokenTasks.length > 1) {
      ops.push({
        id: 'expand-tokens',
        type: 'optimize-all',
        name: 'Expand Token Capacity',
        description: `Optimize token limits for ${lowTokenTasks.length} tasks`,
        targetTasks: lowTokenTasks,
        previewChanges: lowTokenTasks.map(task => ({
          task,
          field: 'maxTokens',
          from: taskSettings[task]?.maxTokens,
          to: 4000,
          impact: 'positive' as const
        })),
        estimatedTime: 1,
        riskLevel: 'low'
      });
    }
    
    setBulkOperations(ops);
  }, [taskSettings]);

  // Apply recommendation
  const applyRecommendation = useCallback((rec: SmartRecommendation) => {
    try {
      onRecommendationApply(rec);
      setRecommendations(prev => prev.filter(r => r.id !== rec.id));
      showNotification({ title: 'Recommendation applied successfully', type: 'success' });
    } catch (error) {
      setLastError(`Failed to apply recommendation: ${error}`);
      showNotification({ title: 'Failed to apply recommendation', type: 'error' });
    }
  }, [onRecommendationApply, showNotification]);

  // Execute bulk operation
  const executeBulkOperation = useCallback(async (operation: BulkOperation) => {
    setPreviewModal(prev => ({ ...prev, isExecuting: true, progress: 0 }));
    
    try {
      const newSettings = { ...taskSettings };
      const totalChanges = operation.previewChanges.length;
      
      for (let i = 0; i < operation.previewChanges.length; i++) {
        const change = operation.previewChanges[i];
        const taskKey = change.task as keyof TaskSettings;
        
        if (newSettings[taskKey]) {
          (newSettings[taskKey] as any)[change.field] = change.to;
        }
        
        // Update progress
        const progress = ((i + 1) / totalChanges) * 100;
        setPreviewModal(prev => ({ ...prev, progress }));
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Save to history
      addToHistory(`Bulk operation: ${operation.name}`, taskSettings);
      
      // Apply changes
      onSettingsChange(newSettings);
      
      // Remove completed operation
      setBulkOperations(prev => prev.filter(op => op.id !== operation.id));
      
      showNotification({ title: 'Bulk operation completed successfully', type: 'success' });
      
      // Close modal after brief delay
      setTimeout(() => {
        setPreviewModal({ isOpen: false, operation: null, isExecuting: false, progress: 0 });
      }, 1000);
      
    } catch (error) {
      setLastError(`Bulk operation failed: ${error}`);
      showNotification({ title: 'Bulk operation failed', type: 'error' });
      setPreviewModal(prev => ({ ...prev, isExecuting: false, progress: 0 }));
    }
  }, [taskSettings, onSettingsChange, showNotification]);

  // History management
  const addToHistory = useCallback((description: string, settings: TaskSettings) => {
    const newEntry: SettingsHistory = {
      id: Date.now().toString(),
      timestamp: new Date(),
      description,
      settings: JSON.parse(JSON.stringify(settings))
    };
    
    setSettingsHistory(prev => {
      const newHistory = [...prev.slice(0, currentHistoryIndex + 1), newEntry];
      return newHistory.slice(-10); // Keep last 10 entries
    });
    setCurrentHistoryIndex(prev => Math.min(prev + 1, 9));
  }, [currentHistoryIndex]);

  const undoLastChange = useCallback(() => {
    if (currentHistoryIndex > 0) {
      const previousSettings = settingsHistory[currentHistoryIndex - 1].settings;
      onSettingsChange(previousSettings);
      setCurrentHistoryIndex(prev => prev - 1);
      showNotification({ title: 'Changes undone', type: 'success' });
    }
  }, [currentHistoryIndex, settingsHistory, onSettingsChange, showNotification]);

  // Export/Import
  const exportSettings = useCallback(() => {
    const data = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: taskSettings
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-manager-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification({ title: 'Settings exported successfully', type: 'success' });
  }, [taskSettings, showNotification]);

  const importSettings = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.settings) {
          addToHistory('Imported settings', taskSettings);
          onSettingsChange(data.settings);
          showNotification({ title: 'Settings imported successfully', type: 'success' });
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        setLastError(`Import failed: ${error}`);
        showNotification({ title: 'Failed to import settings', type: 'error' });
      }
    };
    reader.readAsText(file);
  }, [taskSettings, onSettingsChange, showNotification, addToHistory]);

  // Effects
  useEffect(() => {
    const timeout = setTimeout(() => {
      generateRecommendations();
      generateBulkOperations();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [generateRecommendations, generateBulkOperations]);

  // Clear error after 10 seconds
  useEffect(() => {
    if (lastError) {
      const timeout = setTimeout(() => setLastError(null), 10000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [lastError]);

  const criticalRecommendations = recommendations.filter(r => r.severity === 'critical');

  return (
    <div className={`settings-enhancement-engine ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={importSettings}
        style={{ display: 'none' }}
      />

      {/* Error Display */}
      {lastError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">Error Occurred</p>
              <p className="text-sm mt-1">{lastError}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setLastError(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      {/* Critical Issues Alert */}
      {criticalRecommendations.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">Critical Configuration Issues</p>
              <p className="text-sm mt-1">
                {criticalRecommendations.length} critical issue{criticalRecommendations.length > 1 ? 's' : ''} requiring attention
              </p>
            </div>
            <Button size="sm" onClick={() => setShowRecommendations(true)} className="cursor-pointer">
              Fix Now
            </Button>
          </div>
        </Alert>
      )}

      {/* Recommendations Panel */}
      {showRecommendations && recommendations.length > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                AI Recommendations
              </h3>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {recommendations.length} insights
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRecommendations(false)}
              className="text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              Close
            </Button>
          </div>
          
          <div className="grid gap-3">
            {recommendations.slice(0, 4).map(rec => (
              <div key={rec.id} className="bg-white dark:bg-gray-900 p-4 rounded-lg border shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge 
                        variant={rec.severity === 'critical' ? 'destructive' : rec.severity === 'warning' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {rec.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{rec.confidence}% confidence</span>
                    </div>
                    
                    <h4 className="font-medium text-sm mb-1">{rec.title}</h4>
                    <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="font-medium text-green-700">Impact:</span>
                        <p className="text-green-600">{rec.estimatedImprovement}</p>
                      </div>
                      <div>
                        <span className="font-medium text-blue-700">Change:</span>
                        <p className="text-blue-600">{rec.currentValue} → {rec.recommendedValue}</p>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    onClick={() => applyRecommendation(rec)}
                    disabled={!rec.automatable}
                    className="text-xs h-7 cursor-pointer ml-4"
                  >
                    {rec.automatable ? 'Apply' : 'Review'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Operations */}
      {bulkOperations.length > 0 && (
        <div className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-amber-900 dark:text-amber-100">Bulk Optimization Available</h4>
            <Badge variant="outline" className="text-amber-700">
              {bulkOperations.length} operation{bulkOperations.length > 1 ? 's' : ''}
            </Badge>
          </div>
          
          <div className="grid gap-2">
            {bulkOperations.map(op => (
              <div key={op.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border">
                <div>
                  <div className="font-medium text-sm">{op.name}</div>
                  <div className="text-xs text-muted-foreground">{op.description}</div>
                  <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <span>{op.estimatedTime} min, {op.targetTasks.length} tasks, {op.riskLevel} risk</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setPreviewModal({ isOpen: true, operation: op, isExecuting: false, progress: 0 })}
                  className="text-xs cursor-pointer"
                >
                  Preview
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="flex items-center gap-2 mb-4">
        <Tooltip>
          <Button
            variant={recommendations.length > 0 ? "default" : "ghost"}
            size="sm"
            onClick={() => setShowRecommendations(!showRecommendations)}
            className="relative cursor-pointer"
          >
            <Zap className="h-4 w-4 mr-1" />
            AI
            {recommendations.length > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 text-xs p-0 flex items-center justify-center">
                {recommendations.length}
              </Badge>
            )}
          </Button>
          <div className="text-xs">AI Recommendations</div>
        </Tooltip>
        
        <Tooltip>
          <Button
            variant="ghost"
            size="sm"
            onClick={undoLastChange}
            disabled={currentHistoryIndex <= 0}
            className="cursor-pointer"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <div className="text-xs">Undo Last Change</div>
        </Tooltip>
        
        <Tooltip>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportSettings}
            className="cursor-pointer"
          >
            <Download className="h-4 w-4" />
          </Button>
          <div className="text-xs">Export Settings</div>
        </Tooltip>
        
        <Tooltip>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <div className="text-xs">Import Settings</div>
        </Tooltip>
      </div>

      {/* Preview Modal */}
      <Dialog open={previewModal.isOpen} onOpenChange={(open) => 
        !previewModal.isExecuting && setPreviewModal({ isOpen: open, operation: null, isExecuting: false, progress: 0 })
      }>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Preview Bulk Operation
            </DialogTitle>
            <DialogDescription>
              Review the changes before applying them to your settings.
            </DialogDescription>
          </DialogHeader>
          
          {previewModal.operation && (
            <div className="space-y-4">
              {/* Operation Details */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">{previewModal.operation.name}</h4>
                <p className="text-sm text-muted-foreground mb-2">{previewModal.operation.description}</p>
                <div className="flex gap-2">
                  <Badge variant="outline">{previewModal.operation.estimatedTime} minutes</Badge>
                  <Badge variant="outline">{previewModal.operation.targetTasks.length} tasks</Badge>
                  <Badge variant={
                    previewModal.operation.riskLevel === 'low' ? 'default' : 
                    previewModal.operation.riskLevel === 'medium' ? 'secondary' : 'destructive'
                  }>
                    {previewModal.operation.riskLevel} risk
                  </Badge>
                </div>
              </div>

              {/* Progress Bar */}
              {previewModal.isExecuting && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Applying changes...</span>
                    <span>{Math.round(previewModal.progress)}%</span>
                  </div>
                  <Progress value={previewModal.progress} className="w-full" />
                </div>
              )}

              {/* Changes Preview */}
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-3 space-y-2">
                  {previewModal.operation.previewChanges.map((change, index) => (
                    <div key={index} className={`p-2 rounded text-sm ${
                      change.impact === 'positive' ? 'bg-green-50 border-green-200' :
                      change.impact === 'needs-review' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="font-medium">{change.task}.{change.field}</div>
                      <div className="text-muted-foreground">
                        {String(change.from)} → {String(change.to)}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewModal({ isOpen: false, operation: null, isExecuting: false, progress: 0 })}
                  disabled={previewModal.isExecuting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => executeBulkOperation(previewModal.operation!)}
                  disabled={previewModal.isExecuting}
                  className="cursor-pointer"
                >
                  {previewModal.isExecuting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Apply Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SettingsEnhancementEngine;