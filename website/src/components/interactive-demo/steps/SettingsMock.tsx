// Step 12: Settings Mock - Exact replica of desktop app settings UI
'use client';

import { DesktopSlider } from '../desktop-ui/DesktopSlider';
import { DesktopCard, DesktopCardContent } from '../desktop-ui/DesktopCard';
import { DesktopSelect, DesktopSelectOption } from '../desktop-ui/DesktopSelect';
import { DesktopInput } from '../desktop-ui/DesktopInput';
import { MonacoCodeViewer } from '../desktop-ui/MonacoCodeViewer';
import { useTweenNumber } from '../hooks';

export function SettingsMock({ isInView }: { isInView: boolean; resetKey?: number }) {
  // Main simulation timeline - ONE unified progression
  const { value: simulationProgress } = useTweenNumber({
    active: isInView,
    from: 0,
    to: 100,
    durationMs: 15000, // 15 second complete cycle
    loop: true
  });

  // REALISTIC USER INTERACTION SIMULATION
  // PHASE 1: Start with Regex File Filter - Default settings (0-15%)
  // PHASE 2: User clicks Implementation Plan in sidebar (15-20%)
  // PHASE 3: User switches to Custom prompt mode (20-25%)
  // PHASE 4: User types custom prompt (25-45%)
  // PHASE 5: User adjusts temperature for Implementation Plan (45-55%)
  // PHASE 6: User adjusts max tokens for Implementation Plan (55-65%)
  // PHASE 7: User switches back to Default prompt (65-70%)
  // PHASE 8: User clicks back to Regex File Filter (70-75%)
  // PHASE 9: Settings return to Regex File Filter defaults (75-100%)
  
  const isImplementationPlanSelected = simulationProgress > 15 && simulationProgress < 75;
  const isCustomMode = simulationProgress > 20 && simulationProgress < 65 && isImplementationPlanSelected;
  
  // Default prompts for different tasks
  const getDefaultPromptContent = (taskKey: string) => {
    switch (taskKey) {
      case "implementationPlan":
        return `You are an AI assistant specialized in generating implementation plans for software development tasks.

Analyze the requirements and break them down into clear, actionable steps that developers can follow to implement the requested features efficiently.

Focus on:
- Technical architecture decisions
- Step-by-step implementation approach
- Testing and validation strategies`;
      
      case "regexFileFilter":
      default:
        return `You are a targeted file filtering assistant that creates focused pattern groups for finding specific functionality.

Analyze the task and create an ARRAY of targeted pattern groups. Each group should focus on ONE specific aspect of the functionality.

{{DIRECTORY_TREE}}

## STRATEGY:
1. **Decompose** the task into logical functionality areas
2. **Create focused groups** – each targeting specific file types/functionality
3. **Use precise patterns** – narrow and specific within each group
4. **Path-based exclusions** – exclude irrelevant file paths per group`;
    }
  };

  // Mock task categories matching EXACT desktop structure
  const fileFinderStages = [
    { key: "regexFileFilter", name: "Regex File Filter", stageNumber: 1, nextStage: "Relevance Assessment" },
    { key: "fileRelevanceAssessment", name: "Relevance Assessment", stageNumber: 2, nextStage: "Extended Path Finding" },
    { key: "extendedPathFinder", name: "Extended Path Finding", stageNumber: 3, nextStage: "Path Correction" },
    { key: "pathCorrection", name: "Path Correction", stageNumber: 4, nextStage: null }
  ];

  const webSearchStages = [
    { key: "webSearchPromptsGeneration", name: "Prompts Generation", stageNumber: 1, nextStage: "Search Execution" },
    { key: "webSearchExecution", name: "Search Execution", stageNumber: 2, nextStage: null }
  ];

  const standaloneFeatures = [
    { key: "implementationPlan", name: "Implementation Plan" }, // Fixed: singular to match selectedTask
    { key: "mergeImplementationPlans", name: "Merge Implementation Plans" },
    { key: "taskRefinement", name: "Task Refinement" },
    { key: "textImprovement", name: "Text Improvement" },
    { key: "videoAnalysis", name: "Video Analysis" },
    { key: "voiceTranscription", name: "Voice Transcription" },
  ];
  
  // Task selection based on user interaction simulation
  const selectedTask = isImplementationPlanSelected 
    ? { key: "implementationPlan", name: "Implementation Plan" }
    : fileFinderStages[0]; // Regex File Filter

  // Custom typing for Implementation Plan during phase 4 (25-45%)
  const implementationPlanTyping = [
    "You are a senior software architect and project planner.",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.\n\nCore responsibilities:",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.\n\nCore responsibilities:\n- Analyze requirements and identify technical dependencies",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.\n\nCore responsibilities:\n- Analyze requirements and identify technical dependencies\n- Design scalable architecture patterns",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.\n\nCore responsibilities:\n- Analyze requirements and identify technical dependencies\n- Design scalable architecture patterns\n- Create step-by-step implementation guides with code examples",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.\n\nCore responsibilities:\n- Analyze requirements and identify technical dependencies\n- Design scalable architecture patterns\n- Create step-by-step implementation guides with code examples\n- Consider security, performance, and maintainability from the start",
    "You are a senior software architect and project planner.\n\nSpecialized in creating detailed, executable implementation roadmaps.\n\nCore responsibilities:\n- Analyze requirements and identify technical dependencies\n- Design scalable architecture patterns\n- Create step-by-step implementation guides with code examples\n- Consider security, performance, and maintainability from the start\n- Provide testing strategies and validation checkpoints"
  ];
  
  // Get the appropriate content based on current state
  const getPromptContent = () => {
    const defaultContent = getDefaultPromptContent(selectedTask?.key || '');
    
    if (!isCustomMode) {
      return defaultContent;
    }
    
    // Custom typing happens during phase 4 (25-45%)
    const typingStart = 25;
    const typingEnd = 45;
    const customTypingProgress = Math.max(0, Math.min(1, (simulationProgress - typingStart) / (typingEnd - typingStart)));
    const typingIndex = Math.floor(customTypingProgress * (implementationPlanTyping.length - 1));
    return implementationPlanTyping[Math.max(0, typingIndex)] || implementationPlanTyping[0];
  };
  
  const finalPromptContent = getPromptContent();

  // REALISTIC parameter adjustments - specific values for specific tasks
  const getTemperatureValue = () => {
    const taskKey = selectedTask?.key || '';
    
    if (taskKey === "implementationPlan") {
      // User adjusts temperature during phase 5 (45-55%)
      if (simulationProgress >= 45 && simulationProgress <= 55) {
        const adjustProgress = (simulationProgress - 45) / 10; // 0-1
        return 0.3 + (adjustProgress * 0.4); // Animate from 0.3 to 0.7
      }
      return simulationProgress > 55 ? 0.7 : 0.3; // Final value or initial
    }
    
    // Regex File Filter uses lower temperature for precision
    return 0.2;
  };

  const getMaxTokensValue = () => {
    const taskKey = selectedTask?.key || '';
    
    if (taskKey === "implementationPlan") {
      // User adjusts max tokens during phase 6 (55-65%)
      if (simulationProgress >= 55 && simulationProgress <= 65) {
        const adjustProgress = (simulationProgress - 55) / 10; // 0-1
        return Math.round(8000 + (adjustProgress * 12000)); // Animate from 8000 to 20000
      }
      return simulationProgress > 65 ? 20000 : 8000; // Final value or initial
    }
    
    // Regex File Filter needs fewer tokens
    return 6000;
  };

  const temperatureValue = getTemperatureValue();
  const maxTokensValue = getMaxTokensValue();

  return (
    <div className="w-full">
      <div className="mt-4">
          <div className="text-sm text-muted-foreground mb-4">
            Configure AI model preferences and system prompts for each task type. Select a task from the sidebar to view and edit its complete configuration.
          </div>
          
          <DesktopCard>
            <DesktopCardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-4">
                {/* Left Sidebar - EXACT desktop structure with feeds into arrows */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    {/* File Finder Stages Section with feeds into arrows */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">File Finder Stages</h3>
                      </div>
                      <div className="space-y-1 pl-2 border-l-2 border-muted">
                        {fileFinderStages.map((stage) => {
                          const isSelected = stage.key === selectedTask?.key;
                          return (
                            <div key={stage.key} className="space-y-1">
                              <button
                                className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                                  isSelected 
                                    ? 'bg-primary/20 text-white border border-primary/60 shadow-md font-medium' 
                                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                                }`}
                                aria-pressed={isSelected}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-mono">
                                      {stage.stageNumber}
                                    </span>
                                    <span>{stage.name}</span>
                                  </div>
                                </div>
                              </button>
                              {stage.nextStage && (
                                <div className="pl-6 text-xs text-muted-foreground flex items-center gap-1">
                                  <span>↓ feeds into</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Web Search Stages Section */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Web Search Stages</h3>
                      </div>
                      <div className="space-y-1 pl-2 border-l-2 border-muted">
                        {webSearchStages.map((stage) => {
                          const isSelected = stage.key === selectedTask?.key;
                          return (
                            <div key={stage.key} className="space-y-1">
                              <button
                                className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                                  isSelected 
                                    ? 'bg-primary/20 text-white border border-primary/60 shadow-md font-medium' 
                                    : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                                }`}
                                aria-pressed={isSelected}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-mono">
                                      {stage.stageNumber}
                                    </span>
                                    <span>{stage.name}</span>
                                  </div>
                                </div>
                              </button>
                              {stage.nextStage && (
                                <div className="pl-6 text-xs text-muted-foreground flex items-center gap-1">
                                  <span>↓ feeds into</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Standalone Features Section with ALL items */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Standalone Features</h3>
                      </div>
                      <div className="space-y-1 pl-2">
                        {standaloneFeatures.map((feature) => {
                          const isSelected = feature.key === selectedTask?.key;
                          return (
                            <button
                              key={feature.key}
                              className={`w-full text-left p-2 rounded-md text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer ${
                                isSelected 
                                  ? 'bg-primary/20 text-white border border-primary/60 shadow-md font-medium' 
                                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                              }`}
                              aria-pressed={isSelected}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span>{feature.name}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
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
                          <button 
                            type="button" 
                            disabled={true} 
                            className={`
                              flex items-center h-7 px-3 text-xs border-0 rounded-none transition-all duration-200 backdrop-blur-sm whitespace-nowrap
                              ${!isCustomMode 
                                ? 'teal-glow-subtle shadow-teal text-white font-bold cursor-pointer opacity-50 cursor-default' 
                                : 'hover:bg-accent/30 text-muted-foreground hover:text-accent-foreground cursor-pointer opacity-50 cursor-default'
                              }
                            `}
                            style={!isCustomMode ? {
                              background: 'linear-gradient(135deg, oklch(0.48 0.15 195), oklch(0.58 0.12 195))',
                              border: '1px solid oklch(0.68 0.08 195)'
                            } : {}}
                          >
                            Default
                          </button>
                          <div className="w-[1px] h-6 bg-border/40"></div>
                          <button 
                            type="button" 
                            disabled={true} 
                            className={`
                              flex items-center h-7 px-3 text-xs border-0 rounded-none transition-all duration-200 backdrop-blur-sm whitespace-nowrap
                              ${isCustomMode 
                                ? 'teal-glow-subtle shadow-teal text-white font-bold cursor-pointer opacity-50 cursor-default' 
                                : 'hover:bg-accent/30 text-muted-foreground hover:text-accent-foreground cursor-pointer opacity-50 cursor-default'
                              }
                            `}
                            style={isCustomMode ? {
                              background: 'linear-gradient(135deg, oklch(0.48 0.15 195), oklch(0.58 0.12 195))',
                              border: '1px solid oklch(0.68 0.08 195)'
                            } : {}}
                          >
                            Custom
                          </button>
                        </div>
                      </div>
                      
                      <MonacoCodeViewer
                        title="System Prompt"
                        content={finalPromptContent || ''}
                        language="plaintext"
                        height="240px"
                        showCopy={true}
                        copyText="Copy Prompt"
                      />
                      
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
                          value="google/gemini-2.5-pro"
                          className="w-full"
                        >
                          <DesktopSelectOption value="google/gemini-2.5-pro">
                            Google Gemini 2.5 Pro
                          </DesktopSelectOption>
                          <DesktopSelectOption value="anthropic/claude-sonnet-4-20250514">
                            Anthropic Claude Sonnet 4
                          </DesktopSelectOption>
                          <DesktopSelectOption value="openai/o3">
                            OpenAI o3
                          </DesktopSelectOption>
                          <DesktopSelectOption value="openai/gpt-5">
                            OpenAI GPT-5
                          </DesktopSelectOption>
                          <DesktopSelectOption value="deepseek/deepseek-r1-0528">
                            DeepSeek R1
                          </DesktopSelectOption>
                          <DesktopSelectOption value="moonshotai/kimi-k2">
                            Moonshot Kimi K2
                          </DesktopSelectOption>
                          <DesktopSelectOption value="xai/grok-4">
                            xAI Grok 4
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
                              min={4096}
                              max={23000}
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
        </div>
    </div>
  );
}
export default SettingsMock;

