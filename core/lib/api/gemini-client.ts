// Re-export the new modular Gemini client implementation
import geminiClient from './clients/gemini';

// Export the client as the default export
export default geminiClient;

// Re-export only types from modular implementation (not the default export)
export type {
  GeminiRequestPayload,
  GeminiResponse,
  GeminiSdkRequestPayload,
  StreamCallbacks,
  StreamingUpdateCallback
} from './clients/gemini'; 