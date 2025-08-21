// Model Selector Toggle Mock - exact desktop styling with mobile responsive layout
'use client';

import { DesktopModelSelectorToggle } from '../desktop-ui/DesktopModelSelectorToggle';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { useTimedLoop } from '../hooks';

// Models matching the screenshot: Claude 4 Sonnet, Gemini 2.5 Pro, GPT-5, GPT-o3, DeepSeek R1 (0528), Kimi K2, Grok 4
const models = [
  { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gpt-5', name: 'GPT-5' },
  { id: 'gpt-o3', name: 'GPT-o3' },
  { id: 'deepseek-r1-0528', name: 'DeepSeek R1 (0528)' },
  { id: 'kimi-k2', name: 'Kimi K2' },
  { id: 'grok-4', name: 'Grok 4' },
];

export function ModelSelectorToggleMock({ isInView }: { isInView: boolean }) {
  const { t } = useTimedLoop(isInView, 8000, { resetOnDeactivate: true });
  
  // Cycle through different selected models
  const selectedModelIndex = Math.floor(t * models.length);
  const selectedModelId = models[selectedModelIndex]?.id || 'gpt-5';

  return (
    <div className="flex justify-center">
      {/* Desktop: single connected toggle */}
      <div className="hidden sm:block">
        <DesktopModelSelectorToggle
          models={models}
          selectedModelId={selectedModelId}
          disabled={true}
        />
      </div>
      
      {/* Mobile: individual buttons in rows */}
      <div className="sm:hidden flex flex-col gap-2">
        {/* Row 1: First 3 models */}
        <div className="flex gap-2 justify-center">
          {models.slice(0, 3).map((model) => (
            <DesktopButton
              key={model.id}
              variant={selectedModelId === model.id ? "filter-active" : "filter"}
              size="xs"
              disabled={true}
              className="h-7 px-3 text-xs whitespace-nowrap"
            >
              {model.name}
            </DesktopButton>
          ))}
        </div>
        
        {/* Row 2: Next 2 models */}
        <div className="flex gap-2 justify-center">
          {models.slice(3, 5).map((model) => (
            <DesktopButton
              key={model.id}
              variant={selectedModelId === model.id ? "filter-active" : "filter"}
              size="xs"
              disabled={true}
              className="h-7 px-3 text-xs whitespace-nowrap"
            >
              {model.name}
            </DesktopButton>
          ))}
        </div>
        
        {/* Row 3: Last 2 models */}
        <div className="flex gap-2 justify-center">
          {models.slice(5, 7).map((model) => (
            <DesktopButton
              key={model.id}
              variant={selectedModelId === model.id ? "filter-active" : "filter"}
              size="xs"
              disabled={true}
              className="h-7 px-3 text-xs whitespace-nowrap"
            >
              {model.name}
            </DesktopButton>
          ))}
        </div>
      </div>
    </div>
  );
}
export default ModelSelectorToggleMock;

