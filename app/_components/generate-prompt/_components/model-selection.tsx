"use client";

import React from "react";
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from "@/lib/constants";

// Interface for component props
interface ModelSelectionProps {
  modelUsed: string;
  setModelUsed: (model: string) => void;
  onInteraction?: () => void;
}

// Model information
const modelInfo = {
  [GEMINI_FLASH_MODEL]: {
    name: "Gemini 2.5 Flash",
    description: "Fast response, great for most tasks. Optimized for quick responses.",
  },
  [GEMINI_PRO_PREVIEW_MODEL]: {
    name: "Gemini 2.5 Pro",
    description: "Higher quality, better reasoning. Optimized for complex tasks and detailed responses.",
  }
};

// Model selection component
export default function ModelSelection({ modelUsed, setModelUsed, onInteraction }: ModelSelectionProps) {
  // Handle model change
  const handleModelChange = (value: string) => {
    setModelUsed(value);
    if (onInteraction) {
      onInteraction();
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Model Selection</CardTitle>
        <CardDescription>
          Choose the Gemini model that best fits your needs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model-select" className="text-right">
              Model
            </Label>
            <div className="col-span-3">
              <Select value={modelUsed} onValueChange={handleModelChange}>
                <SelectTrigger id="model-select">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Gemini Models</SelectLabel>
                    <SelectItem value={GEMINI_FLASH_MODEL}>
                      {modelInfo[GEMINI_FLASH_MODEL].name}
                    </SelectItem>
                    <SelectItem value={GEMINI_PRO_PREVIEW_MODEL}>
                      {modelInfo[GEMINI_PRO_PREVIEW_MODEL].name}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {modelInfo[modelUsed]?.description || "Select a model to see its description."}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 