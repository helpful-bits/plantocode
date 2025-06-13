"use client";

import { forwardRef, ReactNode, useMemo, useState, useCallback, useEffect } from "react";
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
    ...props
  }, ref) => {
    const [editorContainerRef, setEditorContainerRef] = useState<HTMLDivElement | null>(null);
    const { showNotification } = useNotification();
    const resolvedTheme = useResolvedTheme();

    // Calculate content metrics
    const contentMetrics = useMemo(() => {
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
    }, [content, language, enableVirtualization, virtualizationThreshold, warningThreshold]);

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
    const editorConfig = {
      value: content,
      language: contentMetrics.detectedLanguage,
      theme: editorTheme,
      readOnly,
      lineNumbers: showLineNumbers ? "on" : "off",
      wordWrap: wordWrap ? "on" : "off",
      minimap: { enabled: contentMetrics.lines > 100 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 13,
      lineHeight: 1.4,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Consolas', 'Ubuntu Mono', monospace",
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      mouseWheelZoom: true,
      folding: true,
      foldingStrategy: "indentation",
      showFoldingControls: "always",
      ...editorOptions
    };

    // Handle editor mount
    const handleEditorDidMount = (editor: any) => {
      // Configure editor for large content performance
      if (contentMetrics.shouldVirtualize) {
        editor.updateOptions({
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
        });
      }
    };

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

      editorContainerRef.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        editorContainerRef.removeEventListener('wheel', handleWheel);
      };
    }, [handleWheel, editorContainerRef]);

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
            {showContentSize && (
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
          </div>
          
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
            value={content}
            language={contentMetrics.detectedLanguage}
            theme={editorTheme}
            options={editorConfig}
            onMount={handleEditorDidMount}
            onChange={onChange}
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