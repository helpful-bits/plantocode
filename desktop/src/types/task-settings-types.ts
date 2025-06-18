import { CopyButtonConfig } from './config-types';

export interface TaskModelSettings {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  languageCode?: string;
  copyButtons?: CopyButtonConfig[];
}

export interface TaskSettings {
  pathFinder: TaskModelSettings;
  voiceTranscription: TaskModelSettings;
  regexPatternGeneration: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  taskRefinement: TaskModelSettings;
  guidanceGeneration: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  fileFinderWorkflow: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
  // New individual workflow stage types
  localFileFiltering: TaskModelSettings;
  fileRelevanceAssessment: TaskModelSettings;
  extendedPathFinder: TaskModelSettings;
  extendedPathCorrection: TaskModelSettings;
}
