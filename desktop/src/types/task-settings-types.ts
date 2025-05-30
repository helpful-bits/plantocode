export interface TaskModelSettings {
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface TaskSettings {
  pathFinder: TaskModelSettings;
  transcription: TaskModelSettings;
  regexGeneration: TaskModelSettings;
  regexSummaryGeneration: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  textCorrection: TaskModelSettings;
  taskEnhancement: TaskModelSettings;
  guidanceGeneration: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
}
