"use client";

import React from "react";
import ImplementationPlanActions from "../_components/implementation-plan-actions";

/**
 * Action Section component
 *
 * Consolidated to use the shared ImplementationPlanActions component
 * This helps maintain consistent UI and behavior for implementation plans
 * across different parts of the application.
 */
interface ActionSectionProps {
  isSessionActiveAndInitialized?: boolean;
  isSwitchingSession?: boolean;
  disabled?: boolean;
}

const ActionSection = React.memo(function ActionSection({
  isSessionActiveAndInitialized = false,
  isSwitchingSession = false,
  disabled = false
}: ActionSectionProps) {
  return (
    <ImplementationPlanActions
      disabled={!isSessionActiveAndInitialized || isSwitchingSession || disabled}
    />
  );
});

export default ActionSection;