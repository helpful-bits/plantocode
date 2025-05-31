import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


/**
 * Helper function to strip markdown code fences from XML content.
 * Matches the backend logic in xml_utils::extract_xml_from_markdown.
 * Prioritizes explicit ```xml fences, then generic fences containing XML-like content.
 * @param content The string content potentially containing code fences.
 * @returns The content with fences removed if they contain XML, otherwise original content.
 */
export function stripMarkdownCodeFences(content: string): string {
  const trimmedContent = content.trim();
  if (!trimmedContent) return "";

  // First try to match explicit XML fences (consistent with backend pattern)
  const xmlFencePattern = /```xml\s*\n?([\s\S]*?)\n?```/;
  const xmlMatch = trimmedContent.match(xmlFencePattern);
  if (xmlMatch && xmlMatch[1] !== undefined) {
    return xmlMatch[1].trim();
  }

  // Fall back to generic fences that contain XML content
  const genericFencePattern = /```\s*\n?([\s\S]*?)\n?```/;
  const genericMatch = trimmedContent.match(genericFencePattern);
  if (genericMatch && genericMatch[1] !== undefined) {
    const innerContent = genericMatch[1].trim();
    // Only return if it looks like XML (consistent with backend logic)
    if (innerContent.startsWith('<')) {
      return innerContent;
    }
  }

  // If no fence containing XML is found, return original trimmed content
  return trimmedContent;
}
