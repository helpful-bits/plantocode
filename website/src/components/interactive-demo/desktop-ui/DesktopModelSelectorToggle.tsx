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
                  ? "teal-glow-subtle shadow-teal" 
                  : "hover:bg-accent/30"
                }
                ${isSelected 
                  ? "text-white font-bold cursor-pointer" 
                  : "text-muted-foreground hover:text-accent-foreground cursor-pointer"
                }
                ${disabled ? "opacity-50 cursor-default" : ""}
              `}
              style={{
                background: isSelected ? 'linear-gradient(135deg, oklch(0.48 0.15 195), oklch(0.58 0.12 195))' : undefined,
                border: isSelected ? '1px solid oklch(0.68 0.08 195)' : undefined
              }}
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