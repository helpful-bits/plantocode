"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { StickyNote, GripVertical } from "lucide-react";

interface FloatingMergeInstructionsProps {
  mergeInstructions: string;
  onMergeInstructionsChange: (value: string) => void;
  isOpen: boolean;
}

const FloatingMergeInstructionsComponent: React.FC<FloatingMergeInstructionsProps> = ({
  mergeInstructions,
  onMergeInstructionsChange,
  isOpen,
}) => {
  // Local state for immediate UI responsiveness
  const [localValue, setLocalValue] = useState(mergeInstructions);
  const isFocusedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State for natural drag positioning
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // State for resizing
  const [height, setHeight] = useState(128); // Default height in pixels (h-32 = 128px)
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ y: 0, height: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isFocusedRef.current) return;
    setLocalValue(mergeInstructions);
  }, [mergeInstructions]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleLocalFlush = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onMergeInstructionsChange(localValue);
    };

    textarea.addEventListener('flush-pending-changes', handleLocalFlush as any);
    textarea.addEventListener('enhancement-applied', handleLocalFlush as any);

    const handleGlobalFlush = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onMergeInstructionsChange(localValue);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("flush-merge-instructions-editors", handleGlobalFlush);
    }

    return () => {
      textarea.removeEventListener('flush-pending-changes', handleLocalFlush as any);
      textarea.removeEventListener('enhancement-applied', handleLocalFlush as any);
      if (typeof window !== "undefined") {
        window.removeEventListener("flush-merge-instructions-editors", handleGlobalFlush);
      }
    };
  }, [localValue, onMergeInstructionsChange]);

  // Get current window dimensions dynamically
  const getWindowDimensions = useCallback(() => {
    if (typeof window === 'undefined') return { width: 1200, height: 800 };
    return { width: window.innerWidth, height: window.innerHeight };
  }, []);

  // Constrain position to viewport bounds
  const constrainPosition = useCallback((x: number, y: number) => {
    const windowDims = getWindowDimensions();
    const windowWidth = 320; // w-80 = 320px
    const windowHeight = 220; // Approximate height for textarea + header + padding
    
    // Add padding from edges
    const padding = 20;
    
    return {
      x: Math.max(padding, Math.min(x, windowDims.width - windowWidth - padding)),
      y: Math.max(padding, Math.min(y, windowDims.height - windowHeight - padding))
    };
  }, [getWindowDimensions]);

  const handleInstructionsChange = useCallback((value: string) => {
    setLocalValue(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onMergeInstructionsChange(value);
    }, 300);
  }, [onMergeInstructionsChange]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
    if (typeof window !== "undefined") {
      (window as any).__mergeInstructionsEditorFocused = true;
    }
  }, []);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    if (typeof window !== "undefined") {
      (window as any).__mergeInstructionsEditorFocused = false;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    onMergeInstructionsChange(localValue);
  }, [localValue, onMergeInstructionsChange]);

  // Drag event handlers with proper offset calculation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging if clicking specifically on the header area, not textarea or resize handle
    if (e.target instanceof HTMLElement && 
        e.target.closest('.merge-instructions-header') &&
        !e.target.closest('textarea') &&
        !e.target.closest('.resize-handle')) {
      
      // Calculate offset from cursor to window's CSS position (not DOM position)
      const offsetX = e.clientX - position.x;
      const offsetY = e.clientY - position.y;
      setDragOffset({ x: offsetX, y: offsetY });
      
      setIsDragging(true);
      e.preventDefault();
    }
  }, [position]);

  // Resize event handlers
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    setResizeStart({ y: e.clientY, height: height });
    e.preventDefault();
    e.stopPropagation();
  }, [height]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      // Calculate new position using offset, then constrain to viewport
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      const constrainedPosition = constrainPosition(newX, newY);
      
      setPosition(constrainedPosition);
    } else if (isResizing) {
      // Calculate new height based on mouse movement
      const deltaY = e.clientY - resizeStart.y;
      const newHeight = Math.max(80, Math.min(500, resizeStart.height + deltaY)); // Min 80px, max 500px
      setHeight(newHeight);
    }
  }, [isDragging, isResizing, dragOffset, constrainPosition, resizeStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners for dragging and resizing
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (isOpen) {
      const windowDims = getWindowDimensions();
      const maxRightDistance = Math.min(windowDims.width - 450, 800);
      const smartPosition = constrainPosition(maxRightDistance, 20);
      setPosition(smartPosition);
      setHeight(128);
    } else {
      isFocusedRef.current = false;
      if (typeof window !== "undefined") {
        (window as any).__mergeInstructionsEditorFocused = false;
      }
    }
  }, [isOpen, getWindowDimensions, constrainPosition]);

  useEffect(() => {
    return () => {
      if (isFocusedRef.current && typeof window !== "undefined") {
        (window as any).__mergeInstructionsEditorFocused = false;
      }
    };
  }, []);

  // Handle window resize to keep floating window in bounds
  useEffect(() => {
    const handleResize = () => {
      if (isOpen) {
        setPosition(current => constrainPosition(current.x, current.y));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, constrainPosition]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-[300] w-80 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-4 pointer-events-auto transition-shadow duration-200 ${
        isDragging ? 'shadow-2xl' : 'shadow-lg'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="merge-instructions-header flex items-center gap-2 mb-2 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <StickyNote className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium text-foreground flex-1">Merge Instructions</h3>
        <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors pointer-events-none" />
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={(e) => handleInstructionsChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Add notes about what you like or don't like in this plan..."
          className="w-full resize-none border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          style={{ height: `${height}px` }}
        />
        {/* Resize handle */}
        <div
          className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-nw-resize bg-muted/50 hover:bg-muted transition-colors rounded-tl-md flex items-center justify-center"
          onMouseDown={handleResizeMouseDown}
          title="Drag to resize"
        >
          <div className="w-2 h-2 border-r border-b border-muted-foreground/50 rotate-45 -translate-x-0.5 -translate-y-0.5"></div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Use this to take notes while reviewing implementation plans for merging.
      </p>
    </div>
  );
};

export const FloatingMergeInstructions = memo(FloatingMergeInstructionsComponent);