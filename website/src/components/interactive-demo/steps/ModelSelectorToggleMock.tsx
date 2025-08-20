// Step 17: Model Selector Toggle Mock - Ultra-simplified, always renders
'use client';

import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';

const modelOptions = [
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude-3.5-Sonnet',
    description: 'Most capable model for complex reasoning',
    contextWindow: '200K tokens',
    isActive: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Multimodal AI with vision capabilities',
    contextWindow: '128K tokens',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini-1.5-Pro',
    description: 'Google\'s most advanced AI model',
    contextWindow: '2M tokens',
  },
];

export function ModelSelectorToggleMock({ progress }: { isInView: boolean; progress: number }) {
  const showWarning = progress >= 0.25;
  const showContextWarning = progress >= 0.5;

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">AI Model Selection</h3>
        <p className="text-sm text-muted-foreground">
          Choose the AI model that best fits your workflow needs
        </p>
      </div>

      <DesktopCard>
        <DesktopCardContent className="p-6">
          <div className="space-y-4">
            {modelOptions.map((model) => (
              <div
                key={model.id}
                className={`
                  relative p-4 rounded-lg border-2 transition-all duration-300 cursor-pointer
                  ${model.isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-4 h-4 rounded-full border-2 transition-colors
                        ${model.isActive
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground'
                        }
                      `}>
                        {model.isActive && (
                          <div className="w-2 h-2 bg-primary-foreground rounded-full m-0.5" />
                        )}
                      </div>
                      <h4 className="font-medium">{model.name}</h4>
                      <DesktopBadge variant="outline" className="text-xs">
                        {model.contextWindow}
                      </DesktopBadge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 ml-7">
                      {model.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DesktopCardContent>
      </DesktopCard>

      {/* Warning Section */}
      {showWarning && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="font-medium">Model Performance Notice</span>
          </div>
          <p className="text-sm text-muted-foreground ml-7">
            Different models may produce varying results for the same prompt. Consider testing with multiple models for optimal results.
          </p>
          
          {showContextWarning && (
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 ml-7">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    Context Window Exceeded
                  </p>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                    Your current conversation may be too long for Claude-3.5-Sonnet. Consider starting a new conversation or switching to Gemini-1.5-Pro.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}