/* Desktop Parity Mapping:
 * Sources: settings/system-prompt-editor.tsx; ui/tabs.tsx; ui/virtualized-code-viewer.tsx
 * Classes: TabsList (grid w-64 grid-cols-2 or inline-flex), TabsTrigger active state, viewer header "SYSTEM PROMPT", counter, bg-muted/30, border-border, rounded-lg
 */
// Step 15: System Prompt Mock - Ultra-simplified, always renders
'use client';

import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { useAutoFillText } from '../hooks/useScrollOrchestration';

const systemPromptText = `You are Vibe Manager, an AI assistant specialized in helping developers manage their codebase efficiently. Your capabilities include:

1. Code Analysis & Understanding
   - Analyze code structure and patterns
   - Identify potential improvements and optimizations
   - Understand project architecture and dependencies

2. Development Workflow Assistance
   - Help with git operations and merge conflicts
   - Suggest best practices for code organization
   - Assist with debugging and troubleshooting

3. Documentation & Communication
   - Generate clear, concise code documentation
   - Help explain complex technical concepts
   - Assist with code reviews and feedback

Always provide practical, actionable advice that helps developers be more productive and write better code.`;

export function SystemPromptMock({ isInView, progress }: { isInView: boolean; progress: number }) {
  const streamedText = useAutoFillText(systemPromptText, isInView && progress > 0.3);

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground">Default system prompt</p>
        </div>
        <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
          <button className="px-3 h-7 text-xs bg-accent text-accent-foreground">
            Default
          </button>
          <div className="w-[1px] h-5 bg-border/40" />
          <button className="px-3 h-7 text-xs bg-background text-muted-foreground hover:bg-accent/50">
            Custom
          </button>
        </div>
      </div>

      <DesktopCard>
        <DesktopCardContent className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">SYSTEM PROMPT</span>
              <span className="text-xs text-muted-foreground">
                {streamedText.length} chars
              </span>
            </div>
            
            <div className="relative border border-border rounded-lg bg-muted/30 overflow-hidden">
              <pre className="font-mono text-sm p-4 whitespace-pre-wrap max-h-80 overflow-auto">
                {streamedText || ' '}
                {isInView && progress > 0.3 && streamedText.length < systemPromptText.length && (
                  <span className="animate-pulse text-primary">|</span>
                )}
              </pre>
            </div>
            
            <p className="text-xs text-muted-foreground">
              This system prompt defines the AI's behavior and capabilities
            </p>
          </div>
        </DesktopCardContent>
      </DesktopCard>
    </div>
  );
}