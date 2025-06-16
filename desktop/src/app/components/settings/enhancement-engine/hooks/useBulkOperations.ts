import { useState, useCallback, useEffect } from "react";
import { type TaskSettings } from "@/types/task-settings-types";
import { type BulkOperation } from "../types";

export function useBulkOperations(taskSettings: TaskSettings) {
  const [operations, setOperations] = useState<BulkOperation[]>([]);
  const [isLoading] = useState(false);

  const generateBulkOperations = useCallback(() => {
    const ops: BulkOperation[] = [];
    
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
    
    setOperations(ops);
  }, [taskSettings]);

  const previewOperation = useCallback(async (operation: BulkOperation) => {
    return operation;
  }, []);

  const applyOperation = useCallback(async (operation: BulkOperation) => {
    const newSettings = { ...taskSettings };
    
    operation.previewChanges.forEach(change => {
      const taskKey = change.task as keyof TaskSettings;
      if (newSettings[taskKey]) {
        (newSettings[taskKey] as any)[change.field] = change.to;
      }
    });
    
    return newSettings;
  }, [taskSettings]);

  useEffect(() => {
    generateBulkOperations();
  }, [generateBulkOperations]);

  return {
    operations,
    isLoading,
    previewOperation,
    applyOperation
  };
}