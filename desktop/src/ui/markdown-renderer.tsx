"use client";

import { forwardRef, useMemo, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClipboardCopy } from "lucide-react";

import { cn } from "@/utils/utils";
import { Button } from "@/ui/button";
import { useNotification } from "@/contexts/notification-context";
import { ScrollArea } from "@/ui/scroll-area";
import { useTheme } from "@/app/components/theme-provider";

// Map common language aliases to Monaco language IDs
const languageMap: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  json5: "json",
  dockerfile: "dockerfile",
};

// Hook to resolve the current theme, handling "system" preference
const useResolvedTheme = () => {
  const { theme } = useTheme();
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    const handler = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return theme === "system" ? systemTheme : theme;
};

// Code block component with Monaco colorization (no editor instance)
interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock = ({ language, code }: CodeBlockProps) => {
  const resolvedTheme = useResolvedTheme();
  const [colorizedHtml, setColorizedHtml] = useState<string | null>(null);
  const monacoLanguage = languageMap[language] || language || "plaintext";

  useEffect(() => {
    let cancelled = false;

    // Dynamically import monaco and colorize the code
    import("monaco-editor").then((monaco) => {
      if (cancelled) return;

      monaco.editor
        .colorize(code, monacoLanguage, { tabSize: 2 })
        .then((html) => {
          if (!cancelled) {
            setColorizedHtml(html);
          }
        })
        .catch(() => {
          // Fallback to plain text on error
          if (!cancelled) {
            setColorizedHtml(null);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [code, monacoLanguage]);

  // Determine background color based on theme
  const bgClass = resolvedTheme === "dark" ? "bg-[#1e1e1e]" : "bg-[#ffffff]";

  return (
    <div
      className={cn(
        "relative my-3 rounded-md border border-border/30 overflow-hidden",
        bgClass
      )}
    >
      {/* Language label */}
      {language && (
        <div className="absolute top-0 right-0 px-2 py-1 text-xs text-muted-foreground bg-muted/80 rounded-bl z-10">
          {language}
        </div>
      )}
      <pre
        className="p-3 overflow-x-auto text-sm"
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Consolas', 'Ubuntu Mono', monospace",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {colorizedHtml ? (
          <code
            dangerouslySetInnerHTML={{ __html: colorizedHtml }}
            style={{ background: "transparent" }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
};

export interface MarkdownRendererProps {
  /** Markdown content to render */
  content: string;
  /** Custom className */
  className?: string;
  /** Height of the viewer (default: "400px") */
  height?: string;
  /** Whether to show copy button */
  showCopy?: boolean;
  /** Copy button text */
  copyText?: string;
  /** Whether to show content size info */
  showContentSize?: boolean;
}

const MarkdownRenderer = forwardRef<HTMLDivElement, MarkdownRendererProps>(
  (
    {
      content,
      className,
      height = "400px",
      showCopy = true,
      copyText = "Copy",
      showContentSize = true,
      ...props
    },
    ref
  ) => {
    const { showNotification } = useNotification();

    // Calculate content metrics
    const contentMetrics = useMemo(() => {
      const size = new Blob([content]).size;
      const lines = content.split("\n").length;
      return { size, lines };
    }, [content]);

    // Handle copy functionality
    const handleCopy = async () => {
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
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative border border-border/20 rounded-lg bg-card overflow-hidden",
          className
        )}
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
                <span>markdown</span>
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

        {/* Markdown content */}
        <ScrollArea
          className="h-[calc(100%-40px)]"
          style={{ height: `calc(100% - 40px)` }}
        >
          <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Headings
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-border">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-semibold mt-5 mb-3 pb-1 border-b border-border/50">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-semibold mt-4 mb-2">
                    {children}
                  </h3>
                ),
                h4: ({ children }) => (
                  <h4 className="text-base font-semibold mt-3 mb-2">
                    {children}
                  </h4>
                ),

                // Paragraphs
                p: ({ children }) => (
                  <p className="my-2 leading-relaxed">{children}</p>
                ),

                // Lists
                ul: ({ children }) => (
                  <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-2 ml-4 list-decimal space-y-1">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed">{children}</li>
                ),

                // Code blocks
                code: ({ className, children }) => {
                  // Check if this is a code block (has language class) vs inline code
                  const match = /language-(\w+)/.exec(className || "");
                  const isCodeBlock = !!match;

                  if (!isCodeBlock) {
                    // Inline code
                    return (
                      <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">
                        {children}
                      </code>
                    );
                  }

                  // Code block with syntax highlighting
                  const language = match ? match[1] : "";
                  const codeString = String(children).replace(/\n$/, "");

                  return <CodeBlock language={language} code={codeString} />;
                },
                // Skip pre wrapper since CodeBlock handles its own container
                pre: ({ children }) => <>{children}</>,

                // Blockquotes
                blockquote: ({ children }) => (
                  <blockquote className="my-3 pl-4 border-l-4 border-primary/50 italic text-muted-foreground">
                    {children}
                  </blockquote>
                ),

                // Horizontal rule
                hr: () => <hr className="my-4 border-border" />,

                // Links
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),

                // Tables
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto">
                    <table className="w-full border-collapse border border-border">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-muted/50">{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left font-semibold border border-border">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 border border-border">{children}</td>
                ),

                // Strong and emphasis
                strong: ({ children }) => (
                  <strong className="font-semibold">{children}</strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,

                // Task lists (GFM)
                input: ({ checked, ...props }) => (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled
                    className="mr-2 rounded"
                    {...props}
                  />
                ),
              }}
            >
              {content}
            </Markdown>
          </div>
        </ScrollArea>
      </div>
    );
  }
);

MarkdownRenderer.displayName = "MarkdownRenderer";

export { MarkdownRenderer };
