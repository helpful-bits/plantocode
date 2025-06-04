export interface TaskModelSettings {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TaskSettings {
  pathFinder: TaskModelSettings;
  voiceTranscription: TaskModelSettings;
  regexPatternGeneration: TaskModelSettings;
  regexSummaryGeneration: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  textCorrection: TaskModelSettings;
  taskEnhancement: TaskModelSettings;
  guidanceGeneration: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  fileFinderWorkflow: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
  // New individual workflow stage types
  localFileFiltering: TaskModelSettings;
  extendedPathFinder: TaskModelSettings;
  extendedPathCorrection: TaskModelSettings;
}
