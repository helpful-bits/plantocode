"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/tooltip";
import { type ModelInfo } from "@/types/config-types";

interface ModelSelectorToggleProps {
  models: ModelInfo[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
  estimatedTokens: number | null;
  maxOutputTokens: number | undefined;
}

export function ModelSelectorToggle({ models, selectedModelId, onSelect, estimatedTokens, maxOutputTokens }: ModelSelectorToggleProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
        {models.map((model, index) => {
          const totalRequiredTokens = (estimatedTokens ?? 0) + (maxOutputTokens ?? 0);
          const contextWindow = model.contextWindow ?? 0;
          const exceedsLimit = contextWindow > 0 && totalRequiredTokens > contextWindow;
          
          return (
            <React.Fragment key={model.id}>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => !exceedsLimit && onSelect(model.id)}
                  className={`
                    flex items-center h-7 px-3 text-xs border-0 rounded-none transition-all duration-200 backdrop-blur-sm
                    ${selectedModelId === model.id 
                      ? "bg-primary/10 hover:bg-primary/15" 
                      : "hover:bg-accent/30"
                    }
                    ${exceedsLimit ? "hover:bg-destructive/10" : ""}
                    ${exceedsLimit 
                      ? "text-destructive cursor-not-allowed" 
                      : selectedModelId === model.id 
                        ? "text-primary font-medium hover:text-primary cursor-pointer" 
                        : "text-muted-foreground hover:text-accent-foreground cursor-pointer"
                    }
                  `}
                >
                  {model.name}
                </button>
                {exceedsLimit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center">
                        <AlertTriangle className="text-destructive h-3 w-3 cursor-help" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="w-64 bg-popover text-popover-foreground border border-border">
                      <div className="p-2 text-xs space-y-1">
                        <div>Input Tokens: {estimatedTokens?.toLocaleString() ?? 'N/A'}</div>
                        <div>Max Output Tokens: {maxOutputTokens?.toLocaleString() ?? 'N/A'}</div>
                        <div>Estimated Total: {totalRequiredTokens.toLocaleString()}</div>
                        <div>Model Limit: {contextWindow.toLocaleString()}</div>
                        <div className="font-bold text-destructive pt-1 border-t border-border/20 mt-2 pt-2">
                          ⚠️ Exceeds limit by {(totalRequiredTokens - contextWindow).toLocaleString()} tokens
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            {index < models.length - 1 && (
              <div className="w-[1px] h-6 bg-border/40" />
            )}
          </React.Fragment>
        );
        })}
      </div>
    </TooltipProvider>
  );
}