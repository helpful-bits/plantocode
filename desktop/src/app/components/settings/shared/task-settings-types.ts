import { type TaskType } from "@/types/task-type-defs";
import { type TaskSettings } from "@/types";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const taskSettingsKeyToTaskType: Record<keyof TaskSettings, TaskType> = {
  voiceTranscription: "voice_transcription",
  pathCorrection: "path_correction",
  textImprovement: "text_improvement",
  implementationPlan: "implementation_plan",
  implementationPlanMerge: "implementation_plan_merge",
  extendedPathFinder: "extended_path_finder",
  fileRelevanceAssessment: "file_relevance_assessment",
  taskRefinement: "task_refinement",
  genericLlmStream: "generic_llm_stream",
  regexFileFilter: "regex_file_filter",
  rootFolderSelection: "root_folder_selection",
  streaming: "streaming",
  unknown: "unknown",
  webSearchPromptsGeneration: "web_search_prompts_generation",
  webSearchExecution: "web_search_execution",
  videoAnalysis: "video_analysis",
};

export const TRANSCRIPTION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
] as const;