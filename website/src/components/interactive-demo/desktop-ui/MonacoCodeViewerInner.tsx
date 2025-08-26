'use client';

import { forwardRef, useMemo, useState, useCallback, useEffect } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { Editor } from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { DesktopButton } from "./DesktopButton";

export interface MonacoCodeViewerProps {
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
  /** Whether the editor should be read-only */
  readOnly?: boolean;
  /** Custom placeholder text */
  placeholder?: string;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Whether to enable word wrap */
  wordWrap?: boolean;
  /** Additional editor options */
  editorOptions?: any;
  /** Callback when content changes (if not readOnly) */
  onChange?: (value: string | undefined) => void;
  /** Whether to show content size info */
  showContentSize?: boolean;
  /** Title for the code block */
  title?: string;
}

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
  if (content.includes("<implementation_plan>") || content.includes("<step")) return "xml";
  
  // Default to plaintext for prompts and general content
  return "plaintext";
};

const MonacoCodeViewerInner = forwardRef<HTMLDivElement, MonacoCodeViewerProps>(
  ({
    content,
    language,
    className,
    height = "400px",
    showCopy = true,
    copyText = "Copy",
    isLoading = false,
    readOnly = true,
    placeholder = "No content to display",
    showLineNumbers = true,
    wordWrap = true,
    editorOptions = {},
    onChange,
    showContentSize = true,
    title,
    ...props
  }, ref) => {
    const [isCopied, setIsCopied] = useState(false);
    // Initialize dark mode to false to prevent hydration mismatch
    // Will be properly set after mount via useEffect
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Detect dark mode from website's actual theme state after mount
    useEffect(() => {
      const detectCurrentTheme = () => {
        // Check if the document/html has dark class (most common Next.js pattern)
        const htmlElement = document.documentElement;
        const bodyElement = document.body;
        
        // Check for common dark mode class patterns
        const isDarkClass = htmlElement.classList.contains('dark') || 
                           bodyElement.classList.contains('dark') ||
                           htmlElement.getAttribute('data-theme') === 'dark' ||
                           bodyElement.getAttribute('data-theme') === 'dark';
        
        // Fallback to computed styles if no class found
        if (!isDarkClass) {
          const computedStyle = window.getComputedStyle(htmlElement);
          const bgColor = computedStyle.getPropertyValue('--color-background') || 
                         computedStyle.backgroundColor;
          
          // If background is dark, assume dark mode
          const isDarkBackground = bgColor.includes('rgb(') && 
            bgColor.replace(/[^\d,]/g, '').split(',').reduce((sum, val) => sum + parseInt(val) || 0, 0) < 300;
          
          return isDarkBackground;
        }
        
        return isDarkClass;
      };

      setIsDarkMode(detectCurrentTheme());

      // Watch for theme changes using MutationObserver
      const observer = new MutationObserver(() => {
        setIsDarkMode(detectCurrentTheme());
      });

      // Observe changes to class and data attributes on html and body
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme']
      });
      
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme']  
      });

      // Also listen for system preference changes as fallback
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const mediaHandler = () => setIsDarkMode(detectCurrentTheme());
      mediaQuery.addEventListener('change', mediaHandler);

      return () => {
        observer.disconnect();
        mediaQuery.removeEventListener('change', mediaHandler);
      };
    }, []);

    // Calculate content metrics
    const contentMetrics = useMemo(() => {
      const size = new Blob([content]).size;
      const lines = content.split('\n').length;
      const detectedLanguage = language || detectLanguage(content);
      
      return {
        size,
        lines,
        detectedLanguage
      };
    }, [content, language]);

    // Editor theme - with logging for debugging
    const editorTheme = isDarkMode ? "vs-dark" : "vs";
    
    // Debug logging (can be removed later)
    useEffect(() => {
      // Theme debugging - removed for production
    }, [isDarkMode, editorTheme]);

    // Handle copy functionality
    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy text:", err);
      }
    }, [content]);

    // Editor configuration
    const editorConfig = useMemo(() => {
      return {
        language: contentMetrics.detectedLanguage,
        theme: editorTheme,
        readOnly,
        lineNumbers: showLineNumbers ? "on" : "off",
        wordWrap: wordWrap ? "on" : "off",
        minimap: { enabled: contentMetrics.lines > 50 },
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
        occurrencesHighlight: true,
        selectionHighlight: true,
        links: true,
        contextmenu: true,
        ...editorOptions
      };
    }, [contentMetrics.detectedLanguage, contentMetrics.lines, editorTheme, readOnly, showLineNumbers, wordWrap, editorOptions]);


    if (isLoading) {
      return (
        <div 
          ref={ref} 
          className={cn("relative border border-border/20 rounded-lg bg-card", className)}
          style={{ height }}
          {...props}
        >
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Loading editor...</span>
            </div>
          </div>
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
        ref={ref}
        className={cn("relative border border-border/20 rounded-lg bg-card overflow-hidden", className)}
        style={{ height }}
        {...props}
      >
        {/* Header with content info and copy button */}
        <div className="flex items-center justify-between p-2 border-b border-border/20 bg-muted/20">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {title && (
              <>
                <span className="font-medium">{title}</span>
                <span>•</span>
              </>
            )}
            <span>{contentMetrics.detectedLanguage}</span>
            {showContentSize && (
              <>
                <span>•</span>
                <span>{Math.round(contentMetrics.size / 1024)}KB</span>
                <span>•</span>
                <span>{contentMetrics.lines} lines</span>
              </>
            )}
          </div>
          
          {showCopy && (
            <DesktopButton
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="h-6 px-2 text-xs"
            >
              {isCopied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  {copyText}
                </>
              )}
            </DesktopButton>
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
            {...(!readOnly && onChange ? { onChange } : {})}
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

MonacoCodeViewerInner.displayName = "MonacoCodeViewerInner";

export { MonacoCodeViewerInner };