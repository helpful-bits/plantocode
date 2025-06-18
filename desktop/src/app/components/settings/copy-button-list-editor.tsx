"use client";

import { CopyButtonConfig } from "@/types/config-types";
import { Button } from "@/ui";
import { Plus } from "lucide-react";
import { CopyButtonEditor } from "./copy-button-editor";

interface CopyButtonListEditorProps {
  copyButtons: CopyButtonConfig[];
  onChange: (copyButtons: CopyButtonConfig[]) => void;
}

export function CopyButtonListEditor({ copyButtons, onChange }: CopyButtonListEditorProps) {
  const handleButtonChange = (index: number, updatedButton: CopyButtonConfig) => {
    const newButtons = [...copyButtons];
    newButtons[index] = updatedButton;
    onChange(newButtons);
  };

  const handleButtonDelete = (index: number) => {
    const newButtons = copyButtons.filter((_, i) => i !== index);
    onChange(newButtons);
  };

  const handleAddButton = () => {
    const newButton: CopyButtonConfig = {
      id: `button-${Date.now()}`,
      label: "",
      content: "",
    };
    onChange([...copyButtons, newButton]);
  };

  return (
    <div className="space-y-4">
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
      <p className="text-xs text-muted-foreground">
        Create custom copy buttons for implementation plans. Available placeholders: {`{{FULL_PLAN}}, {{CURRENT_STEP_CONTENT}}, {{SELECTED_STEP_NUMBER}}`}
      </p>

      {copyButtons.length === 0 ? (
        <div className="p-4 border border-dashed border-border/50 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            No copy buttons configured. Click "Add Button" to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {copyButtons.map((button, index) => (
            <CopyButtonEditor
              key={button.id}
              button={button}
              onChange={(updatedButton) => handleButtonChange(index, updatedButton)}
              onDelete={() => handleButtonDelete(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}