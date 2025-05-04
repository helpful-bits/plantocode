// Re-export the new modular Gemini client implementation
import geminiClient from './clients/gemini';

// Export the client as the default export
export default geminiClient;

// Re-export all types and functions from modular implementation
export * from './clients/gemini'; 