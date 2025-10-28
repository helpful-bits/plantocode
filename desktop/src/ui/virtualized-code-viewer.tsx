"use client";

import { forwardRef, ReactNode, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ClipboardCopy, Loader2 } from "lucide-react";
import { Editor } from "@monaco-editor/react";

import { cn } from "@/utils/utils";
import { Button } from "@/ui/button";
import { useNotification } from "@/contexts/notification-context";
import { useTheme } from "@/app/components/theme-provider";

export interface VirtualizedCodeViewerProps {
  /** Content to display */
  content: string;
  /** Language for syntax highlighting (auto-detect if not provided) */
  language?: string;
  /** Custom className */
  className?: string;
  /** Height of the viewer (default: "400px") */
  height?: string;
  /** Whether to show copy button */
  showCopy?: boolean;
  /** Copy button text */
  copyText?: string;
  /** Whether content is loading */
  isLoading?: boolean;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
  /** Whether to show content size info */
  showContentSize?: boolean;
  /** Whether to enable virtualization (auto-enabled for large content) */
  enableVirtualization?: boolean;
  /** Threshold for enabling virtualization (in characters) */
  virtualizationThreshold?: number;
  /** Whether the editor should be read-only */
  readOnly?: boolean;
  /** Custom placeholder text */
  placeholder?: string;
  /** Theme preference (will use system theme if not provided) */
  theme?: "light" | "dark" | "vs" | "vs-dark";
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Whether to enable word wrap */
  wordWrap?: boolean;
  /** Additional editor options */
  editorOptions?: any;
  /** Callback when content changes (if not readOnly) */
  onChange?: (value: string | undefined) => void;
  /** Custom content size warning threshold */
  warningThreshold?: number;
  /** Whether to enable text improvement integration */
  enableTextImprovement?: boolean;
  /** Enable stream-optimized mode for better performance during streaming */
  streamOptimized?: boolean;
  /** Disable metrics calculations for better performance */
  disableMetrics?: boolean;
  /** Whether to follow streaming content by default */
  followStreamingDefault?: boolean;
  /** Callback when follow streaming state changes */
  onFollowStreamingChange?: (isFollowing: boolean) => void;
  /** Whether to show the auto-follow toggle */
  showFollowToggle?: boolean;
}

// Hook to resolve the current theme, handling "system" preference
const useResolvedTheme = () => {
  const { theme } = useTheme();
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return theme === "system" ? systemTheme : theme;
};

// Auto-detect language from content
const detectLanguage = (content: string): string => {
  // Simple heuristics for common languages
  if (content.includes("```javascript") || content.includes("```js")) return "javascript";
  if (content.includes("```typescript") || content.includes("```ts")) return "typescript";
  if (content.includes("```python") || content.includes("```py")) return "python";
  if (content.includes("```rust") || content.includes("```rs")) return "rust";
  if (content.includes("```json")) return "json";
  if (content.includes("```xml") || content.includes("```html")) return "xml";
  if (content.includes("```css")) return "css";
  if (content.includes("```sql")) return "sql";
  if (content.includes("```markdown") || content.includes("```md")) return "markdown";
  if (content.includes("```yaml") || content.includes("```yml")) return "yaml";
  
  // Check for specific patterns
  if (content.includes("function ") || content.includes("const ") || content.includes("let ")) return "javascript";
  if (content.includes("interface ") || content.includes("type ") || content.includes(": string")) return "typescript";
  if (content.includes("def ") || content.includes("import ") || content.includes("from ")) return "python";
  if (content.includes("fn ") || content.includes("struct ") || content.includes("impl ")) return "rust";
  if (content.includes("{") && content.includes("}") && content.includes(":")) return "json";
  
  // Default to plaintext for prompts and general content
  return "plaintext";
};

// Global registry for Monaco editor instances to support text improvement
if (typeof window !== 'undefined') {
  (window as any).monacoEditorRegistry = (window as any).monacoEditorRegistry || new Map();
}

const VirtualizedCodeViewer = forwardRef<HTMLDivElement, VirtualizedCodeViewerProps>(
  ({
    content,
    language,
    className,
    height = "400px",
    showCopy = true,
    copyText = "Copy",
    isLoading = false,
    loadingIndicator,
    showContentSize = true,
    enableVirtualization,
    virtualizationThreshold = 50000, // 50KB
    readOnly = true,
    placeholder = "No content to display",
    theme,
    showLineNumbers = true,
    wordWrap = true,
    editorOptions = {},
    onChange,
    warningThreshold = 100000, // 100KB
    enableTextImprovement = false,
    streamOptimized = false,
    disableMetrics = false,
    followStreamingDefault = true,
    onFollowStreamingChange,
    showFollowToggle = false,
    ...props
  }, ref) => {
    const [editorContainerRef, setEditorContainerRef] = useState<HTMLDivElement | null>(null);
    const { showNotification } = useNotification();
    const resolvedTheme = useResolvedTheme();
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any | null>(null);
    const lastContentLengthRef = useRef<number>(0);
    const updateRafRef = useRef<number | null>(null);
    const [isFollowingStream, setIsFollowingStream] = useState(followStreamingDefault);
    const userManualOverrideRef = useRef<false | 'off'>(false);
    const nearBottomRef = useRef(false);
    const scrollRafRef = useRef<number | null>(null);
    const selectionDisposableRef = useRef<{ dispose: () => void } | null>(null);
    const registryIdRef = useRef<string | null>(null);

    // Calculate content metrics
    const contentMetrics = useMemo(() => {
      if (disableMetrics) {
        return {
          size: 0,
          lines: 0,
          shouldVirtualize: false,
          isLarge: false,
          detectedLanguage: language || detectLanguage(content)
        };
      }
      const size = new Blob([content]).size;
      const lines = content.split('\n').length;
      const shouldVirtualize = enableVirtualization ?? (size > virtualizationThreshold);
      const isLarge = size > warningThreshold;
      
      return {
        size,
        lines,
        shouldVirtualize,
        isLarge,
        detectedLanguage: language || detectLanguage(content)
      };
    }, [content, language, enableVirtualization, virtualizationThreshold, warningThreshold, disableMetrics]);

    // Determine theme using app's theme system
    const editorTheme = useMemo(() => {
      if (theme) return theme === "dark" ? "vs-dark" : "vs";
      return resolvedTheme === "dark" ? "vs-dark" : "vs";
    }, [theme, resolvedTheme]);

    // Handle copy functionality
    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(content);
        showNotification({
          title: "Copied to clipboard",
          message: `${copyText} copied successfully`,
          type: "success",
          duration: 2000,
        });
      } catch (err) {
        console.error("Failed to copy text:", err);
        showNotification({
          title: "Copy failed",
          message: "Failed to copy content to clipboard",
          type: "error",
          duration: 3000,
        });
      }
    }, [content, copyText, showNotification]);
    
    // Handle auto-follow toggle
    const handleFollowToggleClick = useCallback(() => {
      if (isFollowingStream) {
        // Turn OFF - user explicitly overrides
        setIsFollowingStream(false);
        userManualOverrideRef.current = 'off';
        onFollowStreamingChange?.(false);
      } else {
        // Turn ON - clear override and scroll to bottom
        userManualOverrideRef.current = false;
        setIsFollowingStream(true);
        onFollowStreamingChange?.(true);
        // Scroll to bottom when turning on
        if (editorRef.current) {
          const model = editorRef.current.getModel();
          if (model) {
            const lineCount = model.getLineCount();
            editorRef.current.revealLine(lineCount);
          }
        }
      }
    }, [isFollowingStream, onFollowStreamingChange]);

    // Default loading indicator
    const defaultLoadingIndicator = (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading content...</span>
        </div>
      </div>
    );

    // Editor configuration
    const editorConfig = useMemo(() => {
      // Determine if we need performance-optimized settings (size-only, not streaming state)
      const needsPerformanceMode = contentMetrics.shouldVirtualize || contentMetrics.isLarge;
      
      const baseConfig = {
        language: contentMetrics.detectedLanguage,
        theme: editorTheme,
        readOnly,
        lineNumbers: showLineNumbers ? "on" : "off",
        wordWrap: needsPerformanceMode ? "off" : (wordWrap ? "on" : "off"),
        minimap: { enabled: !needsPerformanceMode && contentMetrics.lines > 100 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
        lineHeight: 1.4,
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Consolas', 'Ubuntu Mono', monospace",
        padding: { top: 12, bottom: 12 },
        smoothScrolling: !needsPerformanceMode,
        mouseWheelZoom: true,
        folding: !needsPerformanceMode,
        foldingStrategy: "indentation",
        showFoldingControls: needsPerformanceMode ? "never" : "always",
        occurrencesHighlight: !needsPerformanceMode,
        selectionHighlight: !needsPerformanceMode,
        links: !needsPerformanceMode,
        contextmenu: true
      };

      if (needsPerformanceMode) {
        // Force strict performance options when streaming or handling large content
        const performanceConfig = {
          ...baseConfig,
          minimap: { enabled: false },
          wordWrap: "off",
          renderLineHighlight: "none",
          occurrencesHighlight: false,
          selectionHighlight: false,
          codeLens: false,
          links: false,
          folding: false,
          smoothScrolling: false,
          renderWhitespace: "none",
          renderLineHighlightOnlyWhenFocus: true,
          colorDecorators: false,
          contextmenu: false,
          renderValidationDecorations: "off"
        };
        
        // Merge user options but don't allow overriding critical performance settings
        const mergedConfig = { ...editorOptions, ...performanceConfig };
        return mergedConfig;
      }

      return {
        ...baseConfig,
        ...editorOptions
      };
    }, [contentMetrics.detectedLanguage, contentMetrics.lines, contentMetrics.shouldVirtualize, contentMetrics.isLarge, editorTheme, readOnly, showLineNumbers, wordWrap, editorOptions]);

    // Handle editor mount
    const handleEditorDidMount = (editor: any, monacoInstance: any) => {
      editorRef.current = editor;
      monacoRef.current = monacoInstance;
      
      // Initialize lastContentLengthRef from the model on mount
      const model = editor.getModel();
      lastContentLengthRef.current = model?.getValueLength() ?? content.length;
      
      // Register scroll change listener for auto-follow behavior
      const scrollDisposable = editor.onDidScrollChange(() => {
        if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
          const layout = editor.getLayoutInfo();
          const maxScrollTop = editor.getScrollHeight() - layout.height;
          const distanceFromBottom = Math.max(0, maxScrollTop - editor.getScrollTop());
          const isNear = distanceFromBottom <= 100; // threshold 100px
          
          if (nearBottomRef.current !== isNear) {
            nearBottomRef.current = isNear;
          }
          
          // Auto-adjust follow when user hasn't explicitly overridden
          if (userManualOverrideRef.current !== 'off') {
            if (isNear && !isFollowingStream) {
              setIsFollowingStream(true);
              onFollowStreamingChange?.(true);
            } else if (!isNear && isFollowingStream) {
              setIsFollowingStream(false);
              onFollowStreamingChange?.(false);
            }
          }
        });
      });
      
      // Store the disposable for cleanup
      (editor as any)._scrollDisposable = scrollDisposable;
      
      // Double-ensure performance options are applied for large content only
      const needsPerformanceMode = contentMetrics.shouldVirtualize || contentMetrics.isLarge;
      
      if (needsPerformanceMode) {
        // Force apply performance options again to ensure they're not overridden
        const strictPerformanceOptions = {
          scrollBeyondLastLine: false,
          renderValidationDecorations: "off",
          renderLineHighlight: "none",
          occurrencesHighlight: false,
          selectionHighlight: false,
          codeLens: false,
          colorDecorators: false,
          contextmenu: false,
          links: false,
          folding: false,
          minimap: { enabled: false },
          wordWrap: "off",
          smoothScrolling: false,
          renderWhitespace: "none",
          renderLineHighlightOnlyWhenFocus: true,
          renderIndentGuides: false,
          renderLineNumbers: showLineNumbers ? "on" : "off",
          lineNumbersMinChars: 3,
          glyphMargin: false,
          overviewRulerLanes: 0,
          scrollbar: {
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
          }
        };
        editor.updateOptions(strictPerformanceOptions);
      }

      // Register editor for text improvement if enabled AND editor is editable
      if (enableTextImprovement && !readOnly && typeof window !== 'undefined') {
        const registry = (window as any).monacoEditorRegistry;
        const editorId = `monaco-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        registry.set(editorId, editor);
        registryIdRef.current = editorId;

        // Set up selection change listener for text improvement
        selectionDisposableRef.current = editor.onDidChangeCursorSelection(() => {
          const selection = editor.getSelection();
          if (selection && !selection.isEmpty()) {
            // Double-check editor is still editable before showing popover
            const isReadOnly = editor.getOptions().get('readOnly');
            if (!isReadOnly) {
              // Trigger custom event for text improvement detection
              setTimeout(() => {
                const event = new CustomEvent('monaco-selection-change', {
                  detail: { editor, selection, editorId }
                });
                document.dispatchEvent(event);
              }, 50);
            }
          }
        });
      }
    };
    
    // Clean up on unmount
    useEffect(() => {
      return () => {
        // Clean up scroll listener on unmount
        if (editorRef.current && (editorRef.current as any)._scrollDisposable) {
          (editorRef.current as any)._scrollDisposable.dispose();
          delete (editorRef.current as any)._scrollDisposable;
        }
        if (scrollRafRef.current) {
          cancelAnimationFrame(scrollRafRef.current);
          scrollRafRef.current = null;
        }
        // Clean up selection listener
        if (selectionDisposableRef.current) {
          selectionDisposableRef.current.dispose();
          selectionDisposableRef.current = null;
        }
        // Clean up registry entry
        if (registryIdRef.current && typeof window !== 'undefined') {
          const registry = (window as any).monacoEditorRegistry;
          if (registry) {
            registry.delete(registryIdRef.current);
            registryIdRef.current = null;
          }
        }
      };
    }, []);

    // Handle wheel events to prevent scroll propagation conflicts
    const handleWheel = useCallback((e: WheelEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (!target) return;

      // Check if we're scrolling within the editor bounds
      const editorContainer = target.querySelector('.monaco-editor');
      if (!editorContainer) return;

      const rect = editorContainer.getBoundingClientRect();
      const isWithinEditor = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );

      if (isWithinEditor) {
        // Get the editor's scroll container
        const scrollContainer = editorContainer.querySelector('.monaco-scrollable-element');
        if (scrollContainer) {
          const scrollTop = scrollContainer.scrollTop;
          const scrollHeight = scrollContainer.scrollHeight;
          const clientHeight = scrollContainer.clientHeight;
          
          // Determine if we're at scroll boundaries
          const isAtTop = scrollTop <= 0;
          const isAtBottom = scrollTop + clientHeight >= scrollHeight;
          
          // Prevent propagation if we're not at scroll boundaries or if scrolling within bounds
          if ((!isAtTop && e.deltaY < 0) || (!isAtBottom && e.deltaY > 0)) {
            e.stopPropagation();
          }
        }
      }
    }, []);

    // Add wheel event listener to prevent scroll conflicts
    useEffect(() => {
      if (!editorContainerRef) return;

      editorContainerRef.addEventListener('wheel', handleWheel, { passive: true });
      return () => {
        editorContainerRef.removeEventListener('wheel', handleWheel);
      };
    }, [handleWheel, editorContainerRef]);

    // Handle incremental updates when in stream-optimized mode
    useEffect(() => {
      if (!streamOptimized) return;

      // Guard against missing editor or model
      if (!editorRef.current) return;
      const model = editorRef.current.getModel();
      if (!model) return;

      // Cancel any pending updates
      if (updateRafRef.current !== null) {
        cancelAnimationFrame(updateRafRef.current);
      }

      // Schedule update via requestAnimationFrame
      updateRafRef.current = requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const model = editor.getModel();
        if (!model) return;

        const modelText = model.getValue();
        const modelLen = modelText.length;
        const newLen = content.length;

        // No change
        if (newLen === modelLen) {
          lastContentLengthRef.current = newLen;
          updateRafRef.current = null;
          return;
        }

        // Check if new content is a valid prefix extension
        const isPrefix = content.startsWith(modelText);
        const bigDelta = (newLen - modelLen) > 10000;

        if (newLen > modelLen && isPrefix && !bigDelta) {
          // Incremental append: extract suffix and apply edit
          const suffix = content.slice(modelLen);
          model.pushEditOperations(
            [],
            [{ range: model.getFullModelRange(), text: modelText + suffix }],
            () => null
          );
        } else {
          // Divergence or large jump: atomic reset
          model.setValue(content);
        }

        lastContentLengthRef.current = newLen;

        // Only auto-reveal last line if following
        if (isFollowingStream) {
          const finalLineCount = model.getLineCount();
          editor.revealLine(finalLineCount);
        }

        updateRafRef.current = null;
      });

      return () => {
        if (updateRafRef.current !== null) {
          cancelAnimationFrame(updateRafRef.current);
          updateRafRef.current = null;
        }
      };
    }, [content, streamOptimized, isFollowingStream]);

    // Reset lastContentLengthRef when switching out of stream mode
    useEffect(() => {
      if (!streamOptimized) {
        lastContentLengthRef.current = content.length;
      }
    }, [streamOptimized, content.length]);

    if (isLoading) {
      return (
        <div 
          ref={ref} 
          className={cn("relative border border-border/20 rounded-lg bg-card", className)}
          style={{ height }}
          {...props}
        >
          {loadingIndicator || defaultLoadingIndicator}
        </div>
      );
    }

    if (!content && readOnly) {
      return (
        <div 
          ref={ref} 
          className={cn("relative border border-border/20 rounded-lg bg-card p-4", className)}
          style={{ height }}
          {...props}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {placeholder}
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={(element) => {
          setEditorContainerRef(element);
          if (typeof ref === 'function') {
            ref(element);
          } else if (ref) {
            ref.current = element;
          }
        }}
        className={cn("relative border border-border/20 rounded-lg bg-card overflow-hidden", className)}
        style={{ height }}
        {...props}
      >
        {/* Header with content info and copy button */}
        <div className="flex items-center justify-between p-2 border-b border-border/20 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {showContentSize && !disableMetrics && (
              <>
                <span>{Math.round(contentMetrics.size / 1024)}KB</span>
                <span>•</span>
                <span>{contentMetrics.lines} lines</span>
                <span>•</span>
                <span>{contentMetrics.detectedLanguage}</span>
              </>
            )}
            {contentMetrics.shouldVirtualize && (
              <>
                <span>•</span>
                <span className="text-primary">Virtualized</span>
              </>
            )}
            {streamOptimized && (
              <>
                <span>•</span>
                <span className="text-blue-500">Streaming</span>
              </>
            )}
          </div>
          
          {showFollowToggle && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleFollowToggleClick}
              className={cn(
                "h-6 px-2 text-xs mr-2",
                isFollowingStream && "bg-primary/10 hover:bg-primary/20"
              )}
              title="Automatically scroll to the newest content"
            >
              {isFollowingStream ? "Auto-follow: ON" : "Auto-follow: OFF"}
            </Button>
          )}
          {showCopy && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="h-6 px-2 text-xs"
            >
              <ClipboardCopy className="h-3 w-3 mr-1" />
              {copyText}
            </Button>
          )}
        </div>


        {/* Monaco Editor */}
        <div 
          className="flex-1" 
          style={{ 
            height: `calc(100% - 40px)`,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <Editor
            {...(streamOptimized ? { defaultValue: content } : { value: content })}
            language={contentMetrics.detectedLanguage}
            theme={editorTheme}
            options={editorConfig}
            onMount={handleEditorDidMount}
            onChange={readOnly ? undefined : onChange}
            loading={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading editor...</span>
              </div>
            }
          />
        </div>
      </div>
    );
  }
);

VirtualizedCodeViewer.displayName = "VirtualizedCodeViewer";

export { VirtualizedCodeViewer };