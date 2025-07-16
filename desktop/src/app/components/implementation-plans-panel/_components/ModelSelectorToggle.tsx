"use client";

import React from "react";
import { Button } from "@/ui/button";
import { AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/ui/dropdown-menu";
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
            <div className="flex items-center gap-1.5">
              {model.name}
              {model.contextWindow && estimatedTokens && maxOutputTokens && (estimatedTokens + maxOutputTokens > model.contextWindow) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <AlertTriangle 
                      className="text-amber-500 h-3 w-3" 
                      onClick={(e) => e.stopPropagation()}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <div className="p-2 text-xs space-y-1">
                      <div>Input Tokens: {estimatedTokens?.toLocaleString() || 'N/A'}</div>
                      <div>Max Output Tokens: {maxOutputTokens?.toLocaleString() || 'N/A'}</div>
                      <div>Estimated Total: {(estimatedTokens && maxOutputTokens) ? (estimatedTokens + maxOutputTokens).toLocaleString() : 'N/A'}</div>
                      <div>Model Limit: {model.contextWindow?.toLocaleString() || 'N/A'}</div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </Button>
          {index < models.length - 1 && (
            <div className="w-[1px] h-6 bg-border/40" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}