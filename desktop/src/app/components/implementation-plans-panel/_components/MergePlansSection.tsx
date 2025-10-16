"use client";

import React, { useState, useCallback } from "react";
import { Merge, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Textarea } from "@/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";

interface MergePlansSectionProps {
  selectedCount: number;
  mergeInstructions: string;
  isMerging: boolean;
  onMergeInstructionsChange: (instructions: string) => void;
  onMerge: () => void;
  onClearSelection: () => void;
}

export const MergePlansSection = React.memo(function MergePlansSection({
  selectedCount,
  mergeInstructions,
  isMerging,
  onMergeInstructionsChange,
  onMerge,
  onClearSelection,
}: MergePlansSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const handleInstructionsChange = useCallback((value: string) => {
    onMergeInstructionsChange(value);
  }, [onMergeInstructionsChange]);

  const handleBlur = useCallback(() => {
    onMergeInstructionsChange(mergeInstructions);
  }, [mergeInstructions, onMergeInstructionsChange]);

  return (
    <Card className="bg-primary/5 border-primary/20 mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Merge className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectedCount} plans selected for merge
                </span>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="merge-instructions" className="text-sm text-muted-foreground mb-1 block">
                  Merge Instructions (optional)
                </label>
                <Textarea
                  id="merge-instructions"
                  placeholder="Provide specific instructions for how to merge these plans..."
                  value={mergeInstructions}
                  onChange={(e) => handleInstructionsChange(e.target.value)}
                  onBlur={handleBlur}
                  className="min-h-[80px] resize-y"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={onMerge}
                  disabled={isMerging || selectedCount < 2}
                  isLoading={isMerging}
                  size="sm"
                  className="flex-1"
                >
                  <Merge className="h-4 w-4 mr-2" />
                  Merge Plans
                </Button>
                <Button
                  onClick={onClearSelection}
                  variant="outline"
                  size="sm"
                  disabled={isMerging}
                >
                  Clear Selection
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                The AI will combine the selected plans into a single comprehensive implementation plan.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
});