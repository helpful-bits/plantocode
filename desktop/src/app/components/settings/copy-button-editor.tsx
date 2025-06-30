"use client";

import { CopyButtonConfig } from "@/types/config-types";
import { Button, Input, Label, Textarea } from "@/ui";
import { Trash2, GripVertical } from "lucide-react";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CopyButtonEditorProps {
  button: CopyButtonConfig;
  onChange: (button: CopyButtonConfig) => void;
  onDelete: () => void;
  readOnly?: boolean;
  fieldId: string;
}

function CopyButtonEditorComponent({ button, onChange, onDelete, readOnly, fieldId }: CopyButtonEditorProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };
  // Local state for immediate UI updates
  const [localLabel, setLocalLabel] = useState(button.label);
  const [localContent, setLocalContent] = useState(button.content);
  
  // Refs for debouncing
  const labelTimeoutRef = useRef<number | null>(null);
  const contentTimeoutRef = useRef<number | null>(null);
  const latestButtonRef = useRef(button);

  // Update local state when button prop changes (e.g., from external reset)
  useEffect(() => {
    setLocalLabel(button.label);
    setLocalContent(button.content);
  }, [button.label, button.content]);

  useEffect(() => {
    latestButtonRef.current = button;
  }, [button]);

  // Debounced change handlers
  const handleLabelChange = useCallback((value: string) => {
    setLocalLabel(value);
    
    if (labelTimeoutRef.current) {
      clearTimeout(labelTimeoutRef.current);
    }
    
    labelTimeoutRef.current = window.setTimeout(() => {
      onChange({
        ...latestButtonRef.current,
        label: value,
      });
    }, 300);
  }, [button, onChange]);

  const handleContentChange = useCallback((value: string) => {
    setLocalContent(value);
    
    if (contentTimeoutRef.current) {
      clearTimeout(contentTimeoutRef.current);
    }
    
    contentTimeoutRef.current = window.setTimeout(() => {
      onChange({
        ...latestButtonRef.current,
        content: value,
      });
    }, 300);
  }, [button, onChange]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (labelTimeoutRef.current) {
        clearTimeout(labelTimeoutRef.current);
      }
      if (contentTimeoutRef.current) {
        clearTimeout(contentTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div 
        className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing select-none touch-none" 
        {...attributes} 
        {...listeners}
        style={{ userSelect: 'none', touchAction: 'none' }}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      <div className="space-y-4 p-4 pl-8 border border-border/50 rounded-lg bg-background/50">
        {!readOnly && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`button-label-${button.id}`} className="text-xs font-medium">
              Label
            </Label>
            <Input
              id={`button-label-${button.id}`}
              value={localLabel}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Enter button label"
              className="text-sm"
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`button-content-${button.id}`} className="text-xs font-medium">
              Content
            </Label>
            <Textarea
              id={`button-content-${button.id}`}
              value={localContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Enter content to copy"
              className="text-sm min-h-[80px]"
              rows={3}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const CopyButtonEditor = memo(CopyButtonEditorComponent);