"use server";

import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { ActionState } from '@/types';
import { getAllNonIgnoredFiles, invalidateFileCache } from '@/lib/git-utils';
import { normalizePath } from '@/lib/path-utils';
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';

// Use the flash model directly from constants
const PATH_CORRECTION_MODEL = GEMINI_FLASH_MODEL;

interface PathCorrectionResult {
    correctedPaths: string[];
    originalPaths: string[];
    correctionsMade: Record<string, string | null>; // Maps original invalid path to corrected path (or null if no correction)
}

export async function correctPathsAction(
    projectDirectory: string,
    pastedPathsString: string
): Promise<ActionState<PathCorrectionResult>> {
    if (!projectDirectory) {
        return { isSuccess: false, message: "Project directory is required." };
    }
    if (!pastedPathsString.trim()) {
        return { isSuccess: false, message: "No paths provided to correct." };
    }

    try {
        // Invalidate file cache before reading to ensure we get the latest list
        await invalidateFileCache(projectDirectory);

        // 1. Get all valid files in the project
        const { files: validProjectFiles } = await getAllNonIgnoredFiles(projectDirectory);
        const validProjectFileSet = new Set(validProjectFiles.map(p => normalizePath(p, projectDirectory)));

        // 2. Parse and validate pasted paths
        const originalPaths = pastedPathsString
            .split('\n')
            .map(p => p.trim())
            .filter(p => p && !p.startsWith('#'));

        const validatedPaths: { original: string; normalized: string; isValid: boolean }[] = [];
        const invalidPaths: string[] = [];

        for (const originalPath of originalPaths) {
            const normalized = normalizePath(originalPath, projectDirectory);
            let isValid = false;

            // Check if it's a valid project file (relative)
            if (validProjectFileSet.has(normalized)) {
                isValid = true;
            } else {
                // Check if it's an existing absolute path (external file)
                try {
                    const absolutePath = path.resolve(originalPath); // Resolve to absolute
                    if (existsSync(absolutePath)) {
                       const stats = await fs.stat(absolutePath);
                       if (stats.isFile()) { // Ensure it's a file
                           isValid = true;
                       }
                    }
                } catch (e) { /* Ignore errors during absolute path check */ }
            }

            validatedPaths.push({ original: originalPath, normalized: normalized, isValid });
            if (!isValid) {
                invalidPaths.push(originalPath); // Use original path for reporting/correction
            }
        }

        if (invalidPaths.length === 0) {
            return {
                isSuccess: true,
                message: "All paths are valid.",
                data: { correctedPaths: originalPaths, originalPaths, correctionsMade: {} }
            };
        }

        // 3. Use AI to suggest corrections for invalid paths
        const systemPrompt = `You are an expert system analyzing file paths. Given a list of potentially incorrect file paths and a list of all valid file paths within a project, suggest the most likely correct path from the valid list for each incorrect path. Focus on finding close matches based on spelling, structure, and common typos.`;

        const userPrompt = `Invalid Paths:\n${invalidPaths.join('\n')}

Valid Project Files:\n${validProjectFiles.join('\n')}

Output ONLY a JSON object mapping each invalid path to its most likely correction from the 'Valid Project Files' list, or null if no confident correction can be made. Example:
{
  "src/componens/Button.tsx": "src/components/Button.tsx",
  "utils/helpers.js": "lib/helpers.ts",
  "non/existent/file.md": null
}`;

        console.log(`[PathCorrection] Using Gemini model: ${PATH_CORRECTION_MODEL} for path correction`);
        const aiResult = await geminiClient.sendRequest(userPrompt, {
          model: PATH_CORRECTION_MODEL,
          systemPrompt,
        });

        if (!aiResult.isSuccess || !aiResult.data) {
            return { isSuccess: false, message: `AI correction failed: ${aiResult.message || 'No response'}` };
        }

        let correctionsMade: Record<string, string | null> = {};
        try {
            // Handle case where the AI returns JSON wrapped in Markdown code blocks
            let jsonData = aiResult.data;
            
            // Check if response is wrapped in markdown code blocks
            const markdownJsonRegex = /```(?:json)?\s*([\s\S]*?)```/;
            const match = markdownJsonRegex.exec(jsonData);
            
            if (match && match[1]) {
                // Extract the JSON content from the markdown code block
                jsonData = match[1].trim();
                console.log("Extracted JSON from markdown code block");
            } else {
                // Fallback: try to find a JSON object directly in the response
                const jsonObjectRegex = /(\{[\s\S]*?\})/;
                const objectMatch = jsonObjectRegex.exec(jsonData);
                if (objectMatch && objectMatch[1]) {
                    jsonData = objectMatch[1].trim();
                    console.log("Extracted JSON object directly from response");
                }
            }
            
            // Ensure we have a valid JSON object that starts with {
            if (!jsonData.trim().startsWith('{')) {
                console.error("Invalid JSON format - doesn't start with {:", jsonData);
                return { isSuccess: false, message: "AI returned data in an invalid format (not a JSON object)." };
            }
            
            correctionsMade = JSON.parse(jsonData);
        } catch (e) {
            console.error("Failed to parse AI correction response:", e);
            console.error("Raw response data:", aiResult.data);
            return { isSuccess: false, message: "AI returned invalid correction format." };
        }

        // 4. Construct the final list of paths
        const correctedPaths = originalPaths.map(originalPath => {
            // If the path was invalid and a correction exists, use the correction
            return correctionsMade[originalPath] ?? originalPath;
        });

        return {
            isSuccess: true,
            message: `Corrected ${Object.values(correctionsMade).filter(v => v !== null).length} out of ${invalidPaths.length} invalid paths.`,
            data: { correctedPaths, originalPaths, correctionsMade }
        };

    } catch (error) {
        console.error('Error in correctPathsAction:', error);
        return { isSuccess: false, message: `Failed to correct paths: ${error instanceof Error ? error.message : String(error)}` };
    }
}
