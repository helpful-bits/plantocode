// Presentational-only code viewer component replicating desktop app styling for mobile demo
'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DesktopButton } from './DesktopButton';

export interface DesktopCodeViewerProps {
  content: string;
  title?: string;
  languageLabel?: string;
  isStreaming?: boolean;
  showCopy?: boolean;
  copyText?: string;
  className?: string;
  height?: string;
}

export function DesktopCodeViewer({
  content,
  title,
  languageLabel = 'plaintext',
  isStreaming = false,
  showCopy = true,
  copyText = 'Copy',
  className,
  height = 'auto'
}: DesktopCodeViewerProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div 
      className={cn(
        "relative border border-border/20 rounded-lg bg-card overflow-hidden",
        className
      )}
      style={{ height }}
    >
      {/* Header with title, language label, and copy button */}
      <div className="flex items-center justify-between p-2 border-b border-border/20 bg-muted/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {title && (
            <>
              <span className="font-medium">{title}</span>
              <span>•</span>
            </>
          )}
          <span>{languageLabel}</span>
          {content && (
            <>
              <span>•</span>
              <span>{content.length} chars</span>
            </>
          )}
          {isStreaming && (
            <>
              <span>•</span>
              <span className="text-blue-500">Streaming</span>
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

      {/* Content Area */}
      <div className="relative">
        <pre className={cn(
          "bg-muted/50 p-4 text-sm overflow-auto font-mono text-foreground whitespace-pre-wrap",
          height === 'auto' ? "max-h-80" : "",
          isStreaming ? "min-h-[100px]" : ""
        )}>
          {content || ' '}
          {isStreaming && content && (
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
          )}
        </pre>
      </div>
    </div>
  );
}