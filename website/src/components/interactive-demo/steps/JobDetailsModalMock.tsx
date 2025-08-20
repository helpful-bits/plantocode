/* Desktop Parity Mapping:
 * Sources: desktop/src/app/components/background-jobs-sidebar/job-details-modal.tsx, _components/job-details
 * Classes: bg-card, border-border/60, shadow-soft-md, desktop-glass-card; prompt blocks "border rounded-lg p-4 bg-muted/20 font-mono text-sm"
 * Structure: Dialog → Header → Body (prompt list) → Footer
 */
// Job Details Modal Mock - presents research prompts in a modal format
'use client';

import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { 
  DesktopDialog, 
  DesktopDialogContent, 
  DesktopDialogHeader, 
  DesktopDialogTitle, 
  DesktopDialogDescription,
  DesktopDialogFooter 
} from '../desktop-ui/DesktopDialog';
import { DesktopButton } from '../desktop-ui/DesktopButton';

interface JobDetailsModalMockProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: string[];
  jobTitle?: string;
}

function CopyButton({ content }: { content: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <DesktopButton
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs shrink-0 mt-1"
      onClick={handleCopy}
    >
      {isCopied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          Copy
        </>
      )}
    </DesktopButton>
  );
}

export function JobDetailsModalMock({ 
  open, 
  onOpenChange, 
  prompts, 
  jobTitle: _jobTitle 
}: JobDetailsModalMockProps) {
  if (!open) return null;

  return (
    <DesktopDialog open={open}>
      <DesktopDialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-card border-border/60 shadow-soft-md desktop-glass-card">
        <DesktopDialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DesktopDialogTitle>
                Deep Research Prompts
              </DesktopDialogTitle>
              <DesktopDialogDescription>
                Generated research prompts for comprehensive analysis
              </DesktopDialogDescription>
            </div>
            <DesktopButton
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </DesktopButton>
          </div>
        </DesktopDialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-4">
            {prompts.map((prompt, index) => (
              <div 
                key={index}
                className="flex items-start justify-between gap-4"
              >
                <pre className="border border-border rounded-lg p-4 bg-muted/20 font-mono text-sm flex-1 whitespace-pre-wrap overflow-x-auto">
                  {prompt}
                </pre>
                <CopyButton content={prompt} />
              </div>
            ))}
          </div>
        </div>
        
        <DesktopDialogFooter>
          <DesktopButton 
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </DesktopButton>
        </DesktopDialogFooter>
      </DesktopDialogContent>
    </DesktopDialog>
  );
}