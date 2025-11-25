"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
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
  // Local state for immediate UI responsiveness (same pattern as FloatingMergeInstructions)
  const [localValue, setLocalValue] = useState(mergeInstructions);
  const isFocusedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when prop changes from outside, but only if not focused
  useEffect(() => {
    // Skip sync if this editor or the floating editor is focused
    if (isFocusedRef.current || (window as any).__mergeInstructionsEditorFocused) {
      return;
    }
    setLocalValue(mergeInstructions);
  }, [mergeInstructions]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle input changes - update local state and debounce sync to parent
  const handleInstructionsChange = useCallback((value: string) => {
    setLocalValue(value);

    // Debounce sync to parent (500ms)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onMergeInstructionsChange(value);
    }, 500);
  }, [onMergeInstructionsChange]);

  // Set focus flag on focus
  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
    (window as any).__mergeInstructionsEditorFocused = true;
  }, []);

  // Flush on blur - send to parent immediately
  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    (window as any).__mergeInstructionsEditorFocused = false;
    // Cancel pending debounce and flush immediately
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    onMergeInstructionsChange(localValue);
  }, [localValue, onMergeInstructionsChange]);

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
                  value={localValue}
                  onChange={(e) => handleInstructionsChange(e.target.value)}
                  onFocus={handleFocus}
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