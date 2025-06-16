import { type TaskSettings, type TaskModelSettings } from "@/types/task-settings-types";

export interface SmartRecommendation {
  id: string;
  type: 'performance' | 'cost-optimization' | 'security' | 'best-practice';
  priority: 'critical' | 'warning' | 'suggestion';
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
  fieldToChange: keyof TaskModelSettings;
}

export interface BulkOperationChange {
  task: string;
  field: string;
  from: any;
  to: any;
  impact: 'positive' | 'neutral' | 'needs-review';
}

export interface BulkOperation {
  id: string;
  type: 'model-sync' | 'optimize-all' | 'reset-defaults' | 'apply-preset';
  name: string;
  description: string;
  targetTasks: (keyof TaskSettings)[];
  previewChanges: BulkOperationChange[];
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface SettingsHistory {
  id: string;
  timestamp: Date;
  description: string;
  settings: TaskSettings;
}