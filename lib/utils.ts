import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Helper function to strip common markdown code fences from the beginning and end of a string.
 * Handles variations like ```diff, ```patch, ```, etc.
 * @param content The string content potentially containing code fences.
 * @returns The content with leading/trailing fences removed.
 */
export function stripMarkdownCodeFences(content: string): string {
    // Match potential fences at the beginning or end, considering optional language identifiers and surrounding whitespace/newlines.
    // Regex handles ```, ```diff, ```patch, etc., at start and end.
    // Group 1 captures the actual content *between* the fences if both are present.
    // Group 2 captures content if only a start fence is present (multiline match needed).
    // Group 3 captures content if only an end fence is present (multiline match needed).
    // Handles optional language identifiers and surrounding whitespace/newlines.
    const fenceRegex = /^\s*```(?:[a-zA-Z0-9\-_]*)\s*?\r?\n([\s\S]*?)\r?\n\s*```\s*$|^\s*```(?:[a-zA-Z0-9\-_]*)\s*?\r?\n([\s\S]+)|([\s\S]+?)\r?\n\s*```\s*$/;

    const match = content.match(fenceRegex);

    if (match) {
        // Return the captured group that is not undefined, prioritizing the full match (group 1)
        return (match[1] ?? match[2] ?? match[3] ?? content).trim();
    }
    return content;
}