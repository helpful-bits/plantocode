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
  transcription: TaskModelSettings; // Corresponds to voice_transcription
  regexGeneration: TaskModelSettings;
  regexSummaryGeneration: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  textCorrectionPostTranscription: TaskModelSettings;
  voiceCorrection: TaskModelSettings;
  taskEnhancement: TaskModelSettings;
  guidanceGeneration: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  generateDirectoryTree: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
  [key: string]: TaskModelSettings; // Keep for flexibility if strictly needed, but prefer explicit keys
}
