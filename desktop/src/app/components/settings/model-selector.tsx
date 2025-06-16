"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { type ProviderWithModels } from "@/types/config-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Button,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui";
import { cn } from "@/utils/utils";

interface ModelSelectorProps {
  providers: ProviderWithModels[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  disableTooltips?: boolean;
}

export function ModelSelector({ providers, selectedModelId, onSelect, disableTooltips = false }: ModelSelectorProps) {
  const [overriddenProviderId, setOverriddenProviderId] = useState<string | null>(null);

  const selectedModel = providers.flatMap(p => p.models).find(m => m.id === selectedModelId);

  const activeProviderId = overriddenProviderId ?? selectedModel?.provider ?? providers[0]?.provider?.code ?? "";
  const activeProvider = providers.find(p => p.provider.code === activeProviderId);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setOverriddenProviderId(null);
    }
  };

  const formatPrice = (price: number) => {
    const pricePerMillion = price * 1_000_000;
    if (pricePerMillion === 0) return "Free";
    if (pricePerMillion >= 1) return `$${pricePerMillion.toFixed(2)}`;
    if (pricePerMillion >= 0.01) return `$${pricePerMillion.toFixed(3)}`;
    return `$${pricePerMillion.toFixed(6)}`;
  };

  const formatContextWindow = (contextWindow?: number) => {
    if (!contextWindow) return "Unknown";
    if (contextWindow >= 1000000) return `${(contextWindow / 1000000).toFixed(1)}M`;
    if (contextWindow >= 1000) return `${(contextWindow / 1000).toFixed(0)}K`;
    return contextWindow.toString();
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          aria-label="Select model"
        >
          <div className="flex items-center gap-2 truncate">
            {selectedModel ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {selectedModel.providerName}
                </span>
                <span className="font-medium">
                  {selectedModel.name}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Select a model</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[560px] p-0">
        <div className="flex h-[400px]">
          <div className="w-[180px] border-r border-border/60 bg-muted/20">
            <div className="p-3">
              <h4 className="text-sm font-medium text-foreground mb-2">Providers</h4>
              <div className="space-y-1">
                {providers.map((provider) => (
                  <Button
                    key={provider.provider.code}
                    variant="ghost"
                    size="sm"
                    onClick={() => setOverriddenProviderId(provider.provider.code)}
                    className={cn(
                      "w-full justify-start text-sm",
                      activeProviderId === provider.provider.code
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{provider.provider.name}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1">
            <ScrollArea className="h-full">
              <div className="p-3">
                <h4 className="text-sm font-medium text-foreground mb-2">
                  {activeProvider?.provider.name || "Models"}
                </h4>
                <div className="grid gap-2">
                  {activeProvider?.models.map((model) => {
                    const ModelListItem = (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect(model.id)}
                        className={cn(
                          "w-full justify-start p-3 h-auto text-left",
                          selectedModelId === model.id
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {model.name}
                              </span>
                              {selectedModelId === model.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{formatContextWindow(model.contextWindow)} tokens</span>
                              <span>
                                {formatPrice(model.pricePerInputToken)}/
                                {formatPrice(model.pricePerOutputToken)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Button>
                    );

                    if (disableTooltips) {
                      return (
                        <div key={model.id}>
                          {ModelListItem}
                        </div>
                      );
                    }

                    return (
                      <div key={model.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {ModelListItem}
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[300px]">
                            <div className="space-y-2">
                              <div>
                                <p className="font-medium">{model.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {model.providerName}
                                </p>
                              </div>
                              {model.description && (
                                <p className="text-sm">{model.description}</p>
                              )}
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span>Context Window:</span>
                                  <span>{formatContextWindow(model.contextWindow)} tokens</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Input Price (per 1M):</span>
                                  <span>{formatPrice(model.pricePerInputToken)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Output Price (per 1M):</span>
                                  <span>{formatPrice(model.pricePerOutputToken)}</span>
                                </div>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  }) || (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No models available for this provider
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
        <div className="border-t p-3 bg-muted/20">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Prices are per million tokens.</p>
            <p>Context window is in tokens.</p>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}