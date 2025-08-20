// Step 12: Settings Mock - Exact replica of desktop app settings UI
'use client';

import { 
  DesktopTabs, 
  DesktopTabsList, 
  DesktopTabsTrigger, 
  DesktopTabsContent 
} from '../desktop-ui/DesktopTabs';
import { DesktopSlider } from '../desktop-ui/DesktopSlider';
import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopSelect, DesktopSelectOption } from '../desktop-ui/DesktopSelect';
import { DesktopInput } from '../desktop-ui/DesktopInput';

interface TaskCategory {
  name: string;
  tasks: { key: string; name: string; isActive?: boolean }[];
}

export function SettingsMock({ progress }: { isInView: boolean; progress: number }) {
  const temperatureValue = Math.min(1, 0.7 + (progress * 0.3));
  const maxTokensValue = Math.round(2048 + (progress * 2048));
  
  // Mock task categories matching desktop structure
  const categories: TaskCategory[] = [
    {
      name: "Workflows",
      tasks: [
        { key: "implementationPlan", name: "Implementation Plan", isActive: progress > 0.3 },
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
                              <button
                                key={taskIdx}
                                className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                                  isSelected 
                                    ? 'bg-primary/10 text-primary border border-primary/20' 
                                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                                }`}
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
                              </button>
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
                          <button className="px-3 h-7 text-xs bg-accent text-accent-foreground">
                            Default
                          </button>
                          <div className="w-[1px] h-5 bg-border/40" />
                          <button className="px-3 h-7 text-xs bg-background text-muted-foreground hover:bg-accent/50">
                            Custom
                          </button>
                        </div>
                      </div>
                      
                      <div className="border border-border rounded-lg bg-muted/30 overflow-hidden">
                        <div className="flex items-center justify-between p-3 border-b border-border/50">
                          <span className="text-sm font-medium text-muted-foreground">SYSTEM PROMPT</span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(450 + (progress * 200))} chars
                          </span>
                        </div>
                        <div className="p-4 font-mono text-sm max-h-40 overflow-y-auto">
                          <div className="whitespace-pre-wrap text-muted-foreground">
                            You are an AI assistant specialized in generating implementation plans for software development tasks...
                            {progress > 0.5 && '\n\nProvide detailed, actionable steps that developers can follow to implement the requested features efficiently.'}
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