// Step 12: Settings Mock - Exact replica of desktop app settings UI
'use client';

import { 
  DesktopTabs, 
  DesktopTabsList, 
  DesktopTabsTrigger, 
  DesktopTabsContent 
} from '../desktop-ui/DesktopTabs';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopSlider } from '../desktop-ui/DesktopSlider';
import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopSelect, DesktopSelectOption } from '../desktop-ui/DesktopSelect';
import { DesktopInput } from '../desktop-ui/DesktopInput';
import { useTweenNumber } from '../hooks';

interface TaskCategory {
  name: string;
  tasks: { key: string; name: string; isActive?: boolean }[];
}

export function SettingsMock({ isInView }: { isInView: boolean; resetKey?: number }) {
  // Use time-based tweening for values as specified - tweening from 0.7 to 1.0 for temperature
  const { value: temperatureProgress } = useTweenNumber({
    active: isInView,
    from: 0,
    to: 100,
    durationMs: 3000
  });
  const { value: maxTokensProgress } = useTweenNumber({
    active: isInView,
    from: 0,
    to: 100,
    durationMs: 3000
  });
  
  // Map progress to the actual ranges with looping behavior
  const temperatureValue = 0.7 + (0.3 * temperatureProgress / 100);
  const maxTokensValue = Math.round(2048 + (2048 * maxTokensProgress / 100));
  
  // Mock task categories matching desktop structure
  const categories: TaskCategory[] = [
    {
      name: "Workflows",
      tasks: [
        { key: "implementationPlan", name: "Implementation Plan", isActive: temperatureProgress > 30 },
        { key: "mergeInstructions", name: "Merge Instructions" },
      ]
    },
    {
      name: "File Finder Stages", 
      tasks: [
        { key: "regexFileFilter", name: "Regex File Filter" },
        { key: "fileRelevanceAssessment", name: "Relevance Assessment" },
        { key: "extendedPathFinder", name: "Extended Path Finding" },
        { key: "pathCorrection", name: "Path Correction" }
      ]
    },
    {
      name: "Standalone Features",
      tasks: [
        { key: "textImprovement", name: "Text Improvement" },
        { key: "voiceTranscription", name: "Voice Transcription" },
      ]
    }
  ];
  
  const selectedTask = categories[0]?.tasks[0];

  return (
    <div className="w-full">
      <DesktopTabs className="w-full">
        <DesktopTabsList className="grid w-full grid-cols-2">
          <DesktopTabsTrigger isActive={true}>
            General
          </DesktopTabsTrigger>
          <DesktopTabsTrigger isActive={false}>
            Legal
          </DesktopTabsTrigger>
        </DesktopTabsList>

        <DesktopTabsContent className="mt-4">
          <div className="text-sm text-muted-foreground mb-4">
            Configure AI model preferences and system prompts for each task type. Select a task from the sidebar to view and edit its complete configuration.
          </div>
          
          <DesktopCard>
            <DesktopCardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
                {/* Left Sidebar - Task Categories */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    {categories.map((category, categoryIdx) => (
                      <div key={categoryIdx} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{category.name}</h3>
                        </div>
                        <div className={`space-y-1 pl-2 ${
                          category.name.includes('Finder') ? 'border-l-2 border-muted' : ''
                        }`}>
                          {category.tasks.map((task, taskIdx) => {
                            const isSelected = task.key === selectedTask?.key;
                            return (
                              <DesktopButton
                                key={taskIdx}
                                variant={isSelected ? "filter-active" : "filter"}
                                size="sm"
                                className="w-full text-left p-2 rounded-md text-sm h-auto justify-start"
                                aria-pressed={isSelected}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {category.name.includes('Finder') && (
                                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-mono">
                                        {taskIdx + 1}
                                      </span>
                                    )}
                                    <span>{task.name}</span>
                                  </div>
                                </div>
                              </DesktopButton>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Right Panel - Task Settings */}
                <div className="min-h-[600px] space-y-6">
                  {/* System Prompt Section */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">System Prompt</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Default system prompt</p>
                        </div>
                        <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
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
                      
                      <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-border/50">
                          <span className="text-sm font-medium text-muted-foreground">SYSTEM PROMPT</span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(450 + (temperatureProgress * 2))} chars
                          </span>
                        </div>
                        <div className="p-4 font-mono text-sm max-h-40 overflow-y-auto">
                          <div className="whitespace-pre-wrap text-muted-foreground">
                            You are an AI assistant specialized in generating implementation plans for software development tasks...
                            {temperatureProgress > 50 && '\n\nProvide detailed, actionable steps that developers can follow to implement the requested features efficiently.'}
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        This system prompt defines the AI's behavior and capabilities
                      </p>
                    </div>
                  </div>
                  
                  {/* Model Parameters Section */}
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Model Parameters</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {/* Model Selection */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Model</label>
                        </div>
                        <DesktopSelect 
                          value="claude-3-5-sonnet-20241022"
                          className="w-full"
                        >
                          <DesktopSelectOption value="claude-3-5-sonnet-20241022">
                            Claude 3.5 Sonnet
                          </DesktopSelectOption>
                          <DesktopSelectOption value="gpt-4o">
                            GPT-4o
                          </DesktopSelectOption>
                          <DesktopSelectOption value="gemini-1.5-pro">
                            Gemini 1.5 Pro
                          </DesktopSelectOption>
                        </DesktopSelect>
                      </div>
                      
                      {/* Temperature */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Temperature</label>
                        </div>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 min-w-[120px]">
                            <DesktopSlider
                              value={temperatureValue}
                              min={0}
                              max={1}
                              step={0.05}
                              className="w-full"
                            />
                          </div>
                          <DesktopInput
                            type="text"
                            value={temperatureValue.toFixed(2)}
                            className="w-24 font-mono text-sm text-right"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-balance">
                          Lower (0.0-0.3): factual and precise. Higher (0.7-1.0): creative and varied.
                        </p>
                      </div>
                      
                      {/* Max Tokens */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Max Tokens</label>
                        </div>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex-1 min-w-[120px]">
                            <DesktopSlider
                              value={maxTokensValue}
                              min={1000}
                              max={8000}
                              step={100}
                              className="w-full"
                            />
                          </div>
                          <DesktopInput
                            type="text"
                            value={maxTokensValue.toLocaleString()}
                            className="w-24 font-mono text-sm text-right"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground text-balance">
                          Maximum length of AI responses (higher = longer responses)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DesktopCardContent>
          </DesktopCard>
        </DesktopTabsContent>
      </DesktopTabs>
    </div>
  );
}
export default SettingsMock;

