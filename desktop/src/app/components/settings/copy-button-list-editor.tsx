"use client";

import { CopyButtonConfig } from "@/types/config-types";
import { Button } from "@/ui";
import { Plus } from "lucide-react";
import { CopyButtonEditor } from "./copy-button-editor";
import { useCallback, memo } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

interface CopyButtonListEditorProps {
  copyButtons: CopyButtonConfig[];
  onChange: (copyButtons: CopyButtonConfig[]) => void;
  readOnly?: boolean;
  showCustomizeButton?: boolean;
  onCustomize?: () => void;
}

function CopyButtonListEditorComponent({ copyButtons, onChange, readOnly, showCustomizeButton, onCustomize }: CopyButtonListEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
        delay: 100,
        tolerance: 5
      },
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = copyButtons.findIndex(button => button.id === active.id);
      const newIndex = copyButtons.findIndex(button => button.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedButtons = arrayMove(copyButtons, oldIndex, newIndex);
        onChange(reorderedButtons);
      }
    }
  }, [copyButtons, onChange]);

  const handleButtonChange = useCallback((index: number, updatedButton: CopyButtonConfig) => {
    const newButtons = [...copyButtons];
    newButtons[index] = updatedButton;
    onChange(newButtons);
  }, [copyButtons, onChange]);

  const handleButtonDelete = useCallback((index: number) => {
    const newButtons = copyButtons.filter((_, i) => i !== index);
    onChange(newButtons);
  }, [copyButtons, onChange]);

  const handleAddButton = useCallback(() => {
    const newButton: CopyButtonConfig = {
      id: `button-${Date.now()}`,
      label: "",
      content: "",
    };
    onChange([...copyButtons, newButton]);
  }, [copyButtons, onChange]);

  return (
    <div className="space-y-3">
      {/* Help text first - users need context before action */}
      <p className="text-xs text-muted-foreground">
        Add buttons that will appear when viewing implementation plans. Use <code className="bg-muted px-1 rounded">{"{{IMPLEMENTATION_PLAN}}"}</code> for full content, <code className="bg-muted px-1 rounded">{"{{TASK_DESCRIPTION}}"}</code> for the task description, <code className="bg-muted px-1 rounded">{"{{STEP_CONTENT}}"}</code> for specific steps.
      </p>
      
      {showCustomizeButton && onCustomize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            These are default copy buttons. Click "Customize" to modify them.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onCustomize}
          >
            Customize
          </Button>
        </div>
      )}
      
      {!readOnly && !showCustomizeButton && (
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddButton}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Button
          </Button>
        </div>
      )}

      {copyButtons.length === 0 ? (
        <div className="p-4 border border-dashed border-border/50 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            {readOnly ? "No default buttons are configured for this task." : "No copy buttons configured yet."}
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={copyButtons.filter(b => b.id).map(b => b.id)} strategy={verticalListSortingStrategy} id="copy-buttons-sortable-context">
            <div className="space-y-3">
              {copyButtons.map((button, index) => {
                // Ensure button has an ID
                const buttonWithId = {
                  ...button,
                  id: button.id || `button-${index}-${Date.now()}`
                };
                return (
                  <CopyButtonEditor
                    key={buttonWithId.id}
                    fieldId={buttonWithId.id}
                    button={buttonWithId}
                    onChange={(updatedButton) => handleButtonChange(index, updatedButton)}
                    onDelete={() => handleButtonDelete(index)}
                    readOnly={readOnly || showCustomizeButton}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

export const CopyButtonListEditor = memo(CopyButtonListEditorComponent);