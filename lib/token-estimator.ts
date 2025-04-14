"use server";

// Simple GPT-4 token estimation based on characters
// This is a rough estimate - for precise counts use a tokenizer library
export async function estimateTokens(text: string): Promise<number> { // Added async keyword
  // GPT-4 uses about 4 characters per token on average for English text
  return Math.ceil((text || "").length / 4); // Handle potential null/undefined text
  // Note: This is a very rough estimate. Actual token count depends on the specific tokenizer used by the model.
}