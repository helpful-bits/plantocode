// Model Selector Toggle Mock - exact desktop styling with mobile responsive layout
'use client';

import { DesktopModelSelectorToggle } from '../desktop-ui/DesktopModelSelectorToggle';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { useTimedLoop } from '../hooks';

// Models matching the screenshot: Claude 4 Sonnet, Gemini 3 Pro, GPT-5.2, GPT-o3, DeepSeek R1 (0528), Kimi K2, Grok 4
const models = [
  { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet' },
  { id: 'gemini-2.5-pro', name: 'Gemini 3 Pro' },
  { id: 'gpt-5', name: 'GPT-5.2' },
  { id: 'gpt-o3', name: 'GPT-o3' },
  { id: 'deepseek-r1-0528', name: 'DeepSeek R1 (0528)' },
  { id: 'kimi-k2', name: 'Kimi K2' },
  { id: 'grok-4', name: 'Grok 4' },
];

export function ModelSelectorToggleMock({ isInView }: { isInView: boolean }) {
  const { t } = useTimedLoop(isInView, 20000, { resetOnDeactivate: true });
  
  // Natural model selection timing - BEFORE button clicks for realistic flow
  // User selects model → clicks button → processing starts  
  let selectedModelId = 'gpt-5'; // Default start
  let isModelChanging = false; // For visual feedback during selection changes
  
  if (t >= 0.10 && t < 0.30) {
    selectedModelId = 'gpt-5'; // Selected at 0.10, used for clicks at 0.12 & 0.22
    isModelChanging = t >= 0.095 && t <= 0.105; // Brief highlight during selection
  } else if (t >= 0.30) {
    selectedModelId = 'gemini-2.5-pro'; // Switched at 0.30, used for clicks at 0.32 & 0.42
    isModelChanging = t >= 0.295 && t <= 0.305; // Brief highlight during switch
  }

  return (
    <div className="flex justify-center">
      {/* Desktop: single connected toggle */}
      <div className={`hidden sm:block transition-all duration-200 ${isModelChanging ? 'scale-105 teal-glow' : ''}`}>
        <DesktopModelSelectorToggle
          models={models}
          selectedModelId={selectedModelId}
          disabled={true}
        />
      </div>
      
      {/* Mobile: individual buttons in rows */}
      <div className={`sm:hidden flex flex-col gap-2 transition-all duration-200 ${isModelChanging ? 'scale-105' : ''}`}>
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

