import { WriteStream } from "fs";

/**
 * Result of processing an SSE event
 */
export interface SSEEventResult {
  success: boolean;
  content: string | null;
  tokenCount: number;
  charCount: number;
}

/**
 * Process a Server-Sent Event (SSE) from the Gemini API
 * @param eventData The raw event data from the SSE stream
 * @param writeStream Optional write stream to save content
 * @param taskType Optional task type to control processing behavior
 */
export function processSseEvent(eventData: string, writeStream: WriteStream | null, taskType?: string): SSEEventResult {
  try {
    // Default result object
    const result: SSEEventResult = {
      success: false,
      content: null,
      tokenCount: 0,
      charCount: 0
    };
    
    // Parse the JSON data from the event
    const data = JSON.parse(eventData);
    
    // Handle error responses
    if (data.error) {
      console.error(`[Gemini Streaming] API Error:`, data.error);
      return result;
    }
    
    // If response has no candidates, it's likely an empty event
    if (!data.candidates || data.candidates.length === 0) {
      // This is normal for the final event in a sequence
      return { ...result, success: true };
    }
    
    // Extract content from the first candidate
    const candidate = data.candidates[0];
    
    // If we don't have content or parts, it's likely an empty/control event
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      // This is typical for initial event or empty update
      return { ...result, success: true };
    }
    
    // Get the text content from the parts array
    const text = candidate.content.parts[0].text || '';
    
    // Write to file if we have a stream and content
    if (writeStream && text) {
      try {
        // Safely write to stream
        writeStream.write(text);
      } catch (writeError) {
        console.error(`[Gemini Streaming] Error writing to stream:`, writeError);
      }
    }
    
    // Return structured result with content and count metrics
    result.success = true;
    result.content = text;
    
    // Calculate approximate token count (3-4 chars per token, erring on the side of caution)
    const approxTokens = Math.ceil(text.length / 3.5);
    result.tokenCount = approxTokens;
    result.charCount = text.length;
    
    return result;
  } catch (error) {
    console.error(`[Gemini Streaming] Error processing SSE event:`, error, eventData);
    return {
      success: false,
      content: null,
      tokenCount: 0,
      charCount: 0
    };
  }
}

/**
 * Extract and clean XML content from model output
 * Handles common issues like markdown fences, leading/trailing text, etc.
 * 
 * @param rawContent The raw content from the model
 * @returns Cleaned XML content or null if no valid XML found
 */
export async function extractXmlContent(rawContent: string): Promise<string | null> {
  if (!rawContent) return null;
  
  // 1. First, try to find content between markdown code fences
  const markdownMatch = rawContent.match(/```(?:xml)?([\s\S]*?)```/);
  const contentToProcess = markdownMatch ? markdownMatch[1].trim() : rawContent;
  
  // 2. Look for XML declaration and changes tag
  const xmlDeclMatch = contentToProcess.match(/<\?xml[^>]*\?>/);
  const changesTagMatch = contentToProcess.match(/<changes[^>]*>/);
  
  if (!xmlDeclMatch || !changesTagMatch) {
    // If we don't have both XML declaration and changes tag,
    // try a last resort approach to find anything that looks like XML
    const lastResortMatch = contentToProcess.match(/<\?xml[\s\S]*<\/changes>/);
    if (lastResortMatch) {
      return lastResortMatch[0];
    }
    return null;
  }
  
  // Get the positions of the XML declaration and changes tag
  const xmlDeclPos = contentToProcess.indexOf(xmlDeclMatch[0]);
  const changesOpenPos = contentToProcess.indexOf(changesTagMatch[0]);
  
  // Find the closing changes tag
  const changesClosePos = contentToProcess.lastIndexOf('</changes>');
  
  // If we have all the required parts, extract the XML
  if (xmlDeclPos >= 0 && changesOpenPos >= 0 && changesClosePos >= 0) {
    return contentToProcess.substring(xmlDeclPos, changesClosePos + 10); // 10 = '</changes>'.length
  }
  
  return null;
}