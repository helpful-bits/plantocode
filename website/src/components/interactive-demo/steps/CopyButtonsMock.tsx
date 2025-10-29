// Step 14: Copy Buttons Mock - Replicates desktop settings copy button UI
'use client';

import { DesktopButton } from '../desktop-ui/DesktopButton';
import { useTimedLoop } from '../hooks';
import { Trash2 } from 'lucide-react';

// ButtonConfigurationCard component
const ButtonConfigurationCard = ({ config }: {
  config: { label: string; content: string };
}) => (
  <div className="relative">
    <div className="space-y-4 p-4 border rounded-lg border-[oklch(0.90_0.04_195_/_0.3)] bg-background/50">
      <div className="flex justify-end">
        <DesktopButton
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
        >
          <Trash2 className="h-4 w-4" />
        </DesktopButton>
      </div>
      
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-medium">Label</label>
          <div className="h-8 px-3 py-2 border border-input bg-background text-sm rounded-lg flex items-center">
            {config.label}
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-xs font-medium">Content</label>
          <div className="min-h-[80px] p-3 border border-input bg-background text-sm rounded-lg">
            <div className="text-muted-foreground text-xs leading-relaxed">
              {config.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export function CopyButtonsMock({ isInView }: { isInView: boolean }) {
  // Use 8 second loop as specified
  const { t } = useTimedLoop(isInView, 8000, { resetOnDeactivate: true });
  
  // Show basic UI first
  const showAddButton = t >= 0.1;
  
  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Copy Button Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Configurable copy buttons for implementation plans
        </p>
      </div>

      <div className="space-y-3">
        {/* Help text */}
        <p className="text-xs text-muted-foreground">
          Add buttons that will appear when viewing implementation plans. Use <code className="bg-muted px-1 rounded">{"{{IMPLEMENTATION_PLAN}}"}</code> for full content, <code className="bg-muted px-1 rounded">{"{{STEP_CONTENT}}"}</code> for specific steps.
        </p>
        
        {showAddButton && (
          <div className="flex items-center justify-end">
            <DesktopButton
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Button
            </DesktopButton>
          </div>
        )}

        {/* Create array of configurations and map to ButtonConfigurationCard */}
        {[
          {
            label: 'Parallel Claude Coding Agents',
            content: '{{IMPLEMENTATION_PLAN}}\\n**Now, think deeply!** Read the files mentioned, understand them and launch parallel Claude coding agents that run **at the same time** to save time and implement **every single aspect** of the perfect plan precisely and systematically...'
          },
          {
            label: 'Investigate Results',
            content: 'Investigate the results of **all agents** that were launched and ensure we have implemented the **complete plan correctly!** Perform a thorough self-check without launching background agents...'
          }
        ].map((config, _index) => (
          <div key={config.label} className="relative">
            <ButtonConfigurationCard config={config} />
          </div>
        ))}
      </div>
    </div>
  );
}
export default CopyButtonsMock;

