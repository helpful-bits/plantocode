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
  fileFinderWorkflow: "file_finder_workflow",
  extendedPathFinder: "extended_path_finder",
  fileRelevanceAssessment: "file_relevance_assessment",
  taskRefinement: "task_refinement",
  genericLlmStream: "generic_llm_stream",
  regexFileFilter: "regex_file_filter",
  streaming: "streaming",
  unknown: "unknown",
};

export const TRANSCRIPTION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
] as const;