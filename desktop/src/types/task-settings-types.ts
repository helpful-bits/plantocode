import { TaskModelSettings as BaseTaskModelSettings } from './config-types';

export interface TaskModelSettings extends BaseTaskModelSettings {
  languageCode?: string;
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
