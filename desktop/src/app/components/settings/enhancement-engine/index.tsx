"use client";

import React, { useState } from "react";
import { type TaskSettings } from "@/types";
import { BulkOperationPreviewModal } from "../bulk-operation-preview-modal";
import {
  useSmartRecommendations,
  useBulkOperations,
} from "./hooks";
import {
  CriticalIssuesAlert,
  RecommendationsPanel,
  BulkOperationsPanel,
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

  const handleRecommendationApply = async (recommendation: SmartRecommendation) => {
    const newSettings = { ...taskSettings };
    const currentSettings = newSettings[recommendation.taskKey];
    
    if (currentSettings && recommendation.fieldToChange) {
      (currentSettings as any)[recommendation.fieldToChange] = recommendation.recommendedValue;
      onSettingsChange(newSettings);
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

    </div>
  );
}