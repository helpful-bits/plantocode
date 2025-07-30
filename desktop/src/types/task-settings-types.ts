import { TaskModelSettings as BaseTaskModelSettings } from './config-types';

export interface TaskModelSettings extends BaseTaskModelSettings {
}

export interface VoiceTranscriptionSettings extends TaskModelSettings {
  languageCode?: string;
  prompt?: string;
}

export interface TaskSettings {
  voiceTranscription: VoiceTranscriptionSettings;
  regexFileFilter: TaskModelSettings;
  pathCorrection: TaskModelSettings;
  textImprovement: TaskModelSettings;
  taskRefinement: TaskModelSettings;
  implementationPlan: TaskModelSettings;
  implementationPlanMerge: TaskModelSettings;
  genericLlmStream: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
  fileRelevanceAssessment: TaskModelSettings;
  extendedPathFinder: TaskModelSettings;
  webSearchPromptsGeneration?: TaskModelSettings;
  webSearchExecution?: TaskModelSettings;
  videoAnalysis: TaskModelSettings;
}
