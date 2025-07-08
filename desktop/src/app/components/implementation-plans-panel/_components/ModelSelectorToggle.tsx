"use client";

import React from "react";
import { Button } from "@/ui/button";
import { type ModelInfo } from "@/types/config-types";

interface ModelSelectorToggleProps {
  models: ModelInfo[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}

export function ModelSelectorToggle({ models, selectedModelId, onSelect }: ModelSelectorToggleProps) {
  return (
    <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
      {models.map((model, index) => (
        <React.Fragment key={model.id}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(model.id)}
            className={`
              h-7 px-3 text-xs border-0 rounded-none
              ${selectedModelId === model.id 
                ? "bg-primary/10 text-primary font-medium hover:bg-primary/15" 
                : "text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground"
              }
              transition-all duration-200 backdrop-blur-sm
            `}
          >
            {model.name}
          </Button>
          {index < models.length - 1 && (
            <div className="w-[1px] h-6 bg-border/40" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}