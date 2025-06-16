"use client";

import React, { useState } from "react";
import { type TaskSettings } from "@/types";
import { BulkOperationPreviewModal } from "../bulk-operation-preview-modal";
import {
  useSmartRecommendations,
  useBulkOperations,
  useSettingsHistory,
  useSettingsImportExport,
} from "./hooks";
import {
  CriticalIssuesAlert,
  RecommendationsPanel,
  BulkOperationsPanel,
  ControlBar,
} from "./components";
import { type SmartRecommendation, type BulkOperation } from "./types";

interface SettingsEnhancementEngineProps {
  taskSettings: TaskSettings;
  onSettingsChange: (settings: TaskSettings) => void;
  onRecommendationApply?: (recommendation: SmartRecommendation) => void;
}

export default function SettingsEnhancementEngine({
  taskSettings,
  onSettingsChange,
  onRecommendationApply,
}: SettingsEnhancementEngineProps) {
  const [selectedOperation, setSelectedOperation] = useState<BulkOperation | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const {
    recommendations,
    showRecommendations,
    setShowRecommendations,
    generateRecommendations,
    applyRecommendation,
  } = useSmartRecommendations(taskSettings);

  const {
    operations,
    previewOperation,
    applyOperation,
  } = useBulkOperations(taskSettings);

  const {
    history,
    addToHistory,
    undoLastChange,
  } = useSettingsHistory();

  const {
    exportSettings,
    importSettings,
    fileInputRef,
  } = useSettingsImportExport();

  const handleRecommendationApply = async (recommendation: SmartRecommendation) => {
    const newSettings = { ...taskSettings };
    const currentSettings = newSettings[recommendation.taskKey];
    
    if (currentSettings && recommendation.fieldToChange) {
      (currentSettings as any)[recommendation.fieldToChange] = recommendation.recommendedValue;
      onSettingsChange(newSettings);
      
      addToHistory({
        id: `rec-${Date.now()}`,
        timestamp: new Date(),
        description: `Applied recommendation: ${recommendation.title}`,
        settings: newSettings,
      });

      generateRecommendations();
    }

    if (onRecommendationApply) {
      onRecommendationApply(recommendation);
    }
  };

  const handleOperationPreview = async (operation: BulkOperation) => {
    const previewedOperation = await previewOperation(operation);
    setSelectedOperation(previewedOperation);
    setIsPreviewModalOpen(true);
  };

  const handleOperationApply = async (operation: BulkOperation) => {
    const newSettings = await applyOperation(operation);
    onSettingsChange(newSettings);
    
    addToHistory({
      id: `op-${Date.now()}`,
      timestamp: new Date(),
      description: `Applied bulk operation: ${operation.name}`,
      settings: newSettings,
    });

    generateRecommendations();
    setIsPreviewModalOpen(false);
    setSelectedOperation(null);
  };

  const criticalIssues = recommendations.filter(rec => rec.priority === 'critical');

  // Generate recommendations on mount and settings change
  React.useEffect(() => {
    generateRecommendations();
  }, [taskSettings, generateRecommendations]);

  return (
    <div className="space-y-6">
      {criticalIssues.length > 0 && (
        <CriticalIssuesAlert
          issues={criticalIssues}
          onRecommendationApply={handleRecommendationApply}
        />
      )}

      <ControlBar
        recommendationsCount={recommendations.length}
        canUndo={history.length > 0}
        onToggleRecommendations={() => setShowRecommendations(!showRecommendations)}
        onUndo={() => undoLastChange(onSettingsChange)}
        onExport={() => exportSettings(taskSettings)}
        onImport={() => fileInputRef.current?.click()}
      />

      <RecommendationsPanel
        recommendations={recommendations}
        isVisible={showRecommendations}
        onClose={() => setShowRecommendations(false)}
        onApplyRecommendation={applyRecommendation}
      />

      <BulkOperationsPanel
        operations={operations}
        onPreviewOperation={handleOperationPreview}
      />

      <BulkOperationPreviewModal
        operation={selectedOperation}
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setSelectedOperation(null);
        }}
        onApply={handleOperationApply}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => importSettings(e, onSettingsChange, addToHistory)}
        accept=".json"
        style={{ display: 'none' }}
      />
    </div>
  );
}