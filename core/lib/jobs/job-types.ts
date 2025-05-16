import { ApiType, TaskType } from '@core/types/session-types';

/**
 * Define the types of jobs that can be processed by the job system
 * Using a string literal type for compatibility with existing code
 */
export type JobType = 
  | 'GEMINI_REQUEST'
  | 'CLAUDE_REQUEST' 
  | 'VOICE_TRANSCRIPTION'
  | 'PATH_FINDER'
  | 'REGEX_GENERATION'
  | 'TEXT_IMPROVEMENT'
  | 'VOICE_CORRECTION'
  | 'TEXT_CORRECTION_POST_TRANSCRIPTION'
  | 'IMPLEMENTATION_PLAN'
  | 'GUIDANCE_GENERATION'
  | 'PATH_CORRECTION'
  | 'READ_DIRECTORY'
  | 'GENERIC_GEMINI_STREAM';

/**
 * Base interface for all job payloads
 */
export interface BaseJobPayload {
  backgroundJobId: string;
  sessionId: string;
  projectDirectory?: string;
}

/**
 * A job in the queue waiting to be processed
 */
export interface QueuedJob {
  id: string;
  type: JobType;
  payload: BaseJobPayload & Partial<AnyJobPayload>;
  priority: number;
  createdAt: number;
  attempt: number; // For retry logic
}

/**
 * Payload for Gemini API requests
 */
export interface GeminiRequestPayload extends BaseJobPayload {
  promptText: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  apiType?: ApiType;
  taskType?: TaskType;
  metadata?: {
    modelUsed?: string;
    estimatedInputTokens?: number;
    [key: string]: any;
  };
}

/**
 * Payload for Claude API requests
 */
export interface ClaudeRequestPayload extends BaseJobPayload {
  requestPayload: {
    messages: { role: string; content: string }[]; 
    max_tokens?: number;
    model?: string;
    system?: string; 
    temperature?: number;
  };
  claudeTaskType: TaskType | string;
  metadata?: {
    [key: string]: any;
  };
}

/**
 * Payload for voice transcription jobs
 */
export interface TranscriptionPayload extends BaseJobPayload {
  audioData: string; // Base64 encoded audio or path to temp file
  isBlob: boolean; // True if audioData is a blob, false if base64
  language: string;
  projectDirectory: string;
}

/**
 * Payload for path finder jobs
 */
export interface PathFinderPayload extends BaseJobPayload {
  taskDescription: string;
  projectDirectory: string;
  systemPrompt: string;
  modelOverride?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Payload for regex generation jobs
 */
export interface RegexGenerationPayload extends BaseJobPayload {
  taskDescription: string;
  directoryTree?: string;
  projectDirectory?: string;
}

/**
 * Payload for text improvement jobs
 */
export interface TextImprovementPayload extends BaseJobPayload {
  text: string;
  language?: string;
  mode?: string; // e.g., 'concise', 'professional'
  targetField?: string; // For UI updates
  apiType: ApiType; // To determine which LLM to use
}

/**
 * Payload for voice correction jobs
 */
export interface VoiceCorrectionPayload extends TextImprovementPayload {
  // Voice correction specific fields
  isTranscription?: boolean;
  confidenceScore?: number;
  speakerCount?: number;
  originalAudioDuration?: number;
}

/**
 * Payload for implementation plan generation jobs
 */
export interface ImplementationPlanPayload extends BaseJobPayload {
  relevantFiles: string[];
  originalTaskDescription: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Payload for guidance generation jobs
 */
export interface GuidanceGenerationPayload extends BaseJobPayload {
  promptText: string;
  paths?: string[]; // For generateGuidanceForPathsAction
  modelOverride?: string;
  systemPrompt?: string;
  temperature?: number; 
  maxOutputTokens?: number;
  model?: string;
}

/**
 * Payload for path correction jobs
 */
export interface PathCorrectionPayload extends BaseJobPayload {
  paths: string; // Raw paths string
  promptText: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}

/**
 * Payload for text correction after transcription
 */
export interface TextCorrectionPostTranscriptionPayload extends BaseJobPayload {
  textToCorrect: string;
  language: string;
  originalTranscriptionJobId?: string; // The job ID of the initial transcription
}

/**
 * Payload for generic Gemini streaming jobs
 */
export interface GenericGeminiStreamPayload extends BaseJobPayload {
  promptText: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  metadata?: {
    targetField?: string;
    [key: string]: any;
  };
}

/**
 * Union type of all possible job payloads for type safety
 */
export type AnyJobPayload = 
  | GeminiRequestPayload
  | ClaudeRequestPayload
  | TranscriptionPayload
  | PathFinderPayload
  | RegexGenerationPayload
  | TextImprovementPayload
  | VoiceCorrectionPayload
  | ImplementationPlanPayload
  | GuidanceGenerationPayload
  | PathCorrectionPayload
  | TextCorrectionPostTranscriptionPayload
  | GenericGeminiStreamPayload;