"use client";

import { CopyButtonConfig } from "@/types/config-types";
import { Button, Input, Label, Textarea } from "@/ui";
import { Trash2 } from "lucide-react";

interface CopyButtonEditorProps {
  button: CopyButtonConfig;
  onChange: (button: CopyButtonConfig) => void;
  onDelete: () => void;
}

export function CopyButtonEditor({ button, onChange, onDelete }: CopyButtonEditorProps) {
  const handleLabelChange = (value: string) => {
    onChange({
      ...button,
      label: value,
    });
  };

  const handleContentChange = (value: string) => {
    onChange({
      ...button,
      content: value,
    });
  };

  return (
    <div className="space-y-4 p-4 border border-border/50 rounded-lg bg-background/50">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Copy Button</Label>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`button-label-${button.id}`} className="text-xs font-medium">
            Label
          </Label>
          <Input
            id={`button-label-${button.id}`}
            value={button.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Enter button label"
            className="text-sm"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor={`button-content-${button.id}`} className="text-xs font-medium">
            Content
          </Label>
          <Textarea
            id={`button-content-${button.id}`}
            value={button.content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Enter content to copy"
            className="text-sm min-h-[80px]"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}