/* Desktop Parity Mapping:
 * Sources: settings/system-prompt-editor.tsx; ui/tabs.tsx; ui/virtualized-code-viewer.tsx
 * Classes: TabsList (grid w-64 grid-cols-2 or inline-flex), TabsTrigger active state, viewer header "SYSTEM PROMPT", counter, bg-muted/30, border-border, rounded-lg
 */
// Step 15: System Prompt Mock - Ultra-simplified, always renders
'use client';

import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { useTypewriter } from '../hooks';

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

export function SystemPromptMock({ isInView }: { isInView: boolean; resetKey?: number }) {
  // Use typewriter with 3.5s duration and loop as specified
  const { displayText: streamedText } = useTypewriter({
    active: isInView,
    text: systemPromptText,
    durationMs: 3500,
    loop: true
  });

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground">Default system prompt</p>
        </div>
        <div className="flex items-center border border-[oklch(0.90_0.04_195_/_0.3)] rounded-lg overflow-hidden">
          <DesktopButton
            variant="filter-active"
            size="xs"
            className="px-3 h-7 text-xs rounded-none border-0"
          >
            Default
          </DesktopButton>
          <div className="w-[1px] h-5 bg-border/40" />
          <DesktopButton
            variant="filter"
            size="xs"
            className="px-3 h-7 text-xs rounded-none border-0"
          >
            Custom
          </DesktopButton>
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
            
            <div className="relative border border-[oklch(0.90_0.04_195_/_0.3)] rounded-lg bg-muted/30 overflow-hidden">
              <pre className="font-mono text-sm p-4 whitespace-pre-wrap max-h-80 overflow-auto">
                {streamedText || ' '}
                {isInView && streamedText.length < systemPromptText.length && streamedText.length > 0 && (
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
export default SystemPromptMock;

