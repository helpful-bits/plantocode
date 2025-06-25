import { TaskModelSettings as BaseTaskModelSettings } from './config-types';

export interface TaskModelSettings extends BaseTaskModelSettings {
  languageCode?: string;
}

export interface TaskSettings {
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
  fileRelevanceAssessment: TaskModelSettings;
  extendedPathFinder: TaskModelSettings;
}
