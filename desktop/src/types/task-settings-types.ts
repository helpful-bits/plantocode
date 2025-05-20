/**
 * Task settings type definitions
 */

export interface TaskModelSettings {
  model: string;
  maxTokens: number;
  temperature: number;
}

/**
 * TaskSettings interface using camelCase for all keys
 */
export interface TaskSettings {
  pathFinder: TaskModelSettings;
  transcription: TaskModelSettings;
  regexGeneration: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  voiceCorrection: TaskModelSettings;
  taskEnhancement: TaskModelSettings;
  guidanceGeneration: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
  [key: string]: TaskModelSettings;
}
