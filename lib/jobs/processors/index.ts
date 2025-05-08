import { jobRegistry } from '../job-registry';
import { GeminiRequestProcessor, PROCESSOR_TYPE as GEMINI_REQUEST_TYPE } from './gemini-request-processor';
import { ImplementationPlanProcessor, PROCESSOR_TYPE as IMPLEMENTATION_PLAN_TYPE } from './implementation-plan-processor';
import { PathFinderProcessor, PROCESSOR_TYPE as PATH_FINDER_TYPE } from './path-finder-processor';
import { TextCorrectionProcessor, PROCESSOR_TYPE as TEXT_CORRECTION_TYPE } from './text-correction-processor';
import { GuidanceGenerationProcessor, PROCESSOR_TYPE as GUIDANCE_GENERATION_TYPE } from './guidance-generation-processor';
import { PathCorrectionProcessor, PROCESSOR_TYPE as PATH_CORRECTION_TYPE } from './path-correction-processor';
import { RegexGenerationProcessor, PROCESSOR_TYPE as REGEX_GENERATION_TYPE } from './regex-generation-processor';
import { TextImprovementProcessor, PROCESSOR_TYPE as TEXT_IMPROVEMENT_TYPE } from './text-improvement-processor';
import { VoiceCorrectionProcessor, PROCESSOR_TYPE as VOICE_CORRECTION_TYPE } from './voice-correction-processor';
import { VoiceTranscriptionProcessor, PROCESSOR_TYPE as VOICE_TRANSCRIPTION_TYPE } from './voice-transcription-processor';
import { ReadDirectoryProcessor, PROCESSOR_TYPE as READ_DIRECTORY_TYPE } from './read-directory-processor';
import { GenericGeminiStreamProcessor, PROCESSOR_TYPE as GENERIC_GEMINI_STREAM_TYPE } from './generic-gemini-stream-processor';

/**
 * Register all available job processors with the registry
 * This function should be called during application startup
 */
export function registerAllProcessors(): void {
  console.log('[JobProcessors] Registering all job processors...');
  
  // Register processors
  jobRegistry.register(GEMINI_REQUEST_TYPE, new GeminiRequestProcessor());
  jobRegistry.register(IMPLEMENTATION_PLAN_TYPE, new ImplementationPlanProcessor());
  jobRegistry.register(PATH_FINDER_TYPE, new PathFinderProcessor());
  jobRegistry.register(TEXT_CORRECTION_TYPE, new TextCorrectionProcessor());
  jobRegistry.register(GUIDANCE_GENERATION_TYPE, new GuidanceGenerationProcessor());
  jobRegistry.register(PATH_CORRECTION_TYPE, new PathCorrectionProcessor());
  jobRegistry.register(REGEX_GENERATION_TYPE, new RegexGenerationProcessor());
  jobRegistry.register(TEXT_IMPROVEMENT_TYPE, new TextImprovementProcessor());
  jobRegistry.register(VOICE_CORRECTION_TYPE, new VoiceCorrectionProcessor());
  jobRegistry.register(VOICE_TRANSCRIPTION_TYPE, new VoiceTranscriptionProcessor());
  jobRegistry.register(READ_DIRECTORY_TYPE, new ReadDirectoryProcessor());
  jobRegistry.register(GENERIC_GEMINI_STREAM_TYPE, new GenericGeminiStreamProcessor());
  
  const registeredTypes = jobRegistry.getRegisteredJobTypes();
  console.log(`[JobProcessors] Registered ${registeredTypes.length} processor(s): ${registeredTypes.join(', ')}`);
}

// Export processor classes for individual registration if needed
export { 
  GeminiRequestProcessor,
  ImplementationPlanProcessor,
  PathFinderProcessor,
  TextCorrectionProcessor,
  GuidanceGenerationProcessor,
  PathCorrectionProcessor,
  RegexGenerationProcessor,
  TextImprovementProcessor,
  VoiceCorrectionProcessor,
  VoiceTranscriptionProcessor,
  ReadDirectoryProcessor,
  GenericGeminiStreamProcessor
};

// Register all processors when this module is imported
registerAllProcessors();