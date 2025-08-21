// Desktop Model Selector Toggle - simplified demo version without token limit logic
'use client';

import React from "react";

interface ModelInfo {
  id: string;
  name: string;
}

interface DesktopModelSelectorToggleProps {
  models: ModelInfo[];
  selectedModelId?: string;
  onSelect?: (modelId: string) => void;
  disabled?: boolean;
}

export function DesktopModelSelectorToggle({ 
  models, 
  selectedModelId, 
  onSelect,
  disabled = false
}: DesktopModelSelectorToggleProps) {
  const handleSelect = (modelId: string) => {
    if (!disabled && onSelect) {
      onSelect(modelId);
    }
  };

  return (
    <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
      {models.map((model, index) => {
        const isSelected = selectedModelId === model.id;
        
        return (
          <React.Fragment key={model.id}>
            <button
              type="button"
              onClick={() => handleSelect(model.id)}
              disabled={disabled}
              className={`
                flex items-center h-7 px-3 text-xs border-0 rounded-none transition-all duration-200 backdrop-blur-sm whitespace-nowrap
                ${isSelected 
                  ? "bg-primary/10 hover:bg-primary/15" 
                  : "hover:bg-accent/30"
                }
                ${isSelected 
                  ? "text-primary font-medium hover:text-primary cursor-pointer" 
                  : "text-muted-foreground hover:text-accent-foreground cursor-pointer"
                }
                ${disabled ? "opacity-50 cursor-default" : ""}
              `}
            >
              {model.name}
            </button>
            {index < models.length - 1 && (
              <div className="w-[1px] h-6 bg-border/40" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}