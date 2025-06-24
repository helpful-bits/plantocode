import { TaskModelSettings as BaseTaskModelSettings } from './config-types';

export interface TaskModelSettings extends BaseTaskModelSettings {
  languageCode?: string;
}

export interface TaskSettings {
  pathFinder: TaskModelSettings;
  voiceTranscription: TaskModelSettings;
  regexFileFilter: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  taskRefinement: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  fileFinderWorkflow: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
  // New individual workflow stage types
  localFileFiltering: TaskModelSettings;
  fileRelevanceAssessment: TaskModelSettings;
  extendedPathFinder: TaskModelSettings;
}
